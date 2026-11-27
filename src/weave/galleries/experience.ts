'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import {
  assertVisitorCanAccessGallery, assertVisitorCanUseGalleryFile, visitorCanAccessGallery,
  visitorPersonForGallery, type GalleryVisitorGate,
} from './actions';
import type { ClientHubRequest } from './shape';

const BUCKET = 'weave-files';
type HubPurpose = 'selection' | 'album' | 'retouch' | 'approval';

async function visitorHubMember(input: { token: string; email: string; requestId: string }) {
  const { data: gallery } = await db.from('galleries')
    .select('id, studio_id, token, shared_at, expires_on, access_mode, access_code_hash')
    .eq('token', input.token).maybeSingle();
  if (!gallery) throw new Error('That gallery is not available');
  await assertVisitorCanAccessGallery(gallery as GalleryVisitorGate);
  const personId = await visitorPersonForGallery(gallery as GalleryVisitorGate & { studio_id: string }, input.email);
  const { data: request } = await db.from('gallery_hub_requests').select('id, status')
    .eq('id', input.requestId).eq('gallery_id', gallery.id).eq('studio_id', gallery.studio_id).maybeSingle();
  if (!request) throw new Error('That collaboration request is not available');
  const { data: member } = await db.from('gallery_hub_members').select('id, submitted_at')
    .eq('request_id', request.id).eq('person_id', personId).eq('studio_id', gallery.studio_id).maybeSingle();
  if (!member) throw new Error('You are not invited to this collaboration');
  return { gallery, request, member, personId };
}

/** Make one request with several named gallery participants. */
export async function createClientHubRequest(input: {
  galleryId: string; bookingId: string; title: string; purpose: HubPurpose;
  minItems?: number | null; maxItems?: number | null; dueOn?: string | null; participantIds: string[];
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const title = input.title.trim();
  if (!title) throw new Error('Give the request a clear title');
  if (!['selection', 'album', 'retouch', 'approval'].includes(input.purpose)) throw new Error('Choose a request purpose');
  const min = input.minItems ?? null;
  const max = input.maxItems ?? null;
  if ((min !== null && (!Number.isInteger(min) || min < 0)) || (max !== null && (!Number.isInteger(max) || max < 1)) || (min !== null && max !== null && min > max)) {
    throw new Error('Choose a valid selection range');
  }
  const participantIds = [...new Set(input.participantIds)];
  if (participantIds.length === 0) throw new Error('Invite at least one named collaborator first');
  const { data: gallery } = await db.from('galleries').select('id')
    .eq('id', input.galleryId).eq('studio_id', who.studioId).maybeSingle();
  if (!gallery) throw new Error('That gallery is not in this studio');
  const { data: participants } = await db.from('gallery_participants').select('person_id')
    .eq('gallery_id', gallery.id).eq('studio_id', who.studioId).in('status', ['invited', 'approved']).in('id', participantIds);
  if ((participants ?? []).length !== participantIds.length) {
    throw new Error('Every collaborator must have an active invitation');
  }
  const { data: request, error } = await db.from('gallery_hub_requests').insert({
    studio_id: who.studioId, gallery_id: gallery.id, title, purpose: input.purpose,
    min_items: min, max_items: max, due_on: input.dueOn || null, created_by: who.personId,
  }).select('id').single();
  if (error || !request) throw new Error('Could not create that collaboration');
  const { error: memberError } = await db.from('gallery_hub_members').insert((participants ?? []).map((participant) => ({
    studio_id: who.studioId, request_id: request.id, person_id: participant.person_id,
  })));
  if (memberError) throw new Error('Could not add the collaborators');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: gallery.id,
    action: 'hub_request_created', actor_id: who.personId,
    payload: { request: request.id, purpose: input.purpose, collaborators: participantIds.length },
  });
  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/g/[token]', 'page');
}

export async function closeClientHubRequest(input: { galleryId: string; bookingId: string; requestId: string; closed: boolean }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const { error } = await db.from('gallery_hub_requests').update({ status: input.closed ? 'closed' : 'open' })
    .eq('id', input.requestId).eq('gallery_id', input.galleryId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not change that request');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: input.closed ? 'hub_request_closed' : 'hub_request_reopened', actor_id: who.personId,
    payload: { request: input.requestId },
  });
  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/g/[token]', 'page');
}

