'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { setNewPassword, type AccountResult } from '@/weave/account/actions';
import { AuthProblem } from '@/components/AuthPage';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="q-btn q-btn-primary q-auth-go" disabled={pending}>
      {pending ? 'Saving' : 'Use this password'}
    </button>
  );
}

export function ResetForm() {
  const [result, act] = useActionState<AccountResult, FormData>(setNewPassword, undefined);

  return (
    <form className="q-auth-form" action={act}>
      <AuthProblem problem={result?.problem} />

      <label className="q-auth-field">
        <span className="q-label">New password</span>
        <input
          className="q-input" name="password" type="password" required autoFocus
          autoComplete="new-password" minLength={8}
        />
        <span className="q-auth-hint">Eight characters or more.</span>
      </label>

      <label className="q-auth-field">
        <span className="q-label">Again</span>
        <input
          className="q-input" name="again" type="password" required
          autoComplete="new-password" minLength={8}
        />
      </label>

      <Submit />
    </form>
  );
}
