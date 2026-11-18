import Link from 'next/link';
import { AuthPage } from '@/components/AuthPage';

export const dynamic = 'force-dynamic';

/**
 * Deliberately says the same thing whether or not that address has an account.
 *
 * Reporting "no account for that address" would turn the reset form into a way
 * to ask which of a studio's addresses are real, one guess at a time.
 */
export default async function ResetSentPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;

  return (
    <AuthPage
      title="Check your email"
      says={to ? `If there is an account for ${to}, a link is on its way.` : 'If there is an account for that address, a link is on its way.'}
      foot={<Link href="/login" className="q-auth-link">Back to logging in</Link>}
    >
      <p className="q-auth-body">
        The link works once and expires after an hour. Opening it brings you
        straight to choosing a new password.
      </p>
    </AuthPage>
  );
}
