'use server';

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type {
  ClientGalleryCollection, GalleryActivity, GalleryDesign, GallerySummary, GalleryTemplate, LockedGallery, PublicGallery,
} from './shape';

const BUCKET = 'weave-files';

export type GalleryVisitorGate = {
  id: string;
  token: string;
  shared_at: string | null;
  expires_on: string | null;
  access_mode: 'link' | 'code' | 'invite';
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

async function invitedParticipantForGallery(gallery: GalleryVisitorGate): Promise<{
  person_id: string; role: 'main_client' | 'guest' | 'vendor';
} | null> {
  const cookie = (await cookies()).get(accessCookieName(gallery.token))?.value;
  if (!cookie?.startsWith('invite:')) return null;
  const { data } = await db.from('gallery_participants').select('person_id, role')
    .eq('gallery_id', gallery.id)
    .eq('access_token_hash', cookie.slice('invite:'.length)).eq('status', 'approved').maybeSingle();
  return data;
}

/** Shared is not sufficient: a gallery can be deliberately time-bound. */
export async function visitorCanAccessGallery(gallery: GalleryVisitorGate): Promise<boolean> {
  if (!gallery.shared_at || galleryHasExpired(gallery.expires_on)) return false;
  if (gallery.access_mode === 'link') return true;
  const cookie = (await cookies()).get(accessCookieName(gallery.token))?.value;
  if (gallery.access_mode === 'code') return !!cookie && !!gallery.access_code_hash
    && (cookie === gallery.access_code_hash || cookie === `code:${gallery.access_code_hash}`);
  if (!cookie?.startsWith('invite:')) return false;
  const { data } = await db.from('gallery_participants').select('id')
    .eq('gallery_id', gallery.id).eq('access_token_hash', cookie.slice('invite:'.length))
    .eq('status', 'approved').maybeSingle();
  return !!data;
}

export async function assertVisitorCanAccessGallery(gallery: GalleryVisitorGate): Promise<void> {
  if (!await visitorCanAccessGallery(gallery)) {
    throw new Error('That gallery is not available');
  }
}

/** A role-limited section must protect actions as well as the visible grid. */
export async function assertVisitorCanUseGalleryFile(
  gallery: GalleryVisitorGate,
  fileId: string,
): Promise<void> {
  const { data } = await db.from('gallery_files')
    .select('id, section:gallery_sections(visible_to_clients, audience_role)')
    .eq('gallery_id', gallery.id).eq('file_id', fileId).maybeSingle();
  const member = data as unknown as {
    id: string;
    section: { visible_to_clients: boolean; audience_role: 'main_client' | 'guest' | 'vendor' | null } | null;
  } | null;
  if (!member?.section?.visible_to_clients) throw new Error('That picture is not available to you');
  if (!member.section.audience_role) return;
  const participant = await invitedParticipantForGallery(gallery);
  if (participant?.role !== member.section.audience_role) {
    throw new Error('That picture is not available to you');
  }
}

/** The galleries made from one job. */
export async function galleriesForJob(jobId: string): Promise<GallerySummary[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db
    .from('galleries')
    .select('id, name, token, shared_at, expires_on, access_mode, may_download, cover_file_id, price_list_id, '
      + 'gallery_theme, gallery_font, gallery_grid, cover_style, '
      + 'gallery_files(file_id, section_id, file:files(name, mime_type)), '
      + 'sections:gallery_sections(id, name, position, visible_to_clients, audience_role, gallery_files(id)), '
      + 'collections:gallery_collections(id, name, kind, max_items, due_on, submitted_at, '
      + 'person:people(name, email), items:gallery_collection_files(id)), '
      + 'comments:gallery_comments(id, body, created_at, person:people(name), file:files(name)), '
      + 'participants:gallery_participants(id, role, status, person:people(name, email)), '
      + 'hub_requests:gallery_hub_requests(id, title, purpose, due_on, status, members:gallery_hub_members(id, submitted_at)), '
      + 'albums:gallery_albums(id, name, status, spreads:gallery_album_spreads(id))')
    .eq('studio_id', who.studioId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to read the galleries:', error);
    throw new Error('Could not read the galleries on this job');
  }

  return ((data ?? []) as unknown as {
    id: string; name: string; token: string; shared_at: string | null;
    expires_on: string | null; access_mode: 'link' | 'code' | 'invite'; may_download: boolean;
    cover_file_id: string | null; price_list_id: string | null;
    gallery_theme: GalleryDesign['theme']; gallery_font: GalleryDesign['font'];
    gallery_grid: GalleryDesign['grid']; cover_style: GalleryDesign['coverStyle'];
    gallery_files: { file_id: string; section_id: string; file: { name: string; mime_type: string | null } | null }[];
    sections: {
      id: string; name: string; position: number; visible_to_clients: boolean;
      audience_role: 'main_client' | 'guest' | 'vendor' | null;
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
    participants: {
      id: string; role: 'main_client' | 'guest' | 'vendor'; status: 'invited' | 'approved' | 'revoked';
      person: { name: string; email: string | null } | null;
    }[];
    hub_requests: {
      id: string; title: string; purpose: 'selection' | 'album' | 'retouch' | 'approval'; due_on: string | null; status: 'open' | 'closed';
      members: { id: string; submitted_at: string | null }[];
    }[];
    albums: { id: string; name: string; status: 'draft' | 'review' | 'approved'; spreads: { id: string }[] }[];
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
    design: { theme: g.gallery_theme, font: g.gallery_font, grid: g.gallery_grid, coverStyle: g.cover_style },
    sections: (g.sections ?? []).sort((a, b) => a.position - b.position).map((section) => ({
      id: section.id,
      name: section.name,
      position: section.position,
      visibleToClients: section.visible_to_clients,
      audienceRole: section.audience_role,
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
    participants: (g.participants ?? []).map((participant) => ({
      id: participant.id,
      name: participant.person?.name ?? 'Unknown person',
      email: participant.person?.email ?? null,
      role: participant.role,
      status: participant.status,
    })),
    hubRequests: (g.hub_requests ?? []).map((request) => ({
      id: request.id, title: request.title, purpose: request.purpose, dueOn: request.due_on, status: request.status,
      collaborators: (request.members ?? []).length,
      submitted: (request.members ?? []).filter((member) => !!member.submitted_at).length,
    })),
    albums: (g.albums ?? []).map((album) => ({
      id: album.id, name: album.name, status: album.status, spreads: (album.spreads ?? []).length,
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
    .select('id, name, may_download, price_list_id, gallery_theme, gallery_font, gallery_grid, cover_style, '
      + 'sections:gallery_template_sections(id, name, position, visible_to_clients)')
    .eq('studio_id', who.studioId).order('created_at', { ascending: true });
  if (error) throw new Error('Could not read gallery templates');
  return ((data ?? []) as unknown as {
    id: string; name: string; may_download: boolean; price_list_id: string | null;
    gallery_theme: GalleryDesign['theme']; gallery_font: GalleryDesign['font'];
    gallery_grid: GalleryDesign['grid']; cover_style: GalleryDesign['coverStyle'];
    sections: { id: string; name: string; position: number; visible_to_clients: boolean }[];
  }[]).map((template) => ({
    id: template.id, name: template.name, mayDownload: template.may_download,
    priceListId: template.price_list_id,
    design: { theme: template.gallery_theme, font: template.gallery_font, grid: template.gallery_grid, coverStyle: template.cover_style },
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
    .select('id, may_download, price_list_id, gallery_theme, gallery_font, gallery_grid, cover_style, '
      + 'sections:gallery_sections(name, position, visible_to_clients)')
    .eq('id', input.galleryId).eq('studio_id', who.studioId).maybeSingle();
  if (!gallery) throw new Error('That gallery is not in this studio');
  const source = gallery as unknown as {
    may_download: boolean; price_list_id: string | null;
    gallery_theme: GalleryDesign['theme']; gallery_font: GalleryDesign['font'];
    gallery_grid: GalleryDesign['grid']; cover_style: GalleryDesign['coverStyle'];
    sections: { name: string; position: number; visible_to_clients: boolean }[];
  };
  const { data: template, error } = await db.from('gallery_templates').insert({
    studio_id: who.studioId, name, may_download: source.may_download, price_list_id: source.price_list_id,
    gallery_theme: source.gallery_theme, gallery_font: source.gallery_font,
    gallery_grid: source.gallery_grid, cover_style: source.cover_style,
  }).select('id').single();
  if (error || !template) throw new Error('Could not save that template');
  const sections = (source.sections ?? [])
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
    gallery_theme: GalleryDesign['theme']; gallery_font: GalleryDesign['font'];
    gallery_grid: GalleryDesign['grid']; cover_style: GalleryDesign['coverStyle'];
    sections: { name: string; position: number; visible_to_clients: boolean }[];
  };
  let template: TemplateSeed | null = null;
  if (input.templateId) {
    const { data, error } = await db.from('gallery_templates')
      .select('may_download, price_list_id, gallery_theme, gallery_font, gallery_grid, cover_style, '
        + 'sections:gallery_template_sections(name, position, visible_to_clients)')
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
      gallery_theme: template?.gallery_theme ?? 'paper',
      gallery_font: template?.gallery_font ?? 'modern',
      gallery_grid: template?.gallery_grid ?? 'story',
      cover_style: template?.cover_style ?? 'single',
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

/** Limit one gallery section to a named invitation role, or return it to everyone. */
export async function setSectionAudience(input: {
  galleryId: string; jobId: string; sectionId: string;
  audienceRole: 'main_client' | 'guest' | 'vendor' | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  if (input.audienceRole) {
    const { data: gallery } = await db.from('galleries').select('access_mode')
      .eq('id', input.galleryId).eq('studio_id', who.studioId).maybeSingle();
    if (!gallery || gallery.access_mode !== 'invite') {
      throw new Error('Use invited-people-only access before limiting a section by role');
    }
  }
  const { error } = await db.from('gallery_sections').update({ audience_role: input.audienceRole })
    .eq('id', input.sectionId).eq('gallery_id', input.galleryId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not change section access');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: 'section_audience_changed', actor_id: who.personId,
    payload: { section: input.sectionId, audienceRole: input.audienceRole },
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

/** Set one named presentation choice for a gallery, never raw CSS supplied by a browser. */
export async function setGalleryDesign(input: {
  galleryId: string; jobId: string; design: GalleryDesign;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const allowed = {
    theme: ['paper', 'midnight', 'cobalt', 'rose'],
    font: ['modern', 'editorial', 'mono'],
    grid: ['story', 'tiles', 'columns'],
    coverStyle: ['single', 'split', 'filmstrip'],
  } as const;
  if (!allowed.theme.includes(input.design.theme)
    || !allowed.font.includes(input.design.font)
    || !allowed.grid.includes(input.design.grid)
    || !allowed.coverStyle.includes(input.design.coverStyle)) {
    throw new Error('Choose a gallery design from the available styles');
  }
  const { error } = await db.from('galleries').update({
    gallery_theme: input.design.theme, gallery_font: input.design.font,
    gallery_grid: input.design.grid, cover_style: input.design.coverStyle,
  }).eq('id', input.galleryId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not update gallery design');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: 'design_changed', actor_id: who.personId, payload: input.design,
  });
  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath('/g/[token]', 'page');
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
  galleryId: string; jobId: string; mode: 'link' | 'code' | 'invite'; code?: string;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const code = input.code?.trim() ?? '';
  if (input.mode === 'code' && code.length < 6) {
    throw new Error('An access code needs at least 6 characters');
  }
  if (input.mode !== 'invite') {
    const { count, error: audienceError } = await db.from('gallery_sections')
      .select('id', { count: 'exact', head: true })
      .eq('gallery_id', input.galleryId).eq('studio_id', who.studioId)
      .not('audience_role', 'is', null);
    if (audienceError) throw new Error('Could not check section access');
    if ((count ?? 0) > 0) {
      throw new Error('Return role-limited sections to everyone before changing gallery access');
    }
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

/** Invite a named participant with a revocable, opaque link. */
export async function inviteGalleryParticipant(input: {
  galleryId: string; jobId: string; email: string; name?: string;
  role: 'main_client' | 'guest' | 'vendor';
}): Promise<{ invite: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const { data: gallery } = await db.from('galleries').select('id')
    .eq('id', input.galleryId).eq('studio_id', who.studioId).maybeSingle();
  if (!gallery) throw new Error('That gallery is not in this studio');
  const personId = await findOrCreateGalleryPerson({
    studioId: who.studioId, galleryId: gallery.id, email: input.email, name: input.name,
  });
  const invite = randomBytes(24).toString('hex');
  const { error } = await db.from('gallery_participants').upsert({
    studio_id: who.studioId, gallery_id: gallery.id, person_id: personId, role: input.role,
    status: 'invited', access_token_hash: codeHash(invite), invited_at: new Date().toISOString(),
    approved_at: null, revoked_at: null,
  }, { onConflict: 'gallery_id,person_id' });
  if (error) throw new Error('Could not create that invitation');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: gallery.id,
    action: 'participant_invited', actor_id: who.personId,
    payload: { email: input.email.trim().toLowerCase(), role: input.role },
  });
  revalidatePath(`/jobs/${input.jobId}`);
  return { invite };
}

export async function revokeGalleryParticipant(input: {
  galleryId: string; jobId: string; participantId: string;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const { error } = await db.from('gallery_participants').update({
    status: 'revoked', revoked_at: new Date().toISOString(),
  }).eq('id', input.participantId).eq('gallery_id', input.galleryId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not revoke that access');
  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'gallery', subject_id: input.galleryId,
    action: 'participant_revoked', actor_id: who.personId, payload: { participant: input.participantId },
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
      + 'gallery_theme, gallery_font, gallery_grid, cover_style, '
      + 'cover_file_id, studio:studios(name), '
      + 'sections:gallery_sections(id, name, position, visible_to_clients, audience_role, '
      + 'items:gallery_files(position, file:files(id, name, storage_path, mime_type))), '
      + 'albums:gallery_albums(id, name, status, spreads:gallery_album_spreads(id, position, caption, left_file_id, right_file_id, '
      + 'comments:gallery_album_comments(id, body, parent_id, created_at, person:people(name))))')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    console.error('Failed to open the gallery:', error);
    return null;
  }
  if (!data) return null;

  const g = data as unknown as {
    id: string; name: string; token: string; shared_at: string | null;
    expires_on: string | null; access_mode: 'link' | 'code' | 'invite'; access_code_hash: string | null;
    may_download: boolean; cover_file_id: string | null; studio: { name: string } | null;
    gallery_theme: GalleryDesign['theme']; gallery_font: GalleryDesign['font'];
    gallery_grid: GalleryDesign['grid']; cover_style: GalleryDesign['coverStyle'];
    sections: {
      id: string; name: string; position: number; visible_to_clients: boolean;
      audience_role: 'main_client' | 'guest' | 'vendor' | null;
      items: { position: number; file: { id: string; name: string; storage_path: string; mime_type: string | null } | null }[];
    }[];
    albums: {
      id: string; name: string; status: 'draft' | 'review' | 'approved';
      spreads: {
        id: string; position: number; caption: string | null; left_file_id: string | null; right_file_id: string | null;
        comments: { id: string; body: string; parent_id: string | null; created_at: string; person: { name: string } | null }[];
      }[];
    }[];
  };

  if (!g.shared_at || galleryHasExpired(g.expires_on)) return null;
  if (!await visitorCanAccessGallery(g)) {
    return { locked: true, name: g.name, token: g.token, studioName: g.studio?.name ?? 'The studio' };
  }
  const participant = await invitedParticipantForGallery(g);

  const sections = (g.sections ?? [])
    .filter((section) => section.visible_to_clients
      && (!section.audience_role || section.audience_role === participant?.role))
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
    design: { theme: g.gallery_theme, font: g.gallery_font, grid: g.gallery_grid, coverStyle: g.cover_style },
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
    albums: (g.albums ?? []).filter((album) => album.status !== 'draft').map((album) => ({
      id: album.id, name: album.name, status: album.status === 'approved' ? 'approved' : 'review',
      spreads: (album.spreads ?? []).filter((spread) => {
        const allowed = new Set(items.map((item) => item.file!.id));
        return (!spread.left_file_id || allowed.has(spread.left_file_id)) && (!spread.right_file_id || allowed.has(spread.right_file_id));
      }).sort((a, b) => a.position - b.position).map((spread) => ({
        id: spread.id, caption: spread.caption, leftFileId: spread.left_file_id, rightFileId: spread.right_file_id,
        comments: (spread.comments ?? []).map((comment) => ({
          id: comment.id, body: comment.body, authorName: comment.person?.name ?? 'A collaborator',
          parentId: comment.parent_id, createdAt: comment.created_at,
        })),
      })),
    })),
  };
}

/** Prove an access code once, then keep only its hash in an HTTP-only cookie. */
export async function unlockGallery(input: { token: string; code: string }): Promise<void> {
  const { data } = await db.from('galleries')
    .select('id, token, shared_at, expires_on, access_mode, access_code_hash')
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

/**
 * Which person an email means, inside one gallery.
 *
 * A studio can hold TWO people with the same address, and legitimately: a
 * booking request always makes a new person rather than attaching a stranger
 * to an existing client on the strength of a typed email. Ask twice and
 * there are two rows.
 *
 * This used to be `.eq(email).maybeSingle()`, which does not return the first
 * of two — it THROWS. So anyone who enquired twice was locked out of their
 * own pictures, silently, and the studio had no way to know.
 *
 * Resolving it is not a coin toss. The gallery knows who it is for: the
 * client of the job it hangs off. That is the row the studio means, and the
 * one their keeps and orders should land on. Failing that, the oldest, so
 * the answer is at least the same every time.
 */
async function findOrCreateGalleryPerson(input: {
  studioId: string; galleryId: string; email: string; name?: string;
}): Promise<string> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw new Error('An email is needed');

  const { data: found } = await db.from('people').select('id')
    .eq('studio_id', input.studioId).eq('email', email)
    .order('created_at', { ascending: true });

  const rows = found ?? [];
  if (rows.length === 1) return rows[0].id;

  if (rows.length > 1) {
    /*
     * Only when there is a choice to make, so the ordinary visit still costs
     * one query. Several rows is the uncommon case and can afford a second.
     */
    const { data: gallery } = await db.from('galleries')
      .select('job:jobs(client_id)').eq('id', input.galleryId).maybeSingle();
    const client = (gallery as unknown as { job: { client_id: string | null } | null } | null)
      ?.job?.client_id ?? null;
    console.warn(
      `${rows.length} people in studio ${input.studioId} share ${email}. `
      + 'Resolving to the one this gallery is for; they want merging.',
    );
    return rows.find((row) => row.id === client)?.id ?? rows[0].id;
  }

  const { data: made, error } = await db.from('people').insert({
    studio_id: input.studioId, name: input.name?.trim() || email, email,
  }).select('id').single();
  if (error || !made) throw new Error('Could not identify this visitor');
  return made.id;
}

/** An invite identifies its participant; links and codes fall back to declared email. */
export async function visitorPersonForGallery(
  gallery: GalleryVisitorGate & { studio_id: string }, email: string, name?: string,
): Promise<string> {
  const invited = await invitedParticipantForGallery(gallery);
  if (invited) return invited.person_id;
  return findOrCreateGalleryPerson({
    studioId: gallery.studio_id, galleryId: gallery.id, email, name,
  });
}

/** A declared visitor opening a gallery is an event, not a counter to maintain. */
export async function recordGalleryView(input: { token: string; email: string }): Promise<void> {
  const { data: gallery } = await db.from('galleries')
    .select('id, studio_id, token, shared_at, expires_on, access_mode, access_code_hash')
    .eq('token', input.token).maybeSingle();
  if (!gallery || !await visitorCanAccessGallery(gallery as GalleryVisitorGate)) return;
  const personId = await visitorPersonForGallery(gallery as GalleryVisitorGate & { studio_id: string }, input.email);
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
  await assertVisitorCanUseGalleryFile(gallery as GalleryVisitorGate, input.fileId);
  const personId = await visitorPersonForGallery(gallery as GalleryVisitorGate & { studio_id: string }, input.email);
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
  await assertVisitorCanUseGalleryFile(gallery as GalleryVisitorGate, input.fileId);
  const body = input.body.trim();
  if (!body) throw new Error('Write a comment first');
  if (body.length > 2_000) throw new Error('Keep a comment under 2,000 characters');
  const personId = await visitorPersonForGallery(gallery as GalleryVisitorGate & { studio_id: string }, input.email);
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
    studioId: who.studioId, galleryId: gallery.id, email: input.email, name: input.email,
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
  const invited = await invitedParticipantForGallery(gallery as GalleryVisitorGate);
  let personId = invited?.person_id ?? null;
  if (!personId) {
    const email = input.email.trim().toLowerCase();
    if (!email.includes('@')) return [];
    /* One rule for who an email means, not a second copy that drifts. */
    personId = await findOrCreateGalleryPerson({
      studioId: gallery.studio_id, galleryId: gallery.id, email,
    });
  }
  if (!personId) return [];

  const { data, error } = await db.from('gallery_collections')
    .select('id, name, kind, max_items, due_on, submitted_at, items:gallery_collection_files(file_id)')
    .eq('gallery_id', gallery.id).eq('person_id', personId).order('created_at', { ascending: true });
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
  const personId = await visitorPersonForGallery(gallery as GalleryVisitorGate & { studio_id: string }, input.email);
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
  await assertVisitorCanUseGalleryFile(gallery as GalleryVisitorGate, input.fileId);
  const personId = await visitorPersonForGallery(gallery as GalleryVisitorGate & { studio_id: string }, input.email);
  const { data: collection } = await db.from('gallery_collections')
    .select('id, kind, max_items, due_on, submitted_at')
    .eq('id', input.collectionId).eq('gallery_id', gallery.id).eq('person_id', personId).maybeSingle();
  if (!collection) throw new Error('That collection is not yours');
  if (collection.submitted_at) throw new Error('That selection was already sent to the studio');
  if (collection.due_on && collection.due_on < new Date().toISOString().slice(0, 10)) {
    throw new Error('That selection request has expired');
  }

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
  const personId = await visitorPersonForGallery(gallery as GalleryVisitorGate & { studio_id: string }, input.email);
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
 * An invitation identifies its participant; open links identify by email.
 * Either way, favourites land in the SAME table as the studio's selects,
 * attributed to a real person, so "are these the ones they want" has an
 * answer rather than a guess.
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

  await assertVisitorCanUseGalleryFile(gallery as GalleryVisitorGate, input.fileId);

  const personId = await visitorPersonForGallery(
    gallery as GalleryVisitorGate & { studio_id: string }, input.email, input.name,
  );

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

  const invited = await invitedParticipantForGallery(gallery as GalleryVisitorGate);
  let personId = invited?.person_id ?? null;
  if (!personId) {
    const { data: person } = await db
      .from('people').select('id')
      .eq('studio_id', gallery.studio_id)
      .eq('email', input.email.trim().toLowerCase())
      .maybeSingle();
    personId = person?.id ?? null;
  }
  if (!personId) return [];

  const { data } = await db
    .from('gallery_files')
    .select('file_id, choices:files(choices(person_id))')
    .eq('gallery_id', gallery.id);

  const ids = ((data ?? []) as unknown as {
    file_id: string; choices: { choices: { person_id: string }[] } | null;
  }[])
    .filter((r) => (r.choices?.choices ?? []).some((c) => c.person_id === personId))
    .map((r) => r.file_id);

  return ids;
}

/**
 * Every gallery in the studio, newest first, with a cover to look at.
 *
 * A studio thinks in galleries as much as in jobs - "where is the Okafor set" -
 * so they get an index of their own rather than only existing inside the job
 * that produced them.
 */
export async function allGalleries(): Promise<{
  id: string; name: string; token: string; jobId: string | null;
  clientName: string | null; sharedAt: string | null; expiresOn: string | null;
  howMany: number; coverUrl: string | null; orders: number;
}[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db
    .from('galleries')
    .select('id, name, token, job_id, shared_at, expires_on, cover_file_id, '
      + 'job:jobs(client:people(name)), '
      + 'items:gallery_files(file:files(id, storage_path, mime_type)), '
      + 'orders:orders(id)')
    .eq('studio_id', who.studioId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to read the galleries:', error);
    throw new Error('Could not read the galleries');
  }

  const rows = (data ?? []) as unknown as {
    id: string; name: string; token: string; job_id: string | null;
    shared_at: string | null; expires_on: string | null; cover_file_id: string | null;
    job: { client: { name: string } | null } | null;
    items: { file: { id: string; storage_path: string; mime_type: string | null } | null }[];
    orders: { id: string }[];
  }[];

  /*
   * One signing call for every cover rather than one per gallery. Signing is a
   * round trip and an index of forty galleries would otherwise be forty of them
   * before the page could draw.
   */
  const covers = rows.map((g) => {
    const pictures = (g.items ?? [])
      .map((i) => i.file)
      .filter((f): f is NonNullable<typeof f> => !!f && (f.mime_type ?? '').startsWith('image/'));
    const chosen = pictures.find((f) => f.id === g.cover_file_id) ?? pictures[0] ?? null;
    return { id: g.id, path: chosen?.storage_path ?? null };
  });

  const paths = covers.map((c) => c.path).filter((p): p is string => !!p);
  const urlFor = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await db.storage
      .from('weave-files').createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlFor.set(s.path, s.signedUrl);
    }
  }

  return rows.map((g, i) => ({
    id: g.id,
    name: g.name,
    token: g.token,
    jobId: g.job_id,
    clientName: g.job?.client?.name ?? null,
    sharedAt: g.shared_at,
    expiresOn: g.expires_on,
    howMany: (g.items ?? []).length,
    coverUrl: ((path) => (path ? urlFor.get(path) ?? null : null))(covers[i].path),
    orders: (g.orders ?? []).length,
  }));
}
