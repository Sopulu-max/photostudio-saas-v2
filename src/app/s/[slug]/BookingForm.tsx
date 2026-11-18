'use client';

import { useState, useTransition } from 'react';
import { requestBooking } from '@/weave/jobs/requests';

/**
 * Asking a studio for work.
 *
 * No account, no password, no ceremony — the same ruling as a gallery link.
 * Somebody who has just found this studio should be able to ask for a wedding
 * in under a minute, and be told clearly that a person, not a calendar, will
 * answer them.
 */
export function BookingForm({ slug, studioName }: { slug: string; studioName: string }) {
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  if (sent) {
    return (
      <div className="q-asked">
        <h2 className="q-asked-title">That has gone to {studioName}.</h2>
        <p className="q-auth-body">
          They will read it and come back to you by email. Nothing is booked
          until they say so — this is a request, not a confirmed date.
        </p>
      </div>
    );
  }

  return (
    <form
      className="q-auth-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setProblem(null);
        start(async () => {
          try {
            await requestBooking({
              slug,
              name: String(form.get('name') ?? ''),
              email: String(form.get('email') ?? ''),
              wants: String(form.get('wants') ?? ''),
              expectedOn: String(form.get('expectedOn') ?? '') || null,
            });
            setSent(true);
          } catch (err) {
            setProblem(err instanceof Error ? err.message : 'That did not send');
          }
        });
      }}
    >
      {problem && <p className="q-auth-problem" role="alert">{problem}</p>}

      <label className="q-auth-field">
        <span className="q-label">Your name</span>
        <input className="q-input" name="name" required autoFocus autoComplete="name" />
      </label>

      <label className="q-auth-field">
        <span className="q-label">Email</span>
        <input className="q-input" name="email" type="email" required autoComplete="email" />
        <span className="q-auth-hint">So they can answer you.</span>
      </label>

      <label className="q-auth-field">
        <span className="q-label">What are you after?</span>
        <textarea
          className="q-input" name="wants" rows={4} required
          placeholder="A wedding, a family sitting, headshots for a new site — in your own words."
        />
      </label>

      <label className="q-auth-field">
        <span className="q-label">A date in mind</span>
        <input className="q-input" name="expectedOn" type="date" />
        <span className="q-auth-hint">Leave it blank if you are not sure yet.</span>
      </label>

      <button type="submit" className="q-btn q-btn-primary q-auth-go" disabled={working}>
        {working ? 'Sending' : 'Send the request'}
      </button>
    </form>
  );
}
