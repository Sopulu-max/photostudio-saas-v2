'use server';

import { createHash, timingSafeEqual } from 'crypto';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type {
  ClientGalleryCollection, GalleryActivity, GallerySummary, GalleryTemplate, LockedGallery, PublicGallery,
} from './shape';

const BUCKET = 'weave-files';

export type GalleryVisitorGate = {
  token: string;
  shared_at: string | null;
  expires_on: string | null;
  access_mode: 'link' | 'code';
  access_code_hash: string | null;
};

function accessCookieName(token: string): string {
  return `weave-gallery-access-${token}`;
}

function codeHash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function galleryHasExpired(expiresOn: string | null): boolean {
  return !!expiresOn && expiresOn < new Date().toISOString().slice(0, 10);
}

/** Shared is not sufficient: a gallery can be deliberately time-bound. */
export async function visitorCanAccessGallery(gallery: GalleryVisitorGate): Promise<boolean> {
  if (!gallery.shared_at || galleryHasExpired(gallery.expires_on)) return false;
  if (gallery.access_mode === 'link') return true;
  if (!gallery.access_code_hash) return false;
  const cookie = (await cookies()).get(accessCookieName(gallery.token))?.value;
  return !!cookie && cookie === gallery.access_code_hash;
}

async function assertVisitorCanAccessGallery(gallery: GalleryVisitorGate): Promise<void> {
  if (!await visitorCanAccessGallery(gallery)) {
    throw new Error('That gallery is not available');
  }
}

/** The galleries made from one job. */
export async function galleriesForJob(jobId: string): Promise<GallerySummary[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db
    .from('galleries')
    .select('id, name, token, shared_at, expires_on, access_mode, may_download, cover_file_id, price_list_id, '
      + 'gallery_files(file_id, section_id, file:files(name, mime_type)), '
      + 'sections:gallery_sections(id, name, position, visible_to_clients, gallery_files(id)), '
      + 'collections:gallery_collections(id, name, kind, max_items, due_on, submitted_at, '
      + 'person:people(name, email), items:gallery_collection_files(id)), '
      + 'comments:gallery_comments(id, body, created_at, person:people(name), file:files(name))')
    .eq('studio_id', who.studioId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to read the galleries:', error);
    throw new Error('Could not read the galleries on this job');
  }

  return ((data ?? []) as unknown as {
    id: string; name: string; token: string; shared_at: string | null;
    expires_on: string | null; access_mode: 'link' | 'code'; may_download: boolean;
    cover_file_id: string | null; price_list_id: string | null;
    gallery_files: { file_id: string; section_id: string; file: { name: string; mime_type: string | null } | null }[];
    sections: {
      id: string; name: string; position: number; visible_to_clients: boolean;
      gallery_files: { id: string }[];
    }[];
    collections: {
      id: string; name: string; kind: 'collection' | 'selection'; max_items: number | null;
      due_on: string | null; submitted_at: string | null;
      person: { name: string; email: string | null } | null;
      items: { id: string }[];
    }[];
    comments: {
      id: string; body: string; created_at: string;
      person: { name: string } | null; file: { name: string } | null;
    }[];
  }[]).map((g) => ({
    id: g.id,
    name: g.name,
    token: g.token,
    sharedAt: g.shared_at,
    expiresOn: g.expires_on,
    accessMode: g.access_mode,
    mayDownload: g.may_download,
    howMany: (g.gallery_files ?? []).length,
    coverFileId: g.cover_file_id,
    sections: (g.sections ?? []).sort((a, b) => a.position - b.position).map((section) => ({
      id: section.id,
      name: section.name,
      position: section.position,
      visibleToClients: section.visible_to_clients,
      howMany: (section.gallery_files ?? []).length,
    })),
    members: (g.gallery_files ?? []).flatMap((member) => member.file ? [{
      fileId: member.file_id,
      name: member.file.name,
      mimeType: member.file.mime_type,
      sectionId: member.section_id,
    }] : []),
    collections: (g.collections ?? []).map((collection) => ({
      id: collection.id,
      name: collection.name,
      kind: collection.kind,
      ownerName: collection.person?.name ?? 'Unknown visitor',
      ownerEmail: collection.person?.email ?? null,
      maxItems: collection.max_items,
      dueOn: collection.due_on,
      submittedAt: collection.submitted_at,
      howMany: (collection.items ?? []).length,
    })),
    comments: (g.comments ?? []).map((comment) => ({
      id: comment.id,
      body: comment.body,
      authorName: comment.person?.name ?? 'A visitor',
      fileName: comment.file?.name ?? 'A picture',
      createdAt: comment.created_at,
    })),
    priceListId: g.price_list_id,
  }));
}

