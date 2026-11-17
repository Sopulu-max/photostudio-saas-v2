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

  return (
    <form className="q-card q-stack q-stack-sm" onSubmit={submit}>
      <div className="q-row q-row-sm">
        <input
          className="q-input"
          placeholder="Who is it for"
          value={clientName}
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
        <button className="q-btn q-btn-primary" type="submit" disabled={working}>
          {working ? 'Starting' : 'Start a job'}
        </button>
      </div>
      {problem && <p className="q-meta">{problem}</p>}
    </form>
  );
}
