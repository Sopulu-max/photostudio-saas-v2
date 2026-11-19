'use client';

import { useState, useTransition } from 'react';
import { requestBooking } from '@/weave/jobs/requests';
import { money } from '@/weave/store/shape';
import { sayPackage, type Package } from '@/weave/packages/shape';

/**
 * Asking a studio for work.
 *
 * No account, no password, no ceremony — the same ruling as a gallery link.
 * Somebody who has just found this studio should be able to ask for a wedding
 * in under a minute, and be told clearly that a person, not a calendar, will
 * answer them.
 */
export function BookingForm({ slug, studioName, packages }: {
  slug: string;
  studioName: string;
  /** What the studio offers. Empty is fine — then it is a plain enquiry. */
  packages: Package[];
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  if (sentTo) {
    return (
      <div className="q-asked">
        <h2 className="q-asked-title">That has gone to {studioName}.</h2>
        <p className="q-auth-body">
          They will read it and come back to you. Nothing is booked until they
          say so — this is a request, not a confirmed date.
        </p>
        {/*
          * The link is given now rather than only emailed, because no mail is
          * sent yet and because a page they can return to is the thing that
          * makes the answer readable at all.
          */}
        <p className="q-auth-body">Keep this link. The answer will appear on it.</p>
        <a className="q-share" href={sentTo}>{sentTo}</a>
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
            const { token } = await requestBooking({
              slug,
              name: String(form.get('name') ?? ''),
              email: String(form.get('email') ?? ''),
              wants: String(form.get('wants') ?? ''),
              expectedOn: String(form.get('expectedOn') ?? '') || null,
              packageId: String(form.get('packageId') ?? '') || null,
            });
            setSentTo(`${window.location.origin}/r/${token}`);
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

      {/*
        * Shown only when the studio has published something. A studio that
        * works case by case gets a plain enquiry, which is what it had.
        */}
      {packages.length > 0 && (
        <label className="q-auth-field">
          <span className="q-label">What are you asking about?</span>
          <select className="q-input" name="packageId" defaultValue="">
            <option value="">Not sure yet</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.picturesPromised !== null ? ` — ${sayPackage(p)}` : ''}
                {p.price !== null ? ` — ${money(p.price, p.currency)}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}

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