/** The studio's gallery dashboard, derived from the same append-only log. */
export async function galleryActivityForJob(jobId: string): Promise<GalleryActivity[]> {
  const who = await whoIsAsking();
  if (!who) return [];
  const [{ data: galleries, error: galleryError }, { data: events, error: eventError }, { data: orders }] = await Promise.all([
    db.from('galleries').select('id').eq('studio_id', who.studioId).eq('job_id', jobId),
    db.from('events').select('id, subject_id, action, at, actor:people(name)')
      .eq('studio_id', who.studioId).eq('subject_type', 'gallery').order('at', { ascending: false }),
    db.from('orders').select('gallery_id').eq('studio_id', who.studioId).eq('job_id', jobId),
  ]);
  if (galleryError || eventError) throw new Error('Could not read gallery activity');
  const galleryIds = new Set((galleries ?? []).map((gallery) => gallery.id));
  const orderCount = new Map<string, number>();
  (orders ?? []).forEach((order) => {
    if (order.gallery_id) orderCount.set(order.gallery_id, (orderCount.get(order.gallery_id) ?? 0) + 1);
  });
  const result = new Map<string, GalleryActivity>();
  galleryIds.forEach((id) => result.set(id, {
    galleryId: id, opens: 0, downloads: 0, comments: 0, favourites: 0, collectionAdds: 0, selectionsSubmitted: 0,
    orders: orderCount.get(id) ?? 0, recent: [],
  }));
  ((events ?? []) as unknown as {
    id: string; subject_id: string; action: string; at: string; actor: { name: string } | null;
  }[]).forEach((event) => {
    const activity = result.get(event.subject_id);
    if (!activity) return;
    if (event.action === 'viewed') activity.opens += 1;
    if (event.action === 'downloaded') activity.downloads += 1;
    if (event.action === 'file_commented') activity.comments += 1;
    if (event.action === 'file_favourited') activity.favourites += 1;
    if (event.action === 'file_collected') activity.collectionAdds += 1;
    if (event.action === 'selection_submitted') activity.selectionsSubmitted += 1;
    if (activity.recent.length < 6 && ['viewed', 'downloaded', 'file_favourited', 'file_collected', 'file_commented', 'selection_submitted'].includes(event.action)) {
      activity.recent.push({ id: event.id, action: event.action, at: event.at, who: event.actor?.name ?? null });
    }
  });
  return [...result.values()];
}

/** Reusable presentation recipes owned by this studio. */
export async function galleryTemplates(): Promise<GalleryTemplate[]> {
  const who = await whoIsAsking();
  if (!who) return [];
  const { data, error } = await db.from('gallery_templates')
    .select('id, name, may_download, price_list_id, sections:gallery_template_sections(id, name, position, visible_to_clients)')
    .eq('studio_id', who.studioId).order('created_at', { ascending: true });
  if (error) throw new Error('Could not read gallery templates');
  return ((data ?? []) as unknown as {
    id: string; name: string; may_download: boolean; price_list_id: string | null;
    sections: { id: string; name: string; position: number; visible_to_clients: boolean }[];
  }[]).map((template) => ({
    id: template.id, name: template.name, mayDownload: template.may_download,
    priceListId: template.price_list_id,
    sections: (template.sections ?? []).sort((a, b) => a.position - b.position).map((section) => ({
      id: section.id, name: section.name, position: section.position, visibleToClients: section.visible_to_clients,
    })),
  }));
}

/** Save the reusable gallery structure without copying this job's client facts. */
export async function saveGalleryAsTemplate(input: {
  galleryId: string; jobId: string; name: string;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const name = input.name.trim();
  if (!name) throw new Error('A template needs a name');
  const { data: gallery } = await db.from('galleries')
    .select('id, may_download, price_list_id, sections:gallery_sections(name, position, visible_to_clients)')
    .eq('id', input.galleryId).eq('studio_id', who.studioId).maybeSingle();
  if (!gallery) throw new Error('That gallery is not in this studio');
  const { data: template, error } = await db.from('gallery_templates').insert({
    studio_id: who.studioId, name, may_download: gallery.may_download, price_list_id: gallery.price_list_id,
  }).select('id').single();
  if (error || !template) throw new Error('Could not save that template');
  const sections = ((gallery.sections ?? []) as { name: string; position: number; visible_to_clients: boolean }[])
    .sort((a, b) => a.position - b.position);
  const { error: sectionsError } = await db.from('gallery_template_sections').insert(
    sections.map((section) => ({
      template_id: template.id, name: section.name, position: section.position,
      visible_to_clients: section.visible_to_clients,
    })),
  );
  if (sectionsError) throw new Error('Could not save this template structure');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: 'saved_as_template', actor_id: who.personId, payload: { template: template.id, name },
  });
  revalidatePath(`/jobs/${input.jobId}`);
}

/**
 * Make a gallery from the files already chosen on this job.
 *
 * Seeded from the studio's own choices because that is what choosing is for —
 * but copied in, not derived, so unchoosing a frame later cannot reach into a
 * gallery somebody is already looking at.
 */
