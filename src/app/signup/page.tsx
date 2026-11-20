import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthPage } from '@/components/AuthPage';
import { whoIsAsking } from '@/weave/studio';
import { SignUpForm } from './SignUpForm';

export const dynamic = 'force-dynamic';

export default async function SignUpPage() {
  // Somebody already inside a studio has no business founding another one by
  // reloading a bookmark.
  if (await whoIsAsking()) redirect('/');

  return (
    <AuthPage
      title="Create a studio"
      says="Set up your studio account."
      foot={<>Already have an account? <Link href="/login" className="q-auth-link">Sign in</Link></>}
    >
      <SignUpForm />
    </AuthPage>
  );
}
