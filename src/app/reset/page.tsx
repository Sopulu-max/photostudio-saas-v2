import Link from 'next/link';
import { AuthPage } from '@/components/AuthPage';
import { createClient } from '@/lib/supabase/server';
import { ResetForm } from './ResetForm';

export const dynamic = 'force-dynamic';

/**
 * Where a recovery link lands, after the callback has turned it into a session.
 *
 * The session IS the proof — it only exists because somebody opened a link
 * sent to that address — so there is no old password to ask for. What there
 * must be is a session: without one this page would be a form offering to
 * change the password of nobody in particular.
 */
export default async function ResetPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthPage
        title="That link has expired"
        says="Reset links work once, and not for long."
        foot={<Link href="/login" className="q-auth-link">Back to logging in</Link>}
      >
        <p className="q-auth-body">
          <Link href="/forgot" className="q-auth-link">Ask for another one</Link> and it
          will arrive in a moment.
        </p>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Choose a new password" says={`Signed in as ${user.email}.`}>
      <ResetForm />
    </AuthPage>
  );
}