export async function makeGallery(input: {
  jobId: string;
  name: string;
  fromChosen?: boolean;
  templateId?: string | null;
}): Promise<{ id: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const name = input.name.trim();
  if (!name) throw new Error('A gallery needs a name');

  type TemplateSeed = {
    may_download: boolean; price_list_id: string | null;
    sections: { name: string; position: number; visible_to_clients: boolean }[];
  };
  let template: TemplateSeed | null = null;
  if (input.templateId) {
    const { data, error } = await db.from('gallery_templates')
      .select('may_download, price_list_id, sections:gallery_template_sections(name, position, visible_to_clients)')
      .eq('id', input.templateId).eq('studio_id', who.studioId).maybeSingle();
    if (error || !data) throw new Error('That gallery template is not in this studio');
    template = data as unknown as TemplateSeed;
  }

  const { data: gallery, error } = await db
    .from('galleries')
    .insert({
      studio_id: who.studioId, job_id: input.jobId, name,
      may_download: template?.may_download ?? true,
      price_list_id: template?.price_list_id ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to make the gallery:', error);
    throw new Error('Could not make that gallery');
  }

  const sectionSeed = template?.sections?.length
    ? [...template.sections].sort((a, b) => a.position - b.position)
    : [{ name: 'Gallery', position: 0, visible_to_clients: true }];
  const { data: madeSections, error: sectionError } = await db
    .from('gallery_sections')
    .insert(sectionSeed.map((section) => ({
      studio_id: who.studioId, gallery_id: gallery.id, name: section.name,
      position: section.position, visible_to_clients: section.visible_to_clients,
    })))
    .select('id, position')
    .order('position', { ascending: true });

  const firstSection = (madeSections ?? [])[0];
  if (sectionError || !firstSection) {
    console.error('Failed to make the gallery section:', sectionError);
    throw new Error('Could not prepare that gallery');
  }

  if (input.fromChosen !== false) {
    const { data: files } = await db
      .from('files')
      .select('id, created_at, choices:choices(id)')
      .eq('studio_id', who.studioId)
      .eq('job_id', input.jobId)
      .order('created_at', { ascending: true });

    const chosen = ((files ?? []) as unknown as { id: string; choices: { id: string }[] }[])
      .filter((f) => (f.choices ?? []).length > 0);

    if (chosen.length > 0) {
      await db.from('gallery_files').insert(
        chosen.map((f, i) => ({
          studio_id: who.studioId,
          gallery_id: gallery.id,
          section_id: firstSection.id,
          file_id: f.id,
          position: i,
        })),
      );
    }
  }

  await db.from('events').insert({
    studio_id: who.studioId,
    subject_type: 'gallery',
    subject_id: gallery.id,
    action: 'made',
    actor_id: who.personId,
    payload: { name, job: input.jobId },
  });

  revalidatePath(`/jobs/${input.jobId}`);
  return { id: gallery.id };
}

/** Put every file on the job into the gallery, skipping what is already in. */
export async function fillGallery(input: {
  galleryId: string;
  jobId: string;
  sectionId: string;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const [{ data: files }, { data: already }, { data: section }] = await Promise.all([
    db.from('files').select('id').eq('studio_id', who.studioId)
      .eq('job_id', input.jobId).order('created_at', { ascending: true }),
    db.from('gallery_files').select('file_id').eq('gallery_id', input.galleryId),
    db.from('gallery_sections').select('id')
      .eq('id', input.sectionId).eq('gallery_id', input.galleryId).eq('studio_id', who.studioId)
      .maybeSingle(),
  ]);

  if (!section) throw new Error('Choose a section in this gallery first');

  const have = new Set((already ?? []).map((r) => r.file_id));
  const missing = (files ?? []).filter((f) => !have.has(f.id));
  if (missing.length === 0) return;

  const { error } = await db.from('gallery_files').insert(
    missing.map((f, i) => ({
      studio_id: who.studioId,
      gallery_id: input.galleryId,
      section_id: section.id,
      file_id: f.id,
      position: have.size + i,
    })),
  );

  if (error) {
    console.error('Failed to fill the gallery:', error);
    throw new Error('Could not add those');
  }
  revalidatePath(`/jobs/${input.jobId}`);
}

/**
 * Share it, or stop sharing it.
 *
 * Stopping does not change the link — it closes the door. Rotating the token
 * instead would silently break a link the client may have been sent, and they
 * would meet a dead address with no explanation.
 */
export async function shareGallery(input: {
  galleryId: string;
  jobId: string;
  shared: boolean;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { error } = await db
    .from('galleries')
    .update({ shared_at: input.shared ? new Date().toISOString() : null })
    .eq('id', input.galleryId)
    .eq('studio_id', who.studioId);

  if (error) {
    console.error('Failed to share the gallery:', error);
    throw new Error('Could not change that');
  }

  await db.from('events').insert({
    studio_id: who.studioId,
    subject_type: 'gallery',
    subject_id: input.galleryId,
    action: input.shared ? 'shared' : 'closed',
    actor_id: who.personId,
    payload: {},
  });

  revalidatePath(`/jobs/${input.jobId}`);
}

export async function allowDownload(input: {
  galleryId: string; jobId: string; may: boolean;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { error } = await db
    .from('galleries')
    .update({ may_download: input.may })
    .eq('id', input.galleryId)
    .eq('studio_id', who.studioId);

  if (error) throw new Error('Could not change that');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: input.may ? 'downloads_enabled' : 'downloads_disabled', actor_id: who.personId, payload: {},
  });
  revalidatePath(`/jobs/${input.jobId}`);
}

/** Add a named, independently visible portion of a gallery. */
export async function addGallerySection(input: {
  galleryId: string; jobId: string; name: string;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const name = input.name.trim();
  if (!name) throw new Error('A section needs a name');

  const { data: existing, error: existingError } = await db
    .from('gallery_sections').select('id')
    .eq('gallery_id', input.galleryId).eq('studio_id', who.studioId);
  if (existingError) throw new Error('Could not read this gallery');

  const { error } = await db.from('gallery_sections').insert({
    studio_id: who.studioId,
    gallery_id: input.galleryId,
    name,
    position: (existing ?? []).length,
  });
  if (error) throw new Error('Could not add that section');

  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: 'section_added', actor_id: who.personId, payload: { name },
  });
  revalidatePath(`/jobs/${input.jobId}`);
}

export async function setSectionVisibility(input: {
  galleryId: string; jobId: string; sectionId: string; visible: boolean;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const { error } = await db.from('gallery_sections')
    .update({ visible_to_clients: input.visible })
    .eq('id', input.sectionId).eq('gallery_id', input.galleryId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not change that section');

  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: input.visible ? 'section_shown' : 'section_hidden', actor_id: who.personId,
    payload: { section: input.sectionId },
  });
  revalidatePath(`/jobs/${input.jobId}`);
}

/** Put a gallery member in a section without changing the gallery's promised set. */
export async function moveGalleryFile(input: {
  galleryId: string; jobId: string; fileId: string; sectionId: string;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const { data: section } = await db.from('gallery_sections').select('id')
    .eq('id', input.sectionId).eq('gallery_id', input.galleryId).eq('studio_id', who.studioId)
    .maybeSingle();
  if (!section) throw new Error('That section is not in this gallery');

  const { error } = await db.from('gallery_files')
    .update({ section_id: section.id })
    .eq('gallery_id', input.galleryId).eq('file_id', input.fileId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not move that picture');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: 'file_moved', actor_id: who.personId,
    payload: { file: input.fileId, section: input.sectionId },
  });
  revalidatePath(`/jobs/${input.jobId}`);
}

export async function setGalleryCover(input: {
  galleryId: string; jobId: string; fileId: string | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  if (input.fileId) {
    const { data: member } = await db.from('gallery_files').select('id, file:files(mime_type)')
      .eq('gallery_id', input.galleryId).eq('file_id', input.fileId).eq('studio_id', who.studioId)
      .maybeSingle();
    if (!member) throw new Error('The cover must be a picture in this gallery');
    const file = (member as unknown as { file: { mime_type: string | null } | null }).file;
    if (!file?.mime_type?.startsWith('image/')) throw new Error('The cover needs to be a still image');
  }
  const { error } = await db.from('galleries').update({ cover_file_id: input.fileId })
    .eq('id', input.galleryId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not change the cover');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: 'cover_changed', actor_id: who.personId, payload: { file: input.fileId },
  });
  revalidatePath(`/jobs/${input.jobId}`);
}

export async function setGalleryExpiry(input: {
  galleryId: string; jobId: string; expiresOn: string | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const expiresOn = input.expiresOn?.trim() || null;
  if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
    throw new Error('Choose a valid expiry date');
  }
  const { error } = await db.from('galleries').update({ expires_on: expiresOn })
    .eq('id', input.galleryId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not change the expiry');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: 'expiry_changed', actor_id: who.personId, payload: { expiresOn },
  });
  revalidatePath(`/jobs/${input.jobId}`);
}

