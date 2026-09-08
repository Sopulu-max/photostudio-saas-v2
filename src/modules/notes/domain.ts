'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { revalidatePath } from 'next/cache';
// A failure keeps the reason it failed — and says so plainly when the reason
// is that the database was never reached. See kernel/errors.
import { dbError } from '@/kernel/errors';

/**
 * The studio's own working memory.
 *
 * Everything else written down in this app is written down ABOUT something — a
 * booking's brief, a client's notes, an invoice's notes. Each is a text column
 * on the row that needed it. What had nowhere to live is the rest: ring the
 * framer about 20x30 stock, the second shooter is away in June, what to say in
 * the follow-up.
 *
 * A note is a body, an author and a time. Everything else is optional, because
 * a note is worth keeping the moment it is typed and a title it never gets is
 * not a defect.
 */

/** The kinds of thing a note can be about. Mirrors the database's own check. */
export type NoteAbout = 'booking' | 'client';

export type Note = {
  id: string;
  title: string | null;
  body: string;
  pinned: boolean;
  authorName: string | null;
  /** Null for a note about nothing in particular, which is most of them. */
  aboutType: NoteAbout | null;
  aboutId: string | null;
  createdAt: string;
  updatedAt: string;
};

const SELECT =
  'id, title, body, pinned, about_type, about_id, created_at, updated_at, author:contacts(display_name)';

function shape(r: any): Note {
  return {
    id: r.id,
    title: r.title ?? null,
    body: r.body ?? '',
    pinned: Boolean(r.pinned),
    authorName: r.author?.display_name ?? null,
    aboutType: (r.about_type ?? null) as NoteAbout | null,
    aboutId: r.about_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Every note this studio keeps, pinned first and then by when it was last
 * touched — which is the order a person actually wants them in, and the order
 * the index is built for.
 */
export async function listNotes(): Promise<Note[]> {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('notes')
    .select(SELECT)
    .eq('organization_id', orgId)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('Failed to list notes:', error);
    return [];
  }
  return ((data || []) as any[]).map(shape);
}

export async function getNote(id: string): Promise<Note | null> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('notes').select(SELECT)
    .eq('id', id).eq('organization_id', orgId).maybeSingle();
  return data ? shape(data) : null;
}

/**
 * Start a note.
 *
 * An empty one is allowed, and is the normal way to start: a person clicks New
 * and then types. Refusing until there are words would mean the first thing the
 * app does with a thought is lose it.
 */
export async function createNote(input?: {
  title?: string | null;
  body?: string;
  /*
   * What it is about, when it is written from that thing's own page.
   *
   * Both or neither — the database refuses half of it, because a type with no
   * id points nowhere and an id with no type cannot be resolved.
   */
  about?: { type: NoteAbout; id: string };
}) {
  const { orgId, contactId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('notes')
    .insert({
      organization_id: orgId,
      author_id: contactId ?? null,
      title: (input?.title || '').trim() || null,
      body: input?.body ?? '',
      about_type: input?.about?.type ?? null,
      about_id: input?.about?.id ?? null,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('Failed to create a note:', error);
    throw dbError('The note could not be created.', error);
  }
  revalidatePath('/notes');
  return { noteId: data.id as string };
}

/**
 * Save a note.
 *
 * updated_at is set here rather than left to a trigger, because the list is
 * ordered by it and a save that did not move the note to the top would look
 * like a save that did not happen.
 */
export async function updateNote(input: {
  id: string;
  title?: string | null;
  body?: string;
}) {
  const { orgId } = await getAuthOrgId();
  /* updated_at is the database's to set — a trigger does it. Stamping it
     here compared this machine's clock against the one that wrote every other
     row, and a note edited on a slow clock sank instead of rising. */
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = (input.title || '').trim() || null;
  if (input.body !== undefined) patch.body = input.body;
  /* Nothing said, nothing written. Previously the timestamp made every call a
     write; without it an update of no fields is a malformed request, and a
     save that changes nothing should not be one anyway. */
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabaseAdmin
    .from('notes').update(patch)
    .eq('id', input.id).eq('organization_id', orgId);
  if (error) {
    console.error('Failed to save a note:', error);
    throw dbError('The note could not be saved.', error);
  }
  revalidatePath('/notes');
  return { ok: true };
}

/** Keep it at the top, or stop. */
export async function setNotePinned(input: { id: string; pinned: boolean }) {
  const { orgId } = await getAuthOrgId();
  const { error } = await supabaseAdmin
    .from('notes').update({ pinned: input.pinned })
    .eq('id', input.id).eq('organization_id', orgId);
  if (error) {
    console.error('Failed to pin a note:', error);
    throw dbError('That could not be changed.', error);
  }
  revalidatePath('/notes');
  return { ok: true };
}

/**
 * Remove a note for good.
 *
 * Unguarded on purpose, unlike a deliverable: nothing else in the app points at
 * a note, so nothing can lose its meaning when one goes. The asking is the
 * interface's job, and it does ask.
 */
export async function deleteNote(id: string) {
  const { orgId } = await getAuthOrgId();
  const { error } = await supabaseAdmin
    .from('notes').delete()
    .eq('id', id).eq('organization_id', orgId);
  if (error) {
    console.error('Failed to remove a note:', error);
    throw dbError('The note could not be removed.', error);
  }
  revalidatePath('/notes');
  return { ok: true };
}

/**
 * The notes about one thing.
 *
 * Ordered the same way the whole list is — pinned first, then by when it was
 * last touched — so a booking's notes and the notes app do not disagree about
 * which note matters most.
 */
export async function listNotesAbout(about: { type: NoteAbout; id: string }): Promise<Note[]> {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('notes')
    .select(SELECT)
    .eq('organization_id', orgId)
    .eq('about_type', about.type)
    .eq('about_id', about.id)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('Failed to list notes about that:', error);
    return [];
  }
  return ((data || []) as any[]).map(shape);
}

/**
 * Say what a note is about, or that it is about nothing after all.
 *
 * Passing null for `about` detaches it — the note survives, because what it
 * says was worth keeping whether or not it turned out to belong to that
 * booking. Progressive enrichment runs both ways: a thought can become a note
 * about a job, and a note about a job can turn out to be a thought.
 */
export async function setNoteAbout(input: {
  id: string;
  about: { type: NoteAbout; id: string } | null;
}) {
  const { orgId } = await getAuthOrgId();
  const { error } = await supabaseAdmin
    .from('notes')
    .update({
      about_type: input.about?.type ?? null,
      about_id: input.about?.id ?? null,
    })
    .eq('id', input.id).eq('organization_id', orgId);
  if (error) {
    console.error('Failed to say what a note is about:', error);
    throw dbError('That could not be changed.', error);
  }
  revalidatePath('/notes');
  return { ok: true };
}
