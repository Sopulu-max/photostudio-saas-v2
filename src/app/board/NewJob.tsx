'use client';

import { useState, useTransition } from 'react';
import { createJob } from '@/weave/jobs/actions';

/**
 * Starting a job, on the board, in one row.
 *
 * A name is the only thing required. No service, no package, no classification
 * — and no visit to a Clients screen first, because a name that is new simply
 * becomes a person. Everything else about the job arrives later, if it ever
 * matters.
 */
export function NewJob() {
  const [clientName, setClientName] = useState('');
  const [wants, setWants] = useState('');
  const [expectedOn, setExpectedOn] = useState('');
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      setProblem('A job needs somebody it is for.');
      return;
    }
    setProblem(null);
    start(async () => {
      try {
        await createJob({ clientName, wants, expectedOn: expectedOn || null });
        setClientName('');
        setWants('');
        setExpectedOn('');
      } catch (err) {
        setProblem(err instanceof Error ? err.message : 'Could not start that job');
      }
    });
  };

  /*
   * Closed until it is wanted. Starting a job is the rarest thing on this page
   * and it was the heaviest — three fields and a button sitting above the work
   * they were meant to serve. Now it is a line, and the board is what you see.
   */
  if (!open) {
    return (
      <button type="button" className="q-start-line" onClick={() => setOpen(true)}>
        New job
      </button>
    );
  }

  return (
    <form className="q-start q-row q-row-sm" onSubmit={submit}>
      <input
        className="q-input"
        placeholder="Who is it for"
        value={clientName}
        autoFocus
        onChange={(e) => { setClientName(e.target.value); setProblem(null); }}
        disabled={working}
      />
      <input
        className="q-input"
        placeholder="What they want"
        value={wants}
        onChange={(e) => setWants(e.target.value)}
        disabled={working}
      />
      <input
        className="q-input q-input-sm"
        type="date"
        value={expectedOn}
        onChange={(e) => setExpectedOn(e.target.value)}
        disabled={working}
      />
      <button className="q-btn q-btn-primary q-btn-sm" type="submit" disabled={working}>
        {working ? 'Starting' : 'Start'}
      </button>
      <button
        type="button" className="q-btn q-btn-ghost q-btn-sm"
        onClick={() => { setOpen(false); setProblem(null); }}
        disabled={working}
      >
        Cancel
      </button>
      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </form>
  );
}