export async function setGalleryAccess(input: {
  galleryId: string; jobId: string; mode: 'link' | 'code'; code?: string;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const code = input.code?.trim() ?? '';
  if (input.mode === 'code' && code.length < 6) {
    throw new Error('An access code needs at least 6 characters');
  }
  const { error } = await db.from('galleries').update({
    access_mode: input.mode,
    access_code_hash: input.mode === 'code' ? codeHash(code) : null,
  }).eq('id', input.galleryId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not change access');

  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: 'access_changed', actor_id: who.personId, payload: { mode: input.mode },
  });
  revalidatePath(`/jobs/${input.jobId}`);
}

/**
 * The gallery as the client meets it — by token, with no session.
 *
 * A code-protected gallery reveals its existence, but not a single signed
 * media URL, until the visitor has proved the code.
 */
export async function openGallery(token: string): Promise<PublicGallery | LockedGallery | null> {
  const { data, error } = await db
    .from('galleries')
    .select('id, name, token, shared_at, expires_on, access_mode, access_code_hash, may_download, '
      + 'cover_file_id, studio:studios(name), '
      + 'sections:gallery_sections(id, name, position, visible_to_clients, '
      + 'items:gallery_files(position, file:files(id, name, storage_path, mime_type)))')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    console.error('Failed to open the gallery:', error);
    return null;
  }
  if (!data) return null;

  const g = data as unknown as {
    id: string; name: string; token: string; shared_at: string | null;
    expires_on: string | null; access_mode: 'link' | 'code'; access_code_hash: string | null;
    may_download: boolean; cover_file_id: string | null; studio: { name: string } | null;
    sections: {
      id: string; name: string; position: number; visible_to_clients: boolean;
      items: { position: number; file: { id: string; name: string; storage_path: string; mime_type: string | null } | null }[];
    }[];
  };

  if (!g.shared_at || galleryHasExpired(g.expires_on)) return null;
  if (!await visitorCanAccessGallery(g)) {
    return { locked: true, name: g.name, token: g.token, studioName: g.studio?.name ?? 'The studio' };
  }

  const sections = (g.sections ?? [])
    .filter((section) => section.visible_to_clients)
    .sort((a, b) => a.position - b.position)
    .map((section) => ({
      id: section.id,
      name: section.name,
      items: (section.items ?? []).filter((item) => item.file).sort((a, b) => a.position - b.position),
    }));
  const items = sections.flatMap((section) => section.items);

  const { data: signed } = await db.storage
    .from(BUCKET)
    .createSignedUrls(items.map((i) => i.file!.storage_path), 60 * 60);
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return {
    id: g.id,
    name: g.name,
    token: g.token,
    studioName: g.studio?.name ?? 'The studio',
    mayDownload: g.may_download,
    coverFileId: g.cover_file_id,
    sections: sections.map((section) => ({
      id: section.id,
      name: section.name,
      files: section.items.map((item) => ({
        id: item.file!.id,
        name: item.file!.name,
        mimeType: item.file!.mime_type,
        url: urlFor.get(item.file!.storage_path) ?? null,
      })),
    })),
    files: items.map((i) => ({
      id: i.file!.id,
      name: i.file!.name,
      mimeType: i.file!.mime_type,
      url: urlFor.get(i.file!.storage_path) ?? null,
    })),
  };
}

