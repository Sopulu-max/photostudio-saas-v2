'use server';

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { revalidatePath } from 'next/cache';
import { getDeliverablesForPackages } from '@/modules/packages/interface';

/**
 * Delivery — handing finished work to the client.
 *
 * A delivery is a named bundle of files for a booking, with its own share
 * link (draft ⇄ shared) and access model: files live in a private bucket,
 * the client gallery is served through short-lived signed URLs, so the share
 * link is the only capability and nothing is publicly readable.
 *
 * Archiving is a separate, orthogonal flag (archived_at), not a third status
 * value — it's the studio's own bookkeeping ("this one's superseded by the
 * final gallery"), and never touches whether a delivery is actually shared.
 * A shared-and-archived delivery's link keeps working exactly as before.
 */

const SIGNED_URL_TTL_SECONDS = 60 * 60; // an hour — long enough to browse and download

export async function createDelivery(input: { bookingId: string; title: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const title = (input.title || '').trim();
  if (!title) throw new Error('Give this delivery a name.');

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id')
    .eq('id', input.bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!booking) throw new Error('Booking not found');

  const { data: delivery, error } = await supabaseAdmin
    .from('deliveries')
    .insert({ organization_id: orgId, booking_id: input.bookingId, title })
    .select('id')
    .single();
  if (error || !delivery) {
    console.error('Failed to create delivery:', error);
    throw new Error('Failed to create delivery');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'delivery',
    entityId: delivery.id,
    action: 'created',
    actorId: actorId ?? undefined,
    payload: { bookingId: input.bookingId, title },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { deliveryId: delivery.id };
}

/** Rename a delivery. Was write-once — a typo had no fix. */
export async function updateDelivery(input: { deliveryId: string; bookingId: string; title: string }) {
  const { orgId } = await getAuthOrgId();
  const title = (input.title || '').trim();
  if (!title) throw new Error('Give this delivery a name.');

  const { error } = await supabaseAdmin
    .from('deliveries')
    .update({ title })
    .eq('id', input.deliveryId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to rename the delivery');

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/**
 * Remove a delivery entirely — its files and the storage objects behind
 * them. If it's currently shared, this also kills the client's link (there's
 * nothing left to serve); the caller's confirmation copy should say so.
 */
export async function deleteDelivery(input: { deliveryId: string; bookingId: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: deliveryAssets } = await supabaseAdmin
    .from('delivery_assets')
    .select('asset:assets(storage_path)')
    .eq('delivery_id', input.deliveryId)
    .eq('organization_id', orgId);

  // We do NOT delete the underlying assets from storage when a delivery is deleted.
  // The asset belongs to the production graph; the delivery is just a container.
  
  await supabaseAdmin.from('delivery_assets').delete().eq('delivery_id', input.deliveryId).eq('organization_id', orgId);

  const { error } = await supabaseAdmin
    .from('deliveries')
    .delete()
    .eq('id', input.deliveryId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to delete delivery:', error);
    throw new Error('Failed to delete the delivery');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'delivery',
    entityId: input.deliveryId,
    action: 'deleted',
    actorId: actorId ?? undefined,
    payload: { bookingId: input.bookingId, fileCount: deliveryAssets?.length ?? 0 },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/** Mark a delivery superseded, without touching its share state either way. */
export async function archiveDelivery(input: { deliveryId: string; bookingId: string }) {
  const { orgId } = await getAuthOrgId();
  const { error } = await supabaseAdmin
    .from('deliveries')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', input.deliveryId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to archive the delivery');

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

export async function unarchiveDelivery(input: { deliveryId: string; bookingId: string }) {
  const { orgId } = await getAuthOrgId();
  const { error } = await supabaseAdmin
    .from('deliveries')
    .update({ archived_at: null })
    .eq('id', input.deliveryId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to restore the delivery');

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/**
 * Where a file for this delivery should be stored. The path is org-scoped so a
 * tenant's files are never interleaved with another's.
 */
export async function getUploadTarget(deliveryId: string, fileName: string) {
  const { orgId } = await getAuthOrgId();

  const { data: delivery } = await supabaseAdmin
    .from('deliveries')
    .select('id')
    .eq('id', deliveryId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!delivery) throw new Error('Delivery not found');

  const safeName = fileName.replace(/[^\w.\-]/g, '_');
  return { bucket: 'deliveries', path: `${orgId}/${deliveryId}/${randomUUID()}-${safeName}` };
}

/** Record an uploaded file against the delivery (called after the upload lands). 
 * This creates a Production Asset and then links it to the Delivery Container.
 */
export async function registerFile(input: {
  deliveryId: string;
  bookingId: string;
  storagePath: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  // If the delivery covers exactly one promised type, every file in it is that
  // type and we can say so. With two or more, nothing here knows which file is
  // the album and which is a photo, so the asset stays untyped rather than
  // guessing — a wrong type is worse than none.
  const { data: covers } = await supabaseAdmin
    .from('delivery_deliverables')
    .select('deliverable_id')
    .eq('organization_id', orgId)
    .eq('delivery_id', input.deliveryId);
  const deliverableId = (covers || []).length === 1 ? (covers as any[])[0].deliverable_id : null;

  // 1. Register the Production Asset
  const { data: asset, error: assetError } = await supabaseAdmin
    .from('assets')
    .insert({
      organization_id: orgId,
      booking_id: input.bookingId,
      storage_path: input.storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType || null,
      size_bytes: input.sizeBytes ?? null,
      deliverable_id: deliverableId,
      state: 'final', // Directly uploaded to delivery implies it's final
    })
    .select('id')
    .single();

  if (assetError || !asset) {
    console.error('Failed to create asset:', assetError);
    throw new Error('Failed to save the file as an asset');
  }

  // 2. Link it to the Delivery Container
  const { data: deliveryAsset, error } = await supabaseAdmin
    .from('delivery_assets')
    .insert({
      organization_id: orgId,
      delivery_id: input.deliveryId,
      asset_id: asset.id,
    })
    .select('id')
    .single();

  if (error || !deliveryAsset) {
    console.error('Failed to link asset to delivery:', error);
    throw new Error('Failed to save the file');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'delivery',
    entityId: input.deliveryId,
    action: 'file_added',
    actorId: actorId ?? undefined,
    payload: { fileName: input.fileName, assetId: asset.id },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { fileId: deliveryAsset.id };
}

export async function removeFile(input: { fileId: string; bookingId: string }) {
  const { orgId } = await getAuthOrgId();

  // Removing from the delivery just unlinks it. The asset remains.
  // The UI currently passes what it thinks is the 'fileId', which is now the 'delivery_asset.id'.
  const { data: deliveryAsset } = await supabaseAdmin
    .from('delivery_assets')
    .select('id, asset_id')
    .eq('id', input.fileId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!deliveryAsset) throw new Error('File link not found');

  await supabaseAdmin.from('delivery_assets').delete().eq('id', input.fileId).eq('organization_id', orgId);

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/** Share the delivery: mint the capability token and open the gallery. */
export async function shareDelivery(input: { deliveryId: string; bookingId: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { count } = await supabaseAdmin
    .from('delivery_assets')
    .select('id', { count: 'exact', head: true })
    .eq('delivery_id', input.deliveryId)
    .eq('organization_id', orgId);
  if (!count) throw new Error('Add at least one file before sharing.');

  const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, '');

  const { error } = await supabaseAdmin
    .from('deliveries')
    .update({ status: 'shared', share_token: token, shared_at: new Date().toISOString() })
    .eq('id', input.deliveryId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to share delivery:', error);
    throw new Error('Failed to share');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'delivery',
    entityId: input.deliveryId,
    action: 'shared',
    actorId: actorId ?? undefined,
    payload: { fileCount: count },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { shareToken: token };
}

export async function unshareDelivery(input: { deliveryId: string; bookingId: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('deliveries')
    .update({ status: 'draft', share_token: null, shared_at: null })
    .eq('id', input.deliveryId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to revoke the link');

  await logEvent({
    organizationId: orgId,
    entityType: 'delivery',
    entityId: input.deliveryId,
    action: 'unshared',
    actorId: actorId ?? undefined,
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/**
 * Declare which promised deliverable types this bundle satisfies. Replace-
 * wholesale, so removals are expressed by absence.
 *
 * This is a claim about fulfilment, not about file contents — the studio is
 * saying "this is the album we owed them". Nothing infers it from the files,
 * because no file extension knows what was sold.
 */
export async function setDeliveryFulfils(input: {
  deliveryId: string;
  bookingId: string;
  deliverableIds: string[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: delivery } = await supabaseAdmin
    .from('deliveries')
    .select('id')
    .eq('id', input.deliveryId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!delivery) throw new Error('Delivery not found');

  // A delivery can only claim what the booking actually promised — otherwise
  // the outstanding list could be cleared by pointing at something nobody sold.
  const promised = await getPromisedDeliverables(input.bookingId);
  const promisedIds = new Set(promised.map((p) => p.id));
  const ids = [...new Set(input.deliverableIds)].filter(Boolean);
  const stray = ids.find((id) => !promisedIds.has(id));
  if (stray) throw new Error('That deliverable is not part of what this booking promised.');

  await supabaseAdmin
    .from('delivery_deliverables')
    .delete()
    .eq('organization_id', orgId)
    .eq('delivery_id', input.deliveryId);

  if (ids.length > 0) {
    const { error } = await supabaseAdmin.from('delivery_deliverables').insert(
      ids.map((deliverable_id) => ({ organization_id: orgId, delivery_id: input.deliveryId, deliverable_id }))
    );
    if (error) {
      console.error('Failed to set what this delivery fulfils:', error);
      throw new Error('Failed to save what this delivery covers');
    }
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'delivery',
    entityId: input.deliveryId,
    action: 'fulfilment_set',
    actorId: actorId ?? undefined,
    payload: { bookingId: input.bookingId, count: ids.length },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/** Every deliverable type this booking's packages promised, deduplicated. */
export async function getPromisedDeliverables(bookingId: string): Promise<{ id: string; name: string }[]> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('booking_lines')
    .select('package_id')
    .eq('organization_id', orgId)
    .eq('booking_id', bookingId);
  const packageIds = [...new Set(((data || []) as any[]).map((l) => l.package_id).filter(Boolean))];
  return getDeliverablesForPackages(packageIds);
}

/**
 * What was promised and whether it has been handed over — the answer to
 * "is anything still outstanding on this booking?".
 *
 * Archived deliveries still count as fulfilment. Archiving means superseded
 * bookkeeping, not undelivered; a studio that supersedes a preview gallery
 * with the finals has not un-delivered the photos.
 */
export async function getFulfilmentForBooking(bookingId: string) {
  const promised = await getPromisedDeliverables(bookingId);
  if (promised.length === 0) return [];

  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('delivery_deliverables')
    .select('deliverable_id, delivery:deliveries!inner(id, title, status, booking_id)')
    .eq('organization_id', orgId)
    .eq('delivery.booking_id', bookingId);

  const byDeliverable = new Map<string, { id: string; title: string; status: string }[]>();
  for (const row of ((data || []) as any[])) {
    if (!row.delivery) continue;
    const list = byDeliverable.get(row.deliverable_id) || [];
    list.push({ id: row.delivery.id, title: row.delivery.title, status: row.delivery.status });
    byDeliverable.set(row.deliverable_id, list);
  }

  return promised.map((p) => {
    const covering = byDeliverable.get(p.id) || [];
    return {
      id: p.id,
      name: p.name,
      deliveries: covering,
      // Bundled but not yet sent is not delivered. The client has to be able
      // to reach it for the promise to be kept.
      shared: covering.some((d) => d.status === 'shared'),
      covered: covering.length > 0,
    };
  });
}

/** The deliveries on a booking, with their files — what the hub renders. */
export async function listDeliveriesForBooking(bookingId: string) {
  const { orgId } = await getAuthOrgId();

  const { data, error } = await supabaseAdmin
    .from('deliveries')
    .select('id, title, status, share_token, shared_at, last_viewed_at, archived_at, delivery_assets(id, position, asset:assets(id, file_name, mime_type, size_bytes)), delivery_deliverables(deliverable:deliverables(id, name))')
    .eq('organization_id', orgId)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to list deliveries:', error);
    throw new Error('Failed to load deliveries');
  }

  return (data || []).map((d: any) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    shareToken: d.share_token,
    sharedAt: d.shared_at,
    lastViewedAt: d.last_viewed_at,
    archivedAt: d.archived_at,
    fulfils: (d.delivery_deliverables || [])
      .map((dd: any) => dd.deliverable)
      .filter(Boolean)
      .map((x: any) => ({ id: x.id, name: x.name })),
    files: (d.delivery_assets || []).sort((a: any, b: any) => a.position - b.position).map((da: any) => ({
      id: da.id, // ID of the link, used for deletion
      file_name: da.asset?.file_name,
      mime_type: da.asset?.mime_type,
      size_bytes: da.asset?.size_bytes,
      asset_id: da.asset?.id,
    })),
  }));
}

/**
 * The client-facing gallery for a share token. Public: no session. Returns
 * signed URLs so files stay private in storage, and stamps the view.
 */
export async function getGalleryByToken(token: string) {
  if (!token) return null;

  const { data: delivery } = await supabaseAdmin
    .from('deliveries')
    .select('id, title, status, organization_id, booking:bookings(title), delivery_assets(id, position, asset:assets(id, file_name, mime_type, storage_path))')
    .eq('share_token', token)
    .maybeSingle();

  if (!delivery || delivery.status !== 'shared') return null;

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', delivery.organization_id)
    .maybeSingle();

  const sortedAssets = ((delivery as any).delivery_assets || []).sort((a: any, b: any) => a.position - b.position);
  const files = await Promise.all(
    sortedAssets.map(async (da: any) => {
      const f = da.asset;
      if (!f || !f.storage_path) return null;
      const { data: signed, error: signError } = await supabaseAdmin.storage
        .from('deliveries')
        .createSignedUrl(f.storage_path, SIGNED_URL_TTL_SECONDS);
      // A file that fails to sign was silently dropping out of the gallery
      // with no trace anywhere — at least log it, so a missing file is
      // diagnosable instead of just "the gallery looked a bit short."
      if (signError) console.error(`Failed to sign delivery asset ${f.id} (${f.storage_path}):`, signError);
      return {
        id: da.id, // Delivery Asset Link ID
        assetId: f.id,
        name: f.file_name,
        mimeType: f.mime_type,
        url: signed?.signedUrl || null,
        isImage: (f.mime_type || '').startsWith('image/'),
      };
    })
  );
  
  const validFiles = files.filter(Boolean);

  // Stamp the view so the studio can see it landed.
  await supabaseAdmin
    .from('deliveries')
    .update({ last_viewed_at: new Date().toISOString() })
    .eq('id', delivery.id);

  return {
    title: delivery.title,
    studioName: org?.name || 'Studio',
    bookingTitle: (delivery as any).booking?.title || null,
    files: validFiles,
  };
}
