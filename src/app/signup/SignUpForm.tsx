'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signUpStudio, type AccountResult } from '@/weave/account/actions';
import { AuthProblem } from '@/components/AuthPage';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="q-btn q-btn-primary q-auth-go" disabled={pending}>
      {pending ? 'Setting it up' : 'Open the studio'}
    </button>
  );
}

/**
 * Four fields, and the studio's name is the first of them.
 *
 * It comes first because it is the only one that is about the business rather
 * than about the account, and because it is the thing that will be at the top
 * of every gallery the studio ever sends. The operator's own name is optional:
 * a studio can be one person, and asking twice for what is effectively the
 * same answer is how a sign-up form starts feeling like paperwork.
 */
export function SignUpForm() {
  const [result, act] = useActionState<AccountResult, FormData>(signUpStudio, undefined);

  return (
    <form className="q-auth-form" action={act}>
      <AuthProblem problem={result?.problem} />

      <label className="q-auth-field">
        <span className="q-label">What the studio is called</span>
        <input
          className="q-input" name="studioName" required autoFocus
          autoComplete="organization" placeholder="Glamour Studio"
        />
      </label>

      <label className="q-auth-field">
        <span className="q-label">Your name</span>
        <input
          className="q-input" name="personName"
          autoComplete="name" placeholder="Optional"
        />
      </label>

      <label className="q-auth-field">
        <span className="q-label">Email</span>
        <input
          className="q-input" name="email" type="email" required
          autoComplete="email" placeholder="you@studio.com"
        />
      </label>

      <label className="q-auth-field">
        <span className="q-label">Password</span>
        <input
          className="q-input" name="password" type="password" required
          autoComplete="new-password" minLength={8}
        />
        <span className="q-auth-hint">Eight characters or more.</span>
      </label>

      <Submit />
    </form>
  );
}
