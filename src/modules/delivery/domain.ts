'use server';

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { assertOurs } from '@/kernel/tenancy';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { revalidatePath } from 'next/cache';
import { getDeliverablesForPackages } from '@/modules/packages/interface';
import { GALLERY_RENDITIONS, type GalleryRendition } from './renditions';
// The deliverable edges belong to the module that defines a deliverable.
import {
  setDeliveryDeliverables, listDeliveryDeliverableIds,
  listDeliveredDeliverableIdsForBooking,
} from '@/modules/deliverables/domain';
import { DELIVERY_FULFILS } from '@/modules/deliverables/shape';

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
  await assertOurs(orgId, [
    { table: 'deliveries', id: input.deliveryId, label: 'delivery' },
    { table: 'bookings', id: input.bookingId, label: 'booking' },
  ]);

  // If the delivery covers exactly one promised type, every file in it is that
  // type and we can say so. With two or more, nothing here knows which file is
  // the album and which is a photo, so the asset stays untyped rather than
  // guessing — a wrong type is worse than none.
  const covers = await listDeliveryDeliverableIds(input.deliveryId);
  const deliverableId = covers.length === 1 ? covers[0] : null;

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

/**
 * Choose the image the gallery opens with. Passing null clears it, and the
 * gallery falls back to its first image — a delivery is never coverless, it
 * just may not have been told which one to lead with.
 */
export async function setDeliveryCover(input: {
  deliveryId: string;
  bookingId: string;
  deliveryAssetId: string | null;
}) {
  const { orgId } = await getAuthOrgId();

  // A cover has to be one of this delivery's own images. Without this check the
  // id is an open door onto any delivery_asset row in the tenant.
  if (input.deliveryAssetId) {
    const { data: link } = await supabaseAdmin
      .from('delivery_assets')
      .select('id')
      .eq('id', input.deliveryAssetId)
      .eq('delivery_id', input.deliveryId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!link) throw new Error('That file is not part of this delivery.');
  }

  const { error } = await supabaseAdmin
    .from('deliveries')
    .update({ cover_asset_id: input.deliveryAssetId })
    .eq('id', input.deliveryId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to set delivery cover:', error);
    throw new Error('Failed to set the cover image');
  }

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/**
 * One image out of a shared gallery, as a signed URL at the requested size.
 *
 * This exists because the gallery page used to sign every file up front: a
 * 400-image delivery made 400 storage calls before a single byte of HTML went
 * out, and every one of them expired an hour later mid-browse. Now the page
 * ships plain <img> tags pointing back here and the browser asks for what it
 * actually scrolls to.
 *
 * Public by design — the share token is the whole capability, exactly as it is
 * for the gallery itself. The asset must belong to the delivery that token
 * opens, so a valid token for one gallery cannot read another's files.
 */
export async function resolveGalleryAsset(
  token: string,
  deliveryAssetId: string,
  size: GalleryRendition
): Promise<{ url: string; fileName: string } | null> {
  if (!token || !deliveryAssetId) return null;

  const { data: delivery } = await supabaseAdmin
    .from('deliveries')
    .select('id, status')
    .eq('share_token', token)
    .maybeSingle();
  if (!delivery || delivery.status !== 'shared') return null;

  const { data: link } = await supabaseAdmin
    .from('delivery_assets')
    .select('id, asset:assets(storage_path, file_name)')
    .eq('id', deliveryAssetId)
    .eq('delivery_id', delivery.id)
    .maybeSingle();

  const asset = (link as any)?.asset;
  if (!asset?.storage_path) return null;

  const transform = size === 'original' ? undefined : GALLERY_RENDITIONS[size];
  const { data: signed, error } = await supabaseAdmin.storage
    .from('deliveries')
    .createSignedUrl(asset.storage_path, SIGNED_URL_TTL_SECONDS, transform ? { transform } : undefined);

  if (error || !signed?.signedUrl) {
    console.error(`Failed to sign gallery asset ${deliveryAssetId} (${asset.storage_path}):`, error);
    return null;
  }

  return { url: signed.signedUrl, fileName: asset.file_name || 'download' };
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
    payload: { bookingId: input.bookingId, fileCount: count },
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
  // Which makes the booking the thing doing the constraining, so it has to be
  // ours before its promises are worth anything.
  await assertOurs(orgId, [{ table: 'bookings', id: input.bookingId, label: 'booking' }]);
  const promised = await getPromisedDeliverables(input.bookingId);
  const promisedIds = new Set(promised.map((p) => p.id));
  const ids = [...new Set(input.deliverableIds)].filter(Boolean);
  const stray = ids.find((id) => !promisedIds.has(id));
  if (stray) throw new Error('That deliverable is not part of what this booking promised.');

  // Delivery decides WHICH promises these files close out; writing the link is
  // Deliverables', the same rule the package and service edges follow.
  await setDeliveryDeliverables({ deliveryId: input.deliveryId, deliverableIds: ids });

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
  const data = await listDeliveredDeliverableIdsForBooking(bookingId);

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
    // Pinned to the delivery_id key for the same reason as the gallery query:
    // cover_asset_id makes a bare `delivery_assets` embed ambiguous.
    .select(`id, title, status, share_token, shared_at, last_viewed_at, archived_at, cover_asset_id, delivery_assets!delivery_assets_delivery_id_fkey(id, position, asset:assets(id, file_name, mime_type, size_bytes)), ${DELIVERY_FULFILS}`)
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
    coverAssetId: d.cover_asset_id,
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
 * Every gallery in the studio, newest first — the index a booking cannot give.
 *
 * Deliveries hang off bookings, so on their own they answer "what did we send
 * for this job?" but never "which galleries are still sitting unsent, and who
 * has actually opened theirs?". Same edges, read across the organization
 * instead of down one booking.
 */
export async function listGalleries(): Promise<{
  id: string;
  title: string;
  status: string;
  shareToken: string | null;
  sharedAt: string | null;
  lastViewedAt: string | null;
  createdAt: string;
  bookingId: string | null;
  bookingTitle: string | null;
  clientName: string | null;
  fileCount: number;
}[]> {
  const { orgId } = await getAuthOrgId();

  const { data, error } = await supabaseAdmin
    .from('deliveries')
    // Pinned to the delivery_id key: cover_asset_id makes a bare embed ambiguous.
    .select('id, title, status, share_token, shared_at, last_viewed_at, archived_at, created_at, booking:bookings(id, title, contact:contacts(display_name)), delivery_assets!delivery_assets_delivery_id_fkey(id)')
    .eq('organization_id', orgId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to list galleries:', error);
    throw new Error('Failed to load galleries');
  }

  return (data || []).map((d: any) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    shareToken: d.share_token,
    sharedAt: d.shared_at,
    lastViewedAt: d.last_viewed_at,
    createdAt: d.created_at,
    bookingId: d.booking?.id ?? null,
    bookingTitle: d.booking?.title ?? null,
    clientName: d.booking?.contact?.display_name ?? null,
    fileCount: (d.delivery_assets || []).length,
  }));
}

