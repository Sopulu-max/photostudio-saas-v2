'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  amendMember, placeToPutFace, recordFace, removeFace, theyLeft, theyReturned,
} from '@/weave/team/actions';
import { sayLeaving, worksHere, type TeamMember } from '@/weave/team/shape';

/**
 * Changing somebody who works here.
 *
 * Its own page, because the page about a person should be about the person:
 * a form this size sitting under their name made the profile into a settings
 * screen, and the thing a studio comes to look at — what they are carrying —
 * was pushed above a card twice its height.
 *
 * THE ROLE IS CHANGED HERE. Putting somebody on a booking fills a blank role,
 * because that is the moment a studio first needs the word, but it will not
 * overwrite one — and the crew panel says it is changed on the team page, so
 * this is what that promise means.
 */
export function EditMember({ member, face }: { member: TeamMember; face: string | null }) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [working, start] = useTransition();
  const picker = useRef<HTMLInputElement | null>(null);

  const run = (fn: () => Promise<unknown>) => {
    setProblem(null);
    start(async () => {
      try { await fn(); } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That did not work');
      }
    });
  };

  /**
   * The picture goes straight from the browser to storage.
   *
   * A photograph is megabytes, and sending it through a server action would
   * put every one of them through the application's memory for nothing. The
   * server hands out a one-shot signed URL and is told afterwards what landed.
   */
  async function takeFace(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProblem('A picture, not that kind of file');
      return;
    }

    setProblem(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { path, token } = await placeToPutFace({
        personId: member.id, name: file.name,
      });
      const { error } = await supabase.storage
        .from('weave-files').uploadToSignedUrl(path, token, file);
      if (error) throw new Error('That picture did not upload');

      await recordFace({ personId: member.id, storagePath: path });
      router.refresh();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That picture did not go on');
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = '';
    }
  }

  return (
    <div className="q-stack q-stack-md">
      <section className="q-card q-stack q-stack-sm">
        <h2 className="q-reading">Picture</h2>
        <div className="q-row q-row-sm">
          <span className="q-face q-face-lg">
            {face
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={face} alt="" />
              /* Initials rather than a silhouette: a studio recognises its
               * own people by name, and a grey head says nothing. */
              : <span className="q-face-bare">{member.name.slice(0, 1)}</span>}
          </span>

          <span className="q-row q-row-sm">
            <button
              type="button" className="q-btn q-btn-secondary q-btn-sm"
              disabled={busy || working} onClick={() => picker.current?.click()}
            >
              {busy ? 'Uploading' : face ? 'Replace' : 'Add a picture'}
            </button>
            {face && (
              <button
                type="button" className="q-btn q-btn-ghost q-btn-sm"
                disabled={busy || working}
                onClick={() => run(async () => {
                  await removeFace({ personId: member.id });
                  router.refresh();
                })}
              >
                Remove
              </button>
            )}
          </span>

          <input
            ref={picker} type="file" accept="image/*" className="q-sr-file"
            onChange={(event) => { void takeFace(event.target.files); }}
          />
        </div>
      </section>

      <section className="q-card q-stack q-stack-sm">
        <form
          className="q-stack q-stack-sm"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(async () => {
              await amendMember({
                personId: member.id,
                name: String(form.get('name') ?? ''),
                role: String(form.get('role') ?? ''),
                email: String(form.get('email') ?? ''),
                phone: String(form.get('phone') ?? ''),
              });
              router.push(`/team/${member.id}`);
            });
          }}
        >
          <div className="q-field">
            <label className="q-label" htmlFor="name">Name</label>
            <input
              className="q-input" id="name" name="name"
              defaultValue={member.name} disabled={working}
            />
          </div>

          <div className="q-field">
            <label className="q-label" htmlFor="role">Role</label>
            <input
              className="q-input" id="role" name="role"
              defaultValue={member.role ?? ''} disabled={working}
              placeholder="Photographer, second shooter, video"
            />
            <span className="q-meta-sm">
              Goes on the person&rsquo;s record and travels to every booking.
            </span>
          </div>

          <div className="q-field">
            <label className="q-label" htmlFor="email">Email</label>
            <input
              className="q-input" id="email" name="email" type="email"
              defaultValue={member.email ?? ''} disabled={working}
            />
          </div>

          <div className="q-field">
            <label className="q-label" htmlFor="phone">Phone</label>
            <input
              className="q-input" id="phone" name="phone" type="tel"
              defaultValue={member.phone ?? ''} disabled={working}
            />
          </div>

          <div className="q-row q-row-between">
            <span className="q-meta">{working ? 'Saving' : said ?? ''}</span>
            <button className="q-btn q-btn-primary q-btn-sm" type="submit" disabled={working}>
              Save
            </button>
          </div>
        </form>
      </section>

      <section className="q-card q-stack q-stack-sm">
        <h2 className="q-reading">
          {worksHere(member) ? 'Works here' : 'No longer works here'}
        </h2>
        {worksHere(member) ? (
          <button
            type="button" className="q-btn q-btn-ghost q-btn-sm q-start-btn"
            disabled={working}
            onClick={() => {
              /*
               * Not a block. A studio knows its own business and somebody can
               * go with bookings still on the books; what must not happen is
               * finding out afterwards that they were on next week's wedding.
               */
              const warn = sayLeaving(member);
              setSaid(warn ? `${warn} They stay on them.` : null);
              run(async () => {
                await theyLeft({ personId: member.id });
                router.refresh();
              });
            }}
          >
            Mark as left
          </button>
        ) : (
          <button
            type="button" className="q-btn q-btn-secondary q-btn-sm q-start-btn"
            disabled={working}
            onClick={() => run(async () => {
              await theyReturned({ personId: member.id });
              router.refresh();
            })}
          >
            They are back
          </button>
        )}
        {said && <p className="q-note">{said}</p>}
      </section>

      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </div>
  );
}