/** Collaboration data is scoped to the current named participant, not merely the link holder. */
export async function clientHubForVisitor(input: { token: string; email: string }): Promise<ClientHubRequest[]> {
  const { data: gallery } = await db.from('galleries')
    .select('id, studio_id, token, shared_at, expires_on, access_mode, access_code_hash')
    .eq('token', input.token).maybeSingle();
  if (!gallery || !await visitorCanAccessGallery(gallery as GalleryVisitorGate)) return [];
  const personId = await visitorPersonForGallery(gallery as GalleryVisitorGate & { studio_id: string }, input.email);
  const { data: memberships } = await db.from('gallery_hub_members')
    .select('id, submitted_at, request:gallery_hub_requests(id, gallery_id, title, purpose, min_items, max_items, due_on, status)')
    .eq('studio_id', gallery.studio_id).eq('person_id', personId);
  const rows = (memberships ?? []) as unknown as {
    id: string; submitted_at: string | null;
    request: { id: string; gallery_id: string; title: string; purpose: HubPurpose; min_items: number | null; max_items: number | null; due_on: string | null; status: 'open' | 'closed' } | null;
  }[];
  const active = rows.filter((row) => {
    const request = row.request;
    return !!request && request.gallery_id === gallery.id && request.status === 'open';
  });
  if (active.length === 0) return [];
  const requestIds = active.map((row) => row.request!.id);
  const memberIds = active.map((row) => row.id);
  const [{ data: selections }, { data: messages }, { data: references }] = await Promise.all([
    db.from('gallery_hub_selections').select('request_id, member_id, file_id').in('request_id', requestIds).in('member_id', memberIds),
    db.from('gallery_hub_messages').select('id, request_id, body, file_id, parent_id, pin_x, pin_y, created_at, member:gallery_hub_members(person:people(name))')
      .in('request_id', requestIds).order('created_at', { ascending: true }),
    db.from('gallery_hub_references').select('id, request_id, name, mime_type, storage_path').in('request_id', requestIds),
  ]);
  const paths = (references ?? []).map((reference) => reference.storage_path);
  const { data: signed } = paths.length ? await db.storage.from(BUCKET).createSignedUrls(paths, 60 * 60) : { data: [] };
  const urlFor = new Map((signed ?? []).map((item) => [item.path, item.signedUrl]));
  return active.map((row) => {
    const request = row.request!;
    return {
      id: request.id, title: request.title, purpose: request.purpose, minItems: request.min_items,
      maxItems: request.max_items, dueOn: request.due_on, submittedAt: row.submitted_at,
      fileIds: (selections ?? []).filter((selection) => selection.request_id === request.id && selection.member_id === row.id).map((selection) => selection.file_id),
      messages: ((messages ?? []) as unknown as {
        id: string; request_id: string; body: string; file_id: string | null; parent_id: string | null;
        pin_x: number | null; pin_y: number | null; created_at: string;
        member: { person: { name: string } | null } | null;
      }[]).filter((message) => message.request_id === request.id).map((message) => ({
        id: message.id, body: message.body, fileId: message.file_id, parentId: message.parent_id,
        pinX: message.pin_x, pinY: message.pin_y, authorName: message.member?.person?.name ?? 'A collaborator', createdAt: message.created_at,
      })),
      references: (references ?? []).filter((reference) => reference.request_id === request.id).map((reference) => ({
        id: reference.id, name: reference.name, mimeType: reference.mime_type, url: urlFor.get(reference.storage_path) ?? null,
      })),
    };
  });
}

export async function toggleClientHubSelection(input: { token: string; email: string; requestId: string; fileId: string; on: boolean }): Promise<void> {
  const { gallery, request, member, personId } = await visitorHubMember(input);
  if (request.status !== 'open' || member.submitted_at) throw new Error('This selection is no longer open');
  await assertVisitorCanUseGalleryFile(gallery as GalleryVisitorGate, input.fileId);
  if (input.on) {
    const { count } = await db.from('gallery_hub_selections').select('id', { count: 'exact', head: true }).eq('member_id', member.id);
    const { data: bounds } = await db.from('gallery_hub_requests').select('max_items').eq('id', request.id).single();
    if (bounds?.max_items && (count ?? 0) >= bounds.max_items) throw new Error(`This request is limited to ${bounds.max_items} pictures`);
    const { error } = await db.from('gallery_hub_selections').insert({ studio_id: gallery.studio_id, request_id: request.id, member_id: member.id, file_id: input.fileId });
    if (error && !String(error.message).includes('duplicate')) throw new Error('Could not keep that picture');
  } else {
    await db.from('gallery_hub_selections').delete().eq('request_id', request.id).eq('member_id', member.id).eq('file_id', input.fileId);
  }
  await db.from('events').insert({
    studio_id: gallery.studio_id, subject_type: 'gallery', subject_id: gallery.id,
    action: input.on ? 'hub_file_selected' : 'hub_file_unselected', actor_id: personId,
    payload: { request: request.id, file: input.fileId },
  });
  revalidatePath(`/g/${input.token}`);
}

