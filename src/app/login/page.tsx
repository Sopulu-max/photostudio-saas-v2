import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthPage, AuthProblem } from '@/components/AuthPage';
import { whoIsAsking } from '@/weave/studio';
import { login } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Rebuilt on the shared frame. It had been carrying inline styles and
 * `--q-color-ink-300`, a token from a design system that no longer exists, so
 * its borders were resolving to nothing — the first screen of the product was
 * the one screen nobody had looked at since the palette changed.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await whoIsAsking()) redirect('/');
  const params = await searchParams;

  return (
    <AuthPage
      title="Welcome back"
      foot={<>No studio yet? <Link href="/signup" className="q-auth-link">Open one</Link></>}
    >
      <form className="q-auth-form" action={login}>
        <AuthProblem problem={params.error} />

        <label className="q-auth-field">
          <span className="q-label">Email</span>
          <input
            className="q-input" id="email" name="email" type="email" required autoFocus
            autoComplete="email" placeholder="you@studio.com"
          />
        </label>

        <label className="q-auth-field">
          <span className="q-label">Password</span>
          <input
            className="q-input" id="password" name="password" type="password" required
            autoComplete="current-password"
          />
          <Link href="/forgot" className="q-auth-aside">Forgotten it?</Link>
        </label>

        <button type="submit" className="q-btn q-btn-primary q-auth-go">Log in</button>
      </form>
    </AuthPage>
  );
}
