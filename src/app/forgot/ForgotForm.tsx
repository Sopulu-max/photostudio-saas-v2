'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { requestPasswordReset, type AccountResult } from '@/weave/account/actions';
import { AuthProblem } from '@/components/AuthPage';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="q-btn q-btn-primary q-auth-go" disabled={pending}>
      {pending ? 'Sending' : 'Send the link'}
    </button>
  );
}

export function ForgotForm({ email }: { email?: string }) {
  const [result, act] = useActionState<AccountResult, FormData>(requestPasswordReset, undefined);

  return (
    <form className="q-auth-form" action={act}>
      <AuthProblem problem={result?.problem} />
      <label className="q-auth-field">
        <span className="q-label">Email</span>
        <input
          className="q-input" name="email" type="email" required autoFocus
          autoComplete="email" defaultValue={email} placeholder="you@studio.com"
        />
      </label>
      <Submit />
    </form>
  );
}