/** Prove an access code once, then keep only its hash in an HTTP-only cookie. */
export async function unlockGallery(input: { token: string; code: string }): Promise<void> {
  const { data } = await db.from('galleries')
    .select('token, shared_at, expires_on, access_mode, access_code_hash')
    .eq('token', input.token).maybeSingle();
  const gallery = data as GalleryVisitorGate | null;
  if (!gallery || !gallery.shared_at || galleryHasExpired(gallery.expires_on)) {
    throw new Error('That gallery is not available');
  }
  if (gallery.access_mode !== 'code' || !gallery.access_code_hash) {
    throw new Error('This gallery does not need an access code');
  }

  const candidate = codeHash(input.code.trim());
  const expected = Buffer.from(gallery.access_code_hash, 'hex');
  const actual = Buffer.from(candidate, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('That access code is not right');
  }

  (await cookies()).set(accessCookieName(gallery.token), gallery.access_code_hash, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: `/g/${gallery.token}`,
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath(`/g/${gallery.token}`);
}

async function findOrCreateGalleryPerson(input: {
  studioId: string; email: string; name?: string;
}): Promise<string> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw new Error('An email is needed');
  const { data: found } = await db.from('people').select('id')
    .eq('studio_id', input.studioId).eq('email', email).maybeSingle();
  if (found) return found.id;

  const { data: made, error } = await db.from('people').insert({
    studio_id: input.studioId, name: input.name?.trim() || email, email,
  }).select('id').single();
  if (error || !made) throw new Error('Could not identify this visitor');
  return made.id;
}

/** A declared visitor opening a gallery is an event, not a counter to maintain. */
export async function recordGalleryView(input: { token: string; email: string }): Promise<void> {
  const { data: gallery } = await db.from('galleries')
    .select('id, studio_id, token, shared_at, expires_on, access_mode, access_code_hash')
    .eq('token', input.token).maybeSingle();
  if (!gallery || !await visitorCanAccessGallery(gallery as GalleryVisitorGate)) return;
  const personId = await findOrCreateGalleryPerson({ studioId: gallery.studio_id, email: input.email });
  await db.from('events').insert({
    studio_id: gallery.studio_id, subject_type: 'gallery', subject_id: gallery.id,
    action: 'viewed', actor_id: personId, payload: {},
  });
}

/**
 * Hand a declared visitor a short-lived download URL and record that deliberate
 * handoff. This is activity evidence, not a claim that displayed browser media
 * is DRM-protected.
 */
