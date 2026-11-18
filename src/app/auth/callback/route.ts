import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { claimStudio } from '@/weave/account/actions';

/**
 * Where a link in an email lands.
 *
 * Two kinds arrive here: a confirmation, which is the end of signing up, and
 * a recovery, which is the start of choosing a new password. Both exchange a
 * code for a session; what differs is where they go next.
 *
 * Founding happens here for the confirmation case, because with confirmation
 * switched on the sign-up action never held a session and could not do it.
 * `claimStudio` is idempotent, so running it on every arrival costs a lookup
 * and removes the need for this route to know which case it is in.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  // Supabase reports a refused or expired link in the query, not as a failure
  // of the exchange. Saying so beats the generic "invalid code".
  const described = searchParams.get('error_description');
  if (described) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(described)}`);
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('That link is missing its code. Ask for a new one.')}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('That link has expired or has already been used.')}`,
    );
  }

  /*
   * Not on the recovery path: that session exists only to change a password,
   * and founding a studio from it would mean a forgotten password quietly
   * creating a second studio for somebody who already has one.
   */
  if (next !== '/reset') {
    const founded = await claimStudio();
    if (!founded) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(
          'Your account is confirmed but its studio could not be set up. Log in and it will finish.',
        )}`,
      );
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
