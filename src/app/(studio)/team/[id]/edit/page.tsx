import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { facesFor, readMember } from '@/weave/team/actions';
import { EditMember } from './EditMember';

export const dynamic = 'force-dynamic';

/**
 * Changing somebody who works here.
 *
 * Its own page. The profile is for looking at a person — their picture, what
 * they do, what they are carrying — and a form the height of the screen under
 * their name turned that into a settings screen.
 */
export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const { id } = await params;
  const member = await readMember(id);
  if (!member) notFound();

  /* The bucket is private, so the URL is minted at the moment of looking. */
  const faces = await facesFor([member.avatarPath]);
  const face = member.avatarPath ? faces.get(member.avatarPath) ?? null : null;

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        {/*
          * "Back to them" was a link label with a pronoun in it, which is the
          * rule this project breaks most. A label names the thing it goes to,
          * so it carries the person's name — and the title says what the page
          * is for rather than repeating the name underneath it.
          */}
        <div>
          <h1 className="q-page-title">Change</h1>
          <p className="q-page-subtitle">
            <Link className="q-auth-link" href={`/team/${member.id}`}>{member.name}</Link>
          </p>
        </div>
      </header>

      <EditMember member={member} face={face} />
    </div>
  );
}