/**
 * The client-facing gallery for a share token. Public: no session.
 *
 * Returns file *metadata* and nothing else — no signed URLs. Each image is
 * fetched back through `resolveGalleryAsset` by the browser as it scrolls, so
 * opening a gallery costs one query no matter how many photographs are in it.
 * Files stay private in storage either way; the token is still the only key.
 */
export async function getGalleryByToken(token: string) {
  if (!token) return null;

  const { data: delivery, error } = await supabaseAdmin
    .from('deliveries')
    // The embed is pinned to the delivery_id foreign key by name: `cover_asset_id`
    // points back at delivery_assets too, so an unqualified embed is ambiguous
    // and PostgREST refuses it outright.
    .select('id, title, status, organization_id, booking_id, last_viewed_at, cover_asset_id, booking:bookings(title, contact_id), delivery_assets!delivery_assets_delivery_id_fkey(id, position, asset:assets(id, file_name, mime_type, size_bytes, storage_path))')
    .eq('share_token', token)
    .maybeSingle();

  // A malformed select resolves to data: null here, which is indistinguishable
  // from "no such gallery" and renders as a 404 the client cannot explain and
  // the studio cannot debug. Say so in the log; still a 404 to the visitor.
  if (error) console.error('Failed to load gallery by token:', error);
  if (!delivery || delivery.status !== 'shared') return null;

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name, metadata')
    .eq('id', delivery.organization_id)
    .maybeSingle();

  const sortedAssets = ((delivery as any).delivery_assets || []).sort((a: any, b: any) => a.position - b.position);
  const validFiles = sortedAssets
    .filter((da: any) => da.asset?.storage_path)
    .map((da: any) => ({
      id: da.id, // Delivery Asset Link ID — what the asset route takes
      assetId: da.asset.id,
      name: da.asset.file_name,
      mimeType: da.asset.mime_type,
      sizeBytes: da.asset.size_bytes,
      isImage: (da.asset.mime_type || '').startsWith('image/'),
    }));

  // The chosen cover, if it is still one of the files; otherwise lead with the
  // first image so a gallery nobody configured still opens with a picture.
  const images = validFiles.filter((f: any) => f.isImage);
  const chosenCover = images.find((f: any) => f.id === (delivery as any).cover_asset_id);
  const cover = chosenCover || images[0] || null;

  // Stamp the view so the studio can see it landed.
  const firstView = !(delivery as any).last_viewed_at;
  await supabaseAdmin
    .from('deliveries')
    .update({ last_viewed_at: new Date().toISOString() })
    .eq('id', delivery.id);

  // The client opening the gallery is the studio finding out the work landed —
  // one of the few things that happens entirely outside the app. Only the first
  // view is an event: every refresh after that is the same news repeated, and a
  // notification feed that repeats itself stops being read.
  if (firstView) {
    await logEvent({
      organizationId: delivery.organization_id,
      entityType: 'delivery',
      entityId: delivery.id,
      action: 'viewed',
      actorId: (delivery as any).booking?.contact_id || undefined,
      payload: { bookingId: (delivery as any).booking_id, title: delivery.title },
    });
  }

  return {
    token,
    title: delivery.title,
    studioName: org?.name || 'Studio',
    studioLogoUrl: ((org?.metadata as any) || {}).logo_url || null,
    bookingTitle: (delivery as any).booking?.title || null,
    cover,
    files: validFiles,
  };
}
