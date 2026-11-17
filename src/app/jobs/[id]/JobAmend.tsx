'use client';

import { useState, useTransition } from 'react';
import { amendJob, moveJob, type JobDetail } from '@/weave/jobs/actions';
import { COLUMNS } from '@/weave/jobs/shape';

/**
 * Changing what a job says, in place.
 *
 * Saving is explicit rather than on every keystroke: a studio's notes are
 * written while somebody is on the phone, and a field that commits half a
 * sentence records half a sentence.
 */
export function JobAmend({ job }: { job: JobDetail }) {
  const [wants, setWants] = useState(job.wants ?? '');
  const [expectedOn, setExpectedOn] = useState(job.expectedOn ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  const unsaved = wants !== (job.wants ?? '') || expectedOn !== (job.expectedOn ?? '');

  const save = () => {
    setProblem(null);
    start(async () => {
      try {
        await amendJob({ jobId: job.id, wants, expectedOn: expectedOn || null });
      } catch (err) {
        setProblem(err instanceof Error ? err.message : 'Could not save that');
      }
    });
  };

  const move = (turn: string) => {
    setProblem(null);
    start(async () => {
      try {
        await moveJob({ jobId: job.id, turn: turn as JobDetail['turn'] });
      } catch (err) {
        setProblem(err instanceof Error ? err.message : 'Could not move that job');
      }
    });
  };

  return (
    <section className="q-card q-stack q-stack-sm">
      <div className="q-field">
        <label className="q-label" htmlFor="wants">What they want</label>
        <input
          className="q-input"
          id="wants"
          value={wants}
          onChange={(e) => setWants(e.target.value)}
          placeholder="In your own words"
          disabled={working}
        />
      </div>

      <div className="q-field">
        <label className="q-label" htmlFor="expected">When</label>
        <input
          className="q-input q-input-sm"
          id="expected"
          type="date"
          value={expectedOn}
          onChange={(e) => setExpectedOn(e.target.value)}
          disabled={working}
        />
      </div>

      <div className="q-field">
        <label className="q-label" htmlFor="turn">Whose move</label>
        <select
          className="q-input q-input-sm"
          id="turn"
          value={job.turn}
          onChange={(e) => move(e.target.value)}
          disabled={working}
        >
          {COLUMNS.map((c) => (
            <option key={c.turn} value={c.turn}>{c.heading}</option>
          ))}
        </select>
      </div>

      <div className="q-row q-row-between">
        <span className="q-meta">
          {working ? 'Saving' : unsaved ? 'Not saved yet' : 'Saved'}
        </span>
        <button
          className="q-btn q-btn-primary q-btn-sm"
          type="button"
          onClick={save}
          disabled={working || !unsaved}
        >
          Save
        </button>
      </div>

      {problem && <p className="q-meta">{problem}</p>}
    </section>
  );
}
