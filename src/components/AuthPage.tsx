import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The frame around every way in: signing up, logging in, and both halves of
 * forgetting a password.
 *
 * One frame rather than four, because these pages are the first thing a studio
 * ever sees of this software and four slightly different login screens is the
 * tell that nobody looked at them together.
 */
export function AuthPage({
  title, says, children, foot,
}: {
  title: string;
  says?: string;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <main className="q-auth">
      <div className="q-auth-card">
        <Link href="/login" className="q-auth-mark" aria-label="Weave">Weave</Link>
        <h1 className="q-auth-title">{title}</h1>
        {says && <p className="q-auth-says">{says}</p>}
        {children}
        {foot && <div className="q-auth-foot">{foot}</div>}
      </div>
    </main>
  );
}

/** Said the same way on every one of these pages. */
export function AuthProblem({ problem }: { problem?: string | null }) {
  if (!problem) return null;
  return <p className="q-auth-problem" role="alert">{problem}</p>;
}
