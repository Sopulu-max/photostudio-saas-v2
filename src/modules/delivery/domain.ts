'use server';

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { revalidatePath } from 'next/cache';

/**
 * Delivery — handing finished work to the client.
 *
 * A delivery is a named bundle of files for a booking, with its own share link
 * and state (draft → shared → archived). Files live in a private bucket; the
 * client gallery is served through short-lived signed URLs, so the share link
 * is the only capability and nothing is publicly readable.
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

/** Record an uploaded file against the delivery (called after the upload lands). */
export async function registerFile(input: {
  deliveryId: string;
  bookingId: string;
  storagePath: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: file, error } = await supabaseAdmin
    .from('delivery_files')
    .insert({
      organization_id: orgId,
      delivery_id: input.deliveryId,
      storage_path: input.storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType || null,
      size_bytes: input.sizeBytes ?? null,
    })
    .select('id')
    .single();
  if (error || !file) {
    console.error('Failed to register file:', error);
    throw new Error('Failed to save the file');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'delivery',
    entityId: input.deliveryId,
    action: 'file_added',
    actorId: actorId ?? undefined,
    payload: { fileName: input.fileName },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { fileId: file.id };
}

export async function removeFile(input: { fileId: string; bookingId: string }) {
  const { orgId } = await getAuthOrgId();

  const { data: file } = await supabaseAdmin
    .from('delivery_files')
    .select('id, storage_path')
    .eq('id', input.fileId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!file) throw new Error('File not found');

  await supabaseAdmin.storage.from('deliveries').remove([file.storage_path]);
  await supabaseAdmin.from('delivery_files').delete().eq('id', input.fileId).eq('organization_id', orgId);

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/** Share the delivery: mint the capability token and open the gallery. */
export async function shareDelivery(input: { deliveryId: string; bookingId: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { count } = await supabaseAdmin
    .from('delivery_files')
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

/** The deliveries on a booking, with their files — what the hub renders. */
export async function listDeliveriesForBooking(bookingId: string) {
  const { orgId } = await getAuthOrgId();

  const { data, error } = await supabaseAdmin
    .from('deliveries')
    .select('id, title, status, share_token, shared_at, last_viewed_at, delivery_files(id, file_name, mime_type, size_bytes)')
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
    files: d.delivery_files || [],
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
    .select('id, title, status, organization_id, booking:bookings(title), delivery_files(id, file_name, mime_type, storage_path)')
    .eq('share_token', token)
    .maybeSingle();

  if (!delivery || delivery.status !== 'shared') return null;

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', delivery.organization_id)
    .maybeSingle();

  const files = await Promise.all(
    ((delivery as any).delivery_files || []).map(async (f: any) => {
      const { data: signed } = await supabaseAdmin.storage
        .from('deliveries')
        .createSignedUrl(f.storage_path, SIGNED_URL_TTL_SECONDS);
      return {
        id: f.id,
        name: f.file_name,
        mimeType: f.mime_type,
        url: signed?.signedUrl || null,
        isImage: (f.mime_type || '').startsWith('image/'),
      };
    })
  );

  // Stamp the view so the studio can see it landed.
  await supabaseAdmin
    .from('deliveries')
    .update({ last_viewed_at: new Date().toISOString() })
    .eq('id', delivery.id);

  return {
    title: delivery.title,
    studioName: org?.name || 'Studio',
    bookingTitle: (delivery as any).booking?.title || null,
    files,
  };
}