export async function submitClientHubSelection(input: { token: string; email: string; requestId: string }): Promise<void> {
  const { gallery, request, member, personId } = await visitorHubMember(input);
  if (request.status !== 'open') throw new Error('This request is no longer open');
  const [{ count }, { data: bounds }] = await Promise.all([
    db.from('gallery_hub_selections').select('id', { count: 'exact', head: true }).eq('member_id', member.id),
    db.from('gallery_hub_requests').select('min_items, max_items').eq('id', request.id).single(),
  ]);
  if (bounds?.min_items && (count ?? 0) < bounds.min_items) throw new Error(`Choose at least ${bounds.min_items} pictures first`);
  if (bounds?.max_items && (count ?? 0) > bounds.max_items) throw new Error(`Choose no more than ${bounds.max_items} pictures`);
  const { error } = await db.from('gallery_hub_members').update({ submitted_at: new Date().toISOString() })
    .eq('id', member.id).eq('request_id', request.id).eq('studio_id', gallery.studio_id);
  if (error) throw new Error('Could not submit your selection');
  await db.from('events').insert({
    studio_id: gallery.studio_id, subject_type: 'gallery', subject_id: gallery.id,
    action: 'hub_selection_submitted', actor_id: personId, payload: { request: request.id, howMany: count ?? 0 },
  });
  revalidatePath(`/g/${input.token}`);
}

export async function sendClientHubMessage(input: {
  token: string; email: string; requestId: string; body: string; fileId?: string | null;
  parentId?: string | null; pinX?: number | null; pinY?: number | null;
}): Promise<void> {
  const { gallery, request, member, personId } = await visitorHubMember(input);
  const body = input.body.trim();
  if (!body || body.length > 2_000) throw new Error('Write a message under 2,000 characters');
  if (input.fileId) await assertVisitorCanUseGalleryFile(gallery as GalleryVisitorGate, input.fileId);
  const pinX = input.pinX ?? null;
  const pinY = input.pinY ?? null;
  if ((pinX !== null && (pinX < 0 || pinX > 1)) || (pinY !== null && (pinY < 0 || pinY > 1))) throw new Error('That pin is outside the picture');
  const { error } = await db.from('gallery_hub_messages').insert({
    studio_id: gallery.studio_id, request_id: request.id, member_id: member.id, file_id: input.fileId ?? null,
    parent_id: input.parentId ?? null, pin_x: pinX, pin_y: pinY, body,
  });
  if (error) throw new Error('Could not save that message');
  await db.from('events').insert({
    studio_id: gallery.studio_id, subject_type: 'gallery', subject_id: gallery.id,
    action: 'hub_message_sent', actor_id: personId, payload: { request: request.id, file: input.fileId ?? null },
  });
  revalidatePath(`/g/${input.token}`);
}

