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
      title="Open a studio"
      says="A few minutes, and your first gallery can go out today."
      foot={<>Already have one? <Link href="/login" className="q-auth-link">Log in</Link></>}
    >
      <SignUpForm />
    </AuthPage>
  );
}