export async function prepareGalleryDownload(input: {
  token: string; email: string; fileId: string;
}): Promise<{ url: string; name: string }> {
  const { data: gallery } = await db.from('galleries')
    .select('id, studio_id, token, shared_at, expires_on, access_mode, access_code_hash, may_download')
    .eq('token', input.token).maybeSingle();
  if (!gallery || !gallery.may_download) throw new Error('Downloads are not enabled for this gallery');
  await assertVisitorCanAccessGallery(gallery as GalleryVisitorGate);
  const personId = await findOrCreateGalleryPerson({ studioId: gallery.studio_id, email: input.email });
  const { data: member } = await db.from('gallery_files')
    .select('file:files(name, storage_path)').eq('gallery_id', gallery.id).eq('file_id', input.fileId).maybeSingle();
  const file = (member as unknown as { file: { name: string; storage_path: string } | null } | null)?.file;
  if (!file) throw new Error('That file is not in this gallery');
  const { data: signed, error } = await db.storage.from(BUCKET).createSignedUrl(file.storage_path, 60 * 60);
  if (error || !signed?.signedUrl) throw new Error('Could not prepare that download');
  await db.from('events').insert({
    studio_id: gallery.studio_id, subject_type: 'gallery', subject_id: gallery.id,
    action: 'downloaded', actor_id: personId, payload: { file: input.fileId },
  });
  return { url: signed.signedUrl, name: file.name };
}

/** Put a visitor's words beside the one gallery file they are about. */
export async function commentOnGalleryFile(input: {
  token: string; email: string; fileId: string; body: string;
}): Promise<void> {
  const { data: gallery } = await db.from('galleries')
    .select('id, studio_id, token, shared_at, expires_on, access_mode, access_code_hash')
    .eq('token', input.token).maybeSingle();
  if (!gallery) throw new Error('That gallery is not available');
  await assertVisitorCanAccessGallery(gallery as GalleryVisitorGate);
  const body = input.body.trim();
  if (!body) throw new Error('Write a comment first');
  if (body.length > 2_000) throw new Error('Keep a comment under 2,000 characters');
  const personId = await findOrCreateGalleryPerson({ studioId: gallery.studio_id, email: input.email });
  const { data: member } = await db.from('gallery_files').select('id')
    .eq('gallery_id', gallery.id).eq('file_id', input.fileId).maybeSingle();
  if (!member) throw new Error('That picture is not in this gallery');
  const { error } = await db.from('gallery_comments').insert({
    studio_id: gallery.studio_id, gallery_id: gallery.id, file_id: input.fileId, person_id: personId, body,
  });
  if (error) throw new Error('Could not save that comment');
  await db.from('events').insert({
    studio_id: gallery.studio_id, subject_type: 'gallery', subject_id: gallery.id,
    action: 'file_commented', actor_id: personId, payload: { file: input.fileId },
  });
  revalidatePath(`/g/${input.token}`);
}

/** The studio asks one identified client for a bounded, submit-able selection. */
export async function requestGallerySelection(input: {
  galleryId: string; jobId: string; email: string; name: string; maxItems: number; dueOn?: string | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const name = input.name.trim();
  if (!name) throw new Error('A selection needs a name');
  if (!Number.isInteger(input.maxItems) || input.maxItems < 1) {
    throw new Error('Choose how many pictures the client may select');
  }
  const dueOn = input.dueOn?.trim() || null;
  if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) throw new Error('Choose a valid due date');

  const { data: gallery } = await db.from('galleries').select('id')
    .eq('id', input.galleryId).eq('studio_id', who.studioId).maybeSingle();
  if (!gallery) throw new Error('That gallery is not in this studio');
  const personId = await findOrCreateGalleryPerson({
    studioId: who.studioId, email: input.email, name: input.email,
  });

  const { error } = await db.from('gallery_collections').insert({
    studio_id: who.studioId, gallery_id: input.galleryId, person_id: personId,
    name, kind: 'selection', max_items: input.maxItems, due_on: dueOn,
  });
  if (error) throw new Error('Could not request that selection');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: 'selection_requested', actor_id: who.personId,
    payload: { email: input.email.trim().toLowerCase(), name, maxItems: input.maxItems, dueOn },
  });
  revalidatePath(`/jobs/${input.jobId}`);
}