export async function clientHubReferenceTarget(input: { token: string; email: string; requestId: string; name: string }) {
  const { gallery, request, member } = await visitorHubMember(input);
  const safe = input.name.replace(/[^\w.\-]+/g, '_').slice(-120);
  if (!safe) throw new Error('Name the reference file');
  const path = `${gallery.studio_id}/gallery-hub/${request.id}/${member.id}/${randomUUID()}-${safe}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error('Could not prepare the reference upload');
  return { path: data.path, token: data.token };
}

export async function recordClientHubReference(input: {
  token: string; email: string; requestId: string; storagePath: string; name: string; mimeType?: string | null; sizeBytes?: number | null;
}): Promise<void> {
  const { gallery, request, member, personId } = await visitorHubMember(input);
  if (!input.storagePath.startsWith(`${gallery.studio_id}/gallery-hub/${request.id}/${member.id}/`)) throw new Error('That reference does not belong here');
  const { error } = await db.from('gallery_hub_references').insert({
    studio_id: gallery.studio_id, request_id: request.id, member_id: member.id, storage_path: input.storagePath,
    name: input.name.trim(), mime_type: input.mimeType ?? null, size_bytes: input.sizeBytes ?? null,
  });
  if (error) throw new Error('Could not save the reference');
  await db.from('events').insert({
    studio_id: gallery.studio_id, subject_type: 'gallery', subject_id: gallery.id,
    action: 'hub_reference_added', actor_id: personId, payload: { request: request.id, name: input.name.trim() },
  });
  revalidatePath(`/g/${input.token}`);
}

export async function createGalleryAlbum(input: { galleryId: string; bookingId: string; name: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const name = input.name.trim();
  if (!name) throw new Error('Name the album proof');
  const { data: album, error } = await db.from('gallery_albums').insert({
    studio_id: who.studioId, gallery_id: input.galleryId, name, created_by: who.personId,
  }).select('id').single();
  if (error || !album) throw new Error('Could not create the album proof');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: 'album_created', actor_id: who.personId, payload: { album: album.id, name },
  });
  revalidatePath(`/bookings/${input.bookingId}`);
}

export async function addGalleryAlbumSpread(input: { albumId: string; galleryId: string; bookingId: string; leftFileId?: string | null; rightFileId?: string | null; caption?: string | null }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const ids = [input.leftFileId, input.rightFileId].filter((id): id is string => !!id);
  if (ids.length === 0) throw new Error('Choose at least one picture');
  const [{ data: album }, { data: members }] = await Promise.all([
    db.from('gallery_albums').select('id').eq('id', input.albumId).eq('gallery_id', input.galleryId).eq('studio_id', who.studioId).maybeSingle(),
    db.from('gallery_files').select('file_id').eq('gallery_id', input.galleryId).eq('studio_id', who.studioId).in('file_id', ids),
  ]);
  if (!album || (members ?? []).length !== new Set(ids).size) throw new Error('Every spread picture must be in this gallery');
  const { count } = await db.from('gallery_album_spreads').select('id', { count: 'exact', head: true }).eq('album_id', album.id);
  const { error } = await db.from('gallery_album_spreads').insert({
    studio_id: who.studioId, album_id: album.id, position: count ?? 0,
    left_file_id: input.leftFileId ?? null, right_file_id: input.rightFileId ?? null, caption: input.caption?.trim() || null,
  });
  if (error) throw new Error('Could not add that spread');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: 'album_spread_added', actor_id: who.personId, payload: { album: album.id },
  });
  revalidatePath(`/bookings/${input.bookingId}`);
}

export async function setGalleryAlbumStatus(input: { albumId: string; galleryId: string; bookingId: string; status: 'draft' | 'review' | 'approved' }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const { error } = await db.from('gallery_albums').update({ status: input.status })
    .eq('id', input.albumId).eq('gallery_id', input.galleryId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not change proof status');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: 'album_status_changed', actor_id: who.personId, payload: { album: input.albumId, status: input.status },
  });
  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/g/[token]', 'page');
}

export async function commentOnGalleryAlbumSpread(input: { token: string; email: string; albumId: string; spreadId: string; body: string; parentId?: string | null }): Promise<void> {
  const { data: gallery } = await db.from('galleries')
    .select('id, studio_id, token, shared_at, expires_on, access_mode, access_code_hash').eq('token', input.token).maybeSingle();
  if (!gallery) throw new Error('That gallery is not available');
  await assertVisitorCanAccessGallery(gallery as GalleryVisitorGate);
  const personId = await visitorPersonForGallery(gallery as GalleryVisitorGate & { studio_id: string }, input.email);
  const body = input.body.trim();
  if (!body || body.length > 2_000) throw new Error('Write a comment under 2,000 characters');
  const { data: spread } = await db.from('gallery_album_spreads').select('id, album:gallery_albums(gallery_id, status)')
    .eq('id', input.spreadId).eq('album_id', input.albumId).eq('studio_id', gallery.studio_id).maybeSingle();
  const album = (spread as unknown as { album: { gallery_id: string; status: string } | null } | null)?.album;
  if (!spread || !album || album.gallery_id !== gallery.id || !['review', 'approved'].includes(album.status)) {
    throw new Error('That album proof is not available');
  }
  const { error } = await db.from('gallery_album_comments').insert({
    studio_id: gallery.studio_id, album_id: input.albumId, spread_id: input.spreadId,
    person_id: personId, parent_id: input.parentId ?? null, body,
  });
  if (error) throw new Error('Could not save that album comment');
  await db.from('events').insert({
    studio_id: gallery.studio_id, subject_type: 'gallery', subject_id: gallery.id,
    action: 'album_commented', actor_id: personId, payload: { album: input.albumId, spread: input.spreadId },
  });
  revalidatePath(`/g/${input.token}`);
}
