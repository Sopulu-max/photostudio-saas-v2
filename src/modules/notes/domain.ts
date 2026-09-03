'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { revalidatePath } from 'next/cache';

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

export type Note = {
  id: string;
  title: string | null;
  body: string;
  pinned: boolean;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
};

const SELECT = 'id, title, body, pinned, created_at, updated_at, author:contacts(display_name)';

function shape(r: any): Note {
  return {
    id: r.id,
    title: r.title ?? null,
    body: r.body ?? '',
    pinned: Boolean(r.pinned),
    authorName: r.author?.display_name ?? null,
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
export async function createNote(input?: { title?: string | null; body?: string }) {
  const { orgId, contactId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('notes')
    .insert({
      organization_id: orgId,
      author_id: contactId ?? null,
      title: (input?.title || '').trim() || null,
      body: input?.body ?? '',
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('Failed to create a note:', error);
    throw new Error('The note could not be created.');
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
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = (input.title || '').trim() || null;
  if (input.body !== undefined) patch.body = input.body;

  const { error } = await supabaseAdmin
    .from('notes').update(patch)
    .eq('id', input.id).eq('organization_id', orgId);
  if (error) {
    console.error('Failed to save a note:', error);
    throw new Error('The note could not be saved.');
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
    throw new Error('That could not be changed.');
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
    throw new Error('The note could not be removed.');
  }
  revalidatePath('/notes');
  return { ok: true };
}