/** Collections owned by this visitor, including requests made for them by the studio. */
export async function collectionsForVisitor(input: {
  token: string; email: string;
}): Promise<ClientGalleryCollection[]> {
  const { data: gallery } = await db.from('galleries')
    .select('id, studio_id, token, shared_at, expires_on, access_mode, access_code_hash')
    .eq('token', input.token).maybeSingle();
  if (!gallery || !await visitorCanAccessGallery(gallery as GalleryVisitorGate)) return [];
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) return [];
  const { data: person } = await db.from('people').select('id')
    .eq('studio_id', gallery.studio_id).eq('email', email).maybeSingle();
  if (!person) return [];

  const { data, error } = await db.from('gallery_collections')
    .select('id, name, kind, max_items, due_on, submitted_at, items:gallery_collection_files(file_id)')
    .eq('gallery_id', gallery.id).eq('person_id', person.id).order('created_at', { ascending: true });
  if (error) throw new Error('Could not read your collections');
  return ((data ?? []) as unknown as {
    id: string; name: string; kind: 'collection' | 'selection'; max_items: number | null;
    due_on: string | null; submitted_at: string | null; items: { file_id: string }[];
  }[]).map((collection) => ({
    id: collection.id, name: collection.name, kind: collection.kind,
    maxItems: collection.max_items, dueOn: collection.due_on, submittedAt: collection.submitted_at,
    fileIds: (collection.items ?? []).map((item) => item.file_id),
  }));
}

export async function createVisitorCollection(input: {
  token: string; email: string; name: string;
}): Promise<ClientGalleryCollection> {
  const { data: gallery } = await db.from('galleries')
    .select('id, studio_id, token, shared_at, expires_on, access_mode, access_code_hash')
    .eq('token', input.token).maybeSingle();
  if (!gallery) throw new Error('That gallery is not available');
  await assertVisitorCanAccessGallery(gallery as GalleryVisitorGate);
  const name = input.name.trim();
  if (!name) throw new Error('Give this collection a name');
  const personId = await findOrCreateGalleryPerson({ studioId: gallery.studio_id, email: input.email });
  const { data: made, error } = await db.from('gallery_collections').insert({
    studio_id: gallery.studio_id, gallery_id: gallery.id, person_id: personId, name,
  }).select('id, name, kind, max_items, due_on, submitted_at').single();
  if (error || !made) throw new Error('Could not make that collection');
  await db.from('events').insert({
    studio_id: gallery.studio_id, subject_type: 'gallery', subject_id: gallery.id,
    action: 'collection_created', actor_id: personId, payload: { collection: made.id },
  });
  revalidatePath(`/g/${input.token}`);
  return {
    id: made.id, name: made.name, kind: made.kind, maxItems: made.max_items,
    dueOn: made.due_on, submittedAt: made.submitted_at, fileIds: [],
  };
}

export async function toggleCollectionFile(input: {
  token: string; email: string; collectionId: string; fileId: string; on: boolean;
}): Promise<void> {
  const { data: gallery } = await db.from('galleries')
    .select('id, studio_id, token, shared_at, expires_on, access_mode, access_code_hash')
    .eq('token', input.token).maybeSingle();
  if (!gallery) throw new Error('That gallery is not available');
  await assertVisitorCanAccessGallery(gallery as GalleryVisitorGate);
  const personId = await findOrCreateGalleryPerson({ studioId: gallery.studio_id, email: input.email });
  const { data: collection } = await db.from('gallery_collections')
    .select('id, kind, max_items, due_on, submitted_at')
    .eq('id', input.collectionId).eq('gallery_id', gallery.id).eq('person_id', personId).maybeSingle();
  if (!collection) throw new Error('That collection is not yours');
  if (collection.submitted_at) throw new Error('That selection was already sent to the studio');
  if (collection.due_on && collection.due_on < new Date().toISOString().slice(0, 10)) {
    throw new Error('That selection request has expired');
  }

  const { data: member } = await db.from('gallery_files').select('id')
    .eq('gallery_id', gallery.id).eq('file_id', input.fileId).maybeSingle();
  if (!member) throw new Error('That picture is not in this gallery');

  if (input.on) {
    if (collection.max_items) {
      const { count } = await db.from('gallery_collection_files')
        .select('id', { count: 'exact', head: true }).eq('collection_id', collection.id);
      if ((count ?? 0) >= collection.max_items) {
        throw new Error(`This selection is limited to ${collection.max_items} pictures`);
      }
    }
    const { error } = await db.from('gallery_collection_files').insert({
      studio_id: gallery.studio_id, gallery_id: gallery.id,
      collection_id: collection.id, file_id: input.fileId,
    });
    if (error && !String(error.message).includes('duplicate')) throw new Error('Could not add that picture');
  } else {
    await db.from('gallery_collection_files').delete()
      .eq('collection_id', collection.id).eq('file_id', input.fileId);
  }
  await db.from('events').insert({
    studio_id: gallery.studio_id, subject_type: 'gallery', subject_id: gallery.id,
    action: input.on ? 'file_collected' : 'file_removed_from_collection', actor_id: personId,
    payload: { collection: collection.id, file: input.fileId },
  });
  revalidatePath(`/g/${input.token}`);
}

