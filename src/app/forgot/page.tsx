import Link from 'next/link';
import { AuthPage } from '@/components/AuthPage';
import { ForgotForm } from './ForgotForm';

export const dynamic = 'force-dynamic';

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <AuthPage
      title="Reset your password"
      says="We will send a link that signs you in once, long enough to choose a new one."
      foot={<>Remembered it? <Link href="/login" className="q-auth-link">Log in</Link></>}
    >
      <ForgotForm email={email} />
    </AuthPage>
  );
}
