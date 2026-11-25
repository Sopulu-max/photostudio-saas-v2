'use client';

import { useState, useTransition } from 'react';
import { requestBooking } from '@/weave/jobs/requests';
import type { Package } from '@/weave/packages/shape';
import type { PackageMedia } from '@/weave/packages/media';
import { PackageChoice } from './PackageChoice';

/**
 * Asking a studio for work.
 *
 * No account, no password, no ceremony — the same ruling as a gallery link.
 * Somebody who has just found this studio should be able to ask for a wedding
 * in under a minute, and be told clearly that a person, not a calendar, will
 * answer them.
 */
export function BookingForm({ slug, studioName, packages, media }: {
  slug: string;
  studioName: string;
  /** What the studio offers. Empty is fine — then it is a plain enquiry. */
  packages: Package[];
  /** What those packages look like, cover first. */
  media: PackageMedia[];
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  if (sentTo) {
    return (
      <div className="q-asked">
        <h2 className="q-asked-title">Request sent to {studioName}.</h2>
        <p className="q-auth-body">
          They will review it and respond. This is a request; nothing is confirmed
          until they accept it.
        </p>
        {/*
          * The link is given now rather than only emailed, because no mail is
          * sent yet and because a page they can return to is the thing that
          * makes the answer readable at all.
          */}
        <p className="q-auth-body">Save this link. Their response will appear here.</p>
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
        <span className="q-label">Name</span>
        <input className="q-input" name="name" required autoFocus autoComplete="name" />
      </label>

      <label className="q-auth-field">
        <span className="q-label">Email</span>
        <input className="q-input" name="email" type="email" required autoComplete="email" />
        <span className="q-auth-hint">Used to send you a response.</span>
      </label>

      {/*
        * Shown only when the studio has published something. A studio that
        * works case by case gets a plain enquiry, which is what it had.
        */}
      <PackageChoice packages={packages} media={media} name="packageId" />

      <label className="q-auth-field">
        <span className="q-label">Details</span>
        <textarea
          className="q-input" name="wants" rows={4} required
          placeholder="Describe what you are looking for."
        />
      </label>

      <label className="q-auth-field">
        <span className="q-label">Preferred date</span>
        <input className="q-input" name="expectedOn" type="date" />
        <span className="q-auth-hint">Optional.</span>
      </label>

      <button type="submit" className="q-btn q-btn-primary q-auth-go" disabled={working}>
        {working ? 'Sending' : 'Send request'}
      </button>
    </form>
  );
}