export async function submitGallerySelection(input: {
  token: string; email: string; collectionId: string;
}): Promise<void> {
  const { data: gallery } = await db.from('galleries')
    .select('id, studio_id, token, shared_at, expires_on, access_mode, access_code_hash')
    .eq('token', input.token).maybeSingle();
  if (!gallery) throw new Error('That gallery is not available');
  await assertVisitorCanAccessGallery(gallery as GalleryVisitorGate);
  const personId = await findOrCreateGalleryPerson({ studioId: gallery.studio_id, email: input.email });
  const { data: collection } = await db.from('gallery_collections')
    .select('id, kind, max_items, due_on, submitted_at').eq('id', input.collectionId)
    .eq('gallery_id', gallery.id).eq('person_id', personId).maybeSingle();
  if (!collection || collection.kind !== 'selection') throw new Error('That is not a selection request');
  if (collection.submitted_at) return;
  if (collection.due_on && collection.due_on < new Date().toISOString().slice(0, 10)) {
    throw new Error('That selection request has expired');
  }
  const { count } = await db.from('gallery_collection_files')
    .select('id', { count: 'exact', head: true }).eq('collection_id', collection.id);
  if ((count ?? 0) > (collection.max_items ?? 0)) throw new Error('This selection has too many pictures');
  const { error } = await db.from('gallery_collections').update({ submitted_at: new Date().toISOString() })
    .eq('id', collection.id).eq('gallery_id', gallery.id).eq('person_id', personId);
  if (error) throw new Error('Could not send that selection');
  await db.from('events').insert({
    studio_id: gallery.studio_id, subject_type: 'gallery', subject_id: gallery.id,
    action: 'selection_submitted', actor_id: personId,
    payload: { collection: collection.id, howMany: count ?? 0 },
  });
  revalidatePath(`/g/${input.token}`);
}

/**
 * A visitor favouriting a frame.
 *
 * They identify by email, which finds or makes a person in the studio's own
 * books. That is the point: the client's favourites land in the SAME table as
 * the studio's selects, attributed to a real person, so "are these the ones
 * they want" has an answer rather than a guess.
 */
export async function favourite(input: {
  token: string;
  fileId: string;
  email: string;
  name?: string;
  on: boolean;
}): Promise<void> {
  const { data: gallery } = await db
    .from('galleries')
    .select('id, studio_id, token, shared_at, expires_on, access_mode, access_code_hash')
    .eq('token', input.token)
    .maybeSingle();

  if (!gallery) throw new Error('That gallery is not available');
  await assertVisitorCanAccessGallery(gallery as GalleryVisitorGate);

  // The file has to be IN this gallery. Without this check a visitor holding
  // one token could favourite any file in the studio by id.
  const { data: inIt } = await db
    .from('gallery_files')
    .select('id')
    .eq('gallery_id', gallery.id)
    .eq('file_id', input.fileId)
    .maybeSingle();
  if (!inIt) throw new Error('That picture is not in this gallery');

  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error('An email is needed to keep your picks');

  const { data: found } = await db
    .from('people')
    .select('id')
    .eq('studio_id', gallery.studio_id)
    .eq('email', email)
    .maybeSingle();

  let personId = found?.id ?? null;
  if (!personId) {
    const { data: made, error } = await db
      .from('people')
      .insert({
        studio_id: gallery.studio_id,
        name: input.name?.trim() || email,
        email,
      })
      .select('id')
      .single();
    if (error) throw new Error('Could not keep your picks');
    personId = made.id;
  }

  if (input.on) {
    const { error } = await db.from('choices').insert({
      studio_id: gallery.studio_id, file_id: input.fileId, person_id: personId,
    });
    if (error && !String(error.message).includes('duplicate')) {
      throw new Error('Could not keep that pick');
    }
  } else {
    await db.from('choices').delete()
      .eq('file_id', input.fileId).eq('person_id', personId);
  }

  await db.from('events').insert({
    studio_id: gallery.studio_id, subject_type: 'gallery', subject_id: gallery.id,
    action: input.on ? 'file_favourited' : 'file_unfavourited', actor_id: personId,
    payload: { file: input.fileId },
  });

  revalidatePath(`/g/${input.token}`);
}

/** What this visitor has already picked, so the gallery opens where they left it. */
export async function picksOf(input: {
  token: string; email: string;
}): Promise<string[]> {
  const { data: gallery } = await db
    .from('galleries').select('id, studio_id, token, shared_at, expires_on, access_mode, access_code_hash')
    .eq('token', input.token).maybeSingle();
  if (!gallery || !await visitorCanAccessGallery(gallery as GalleryVisitorGate)) return [];

  const { data: person } = await db
    .from('people').select('id')
    .eq('studio_id', gallery.studio_id)
    .eq('email', input.email.trim().toLowerCase())
    .maybeSingle();
  if (!person) return [];

  const { data } = await db
    .from('gallery_files')
    .select('file_id, choices:files(choices(person_id))')
    .eq('gallery_id', gallery.id);

  const ids = ((data ?? []) as unknown as {
    file_id: string; choices: { choices: { person_id: string }[] } | null;
  }[])
    .filter((r) => (r.choices?.choices ?? []).some((c) => c.person_id === person.id))
    .map((r) => r.file_id);

  return ids;
}
