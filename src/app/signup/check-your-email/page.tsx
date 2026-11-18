import Link from 'next/link';
import { AuthPage } from '@/components/AuthPage';

export const dynamic = 'force-dynamic';

/**
 * The gap between signing up and being in.
 *
 * It names the address back, because the commonest reason a confirmation
 * never arrives is that it went somewhere with a typo in it, and a person
 * cannot spot that unless they are shown what they typed.
 */
export default async function CheckYourEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;

  return (
    <AuthPage
      title="Check your email"
      says={to ? `A confirmation link is on its way to ${to}.` : 'A confirmation link is on its way.'}
      foot={<>Wrong address? <Link href="/signup" className="q-auth-link">Start again</Link></>}
    >
      <p className="q-auth-body">
        Opening it finishes setting up the studio and signs you in. The link
        works once, and it is the only thing standing between you and the board.
      </p>
      <p className="q-auth-body">
        Nothing arrived? It is usually in spam, under the studio name you chose.
      </p>
    </AuthPage>
  );
}
