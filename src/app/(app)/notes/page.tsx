import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listNotes } from '@/modules/notes/interface';
import { NotesBoard } from './NotesBoard';

export const dynamic = 'force-dynamic';

/**
 * The studio's notes.
 *
 * Everything else this app writes down is written down ABOUT something — a
 * booking's brief, a client's notes, an invoice's notes. What had nowhere to
 * live is the rest, and it is not less important for having no row to hang off:
 * ring the framer about 20x30 stock, the second shooter is away in June, what
 * to say in the follow-up.
 *
 * Loaded whole and searched in the browser. A studio's notes are counted in
 * dozens, and a round trip per keystroke to filter forty rows would be slower
 * than not doing it.
 */
export default async function NotesPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const notes = await listNotes();

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Notes</h1>
          <p className="q-page-subtitle">
            What the studio needs to remember and nothing else has a place for.
          </p>
        </div>
      </header>

      <NotesBoard initial={notes} />
    </div>
  );
}
