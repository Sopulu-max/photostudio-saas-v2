'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PickOne } from '@/components/Pick';
import { narrowFor, type Narrowed } from '@/modules/services/suggestions';
import { toast, readableError } from '@/components/Toast';
import { DeclaredQuestions, type DeclaredQuestion } from '@/components/DeclaredQuestions';
import { createDeliverableAction, createDeliveryContainerAction } from './actions';

type Kind = 'deliverable' | 'container';

/**
 * Naming a new deliverable, with everything the app already knows about them.
 *
 * WHAT THIS PAGE USED TO BE. Two radio buttons labelled "Primary Output" and
 * "Deliverable Container" — a third name for a thing the rest of the app had
 * already settled on calling a deliverable — a domain select, and a bare text
 * box. No suggestions, though the service form and the settings page both offer
 * them. No unit, though a unit is what makes a package read "30 seconds video"
 * rather than "30 video". No sight of what the domain already holds, so
 * "Edited Photos" got typed beside "Edited photographs" and matched neither.
 *
 * And the container half did not work at all: both choices called
 * createDeliverable, which resolves a name inside a service domain, so a
 * container arrived with an empty domain id and failed with "Give the
 * deliverable a name" — blaming the one thing that was right.
 *
 * IT ENDS ON THE THING IT MADE, not on a list. A deliverable is rarely finished
 * at the moment of naming: the next thing a studio does is say what it needs
 * settling, and that lives on its own page.
 */
export function NewDeliverableForm({
  domains,
  existingByDomain,
  suggestions,
}: {
  domains: { id: string; name: string }[];
  /** What each domain already holds, so a near-duplicate is visible before it is typed. */
  existingByDomain: Record<string, { id: string; name: string }[]>;
  suggestions?: Narrowed;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('deliverable');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [domainId, setDomainId] = useState(domains[0]?.id ?? '');
  /*
   * What it needs settling, collected here and written once the row exists.
   *
   * Naming a deliverable and saying what it needs settling is one act — "edited
   * photographs, and they are softcopy or hardcopy". Making an operator create
   * it, land on its page and start again was two jobs for one thought.
   */
  const [questions, setQuestions] = useState<DeclaredQuestion[]>([]);
  const [saving, setSaving] = useState(false);

  const domainName = domains.find((d) => d.id === domainId)?.name ?? '';
  const already = existingByDomain[domainName] ?? [];

  /* The library's and this studio's own, minus what the domain already has. */
  const options = narrowFor(suggestions, domainName, '')
    .filter((o) => !already.some((d) => d.name.toLowerCase() === o.toLowerCase()));

  /*
   * Said before submitting, not after.
   *
   * createDeliverable finds-or-creates by name, so typing one that exists hands
   * back the existing row — correct, and indistinguishable from having made
   * something new unless the form says so first.
   */
  const clash = already.find((d) => d.name.trim().toLowerCase() === name.trim().toLowerCase());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.bad('Give it a name.');
    if (kind === 'deliverable' && !domainId) return toast.bad('Choose which domain produces it.');

    setSaving(true);
    try {
      if (kind === 'container') {
        await createDeliveryContainerAction(name.trim());
        toast.ok(name.trim() + ' is now one of your delivery containers.');
        router.push('/deliverables');
        return;
      }
      const { id, refused } = await createDeliverableAction({
        domainId,
        name: name.trim(),
        unit: unit.trim() || null,
        questions: questions.map((q) => ({
          label: q.label, kind: q.kind, unit: q.unit, options: q.options,
        })),
      });
      toast.ok(name.trim() + ' added to ' + domainName + '.');
      if (refused.length > 0) {
        toast.bad('Could not declare ' + refused.join(' or ') + '. You can add that on its page.');
      }
      // To the thing just made, where what it needs settling is declared.
      router.push('/deliverables/' + id + '?type=output');
    } catch (err) {
      toast.bad(readableError(err, 'That could not be created.'));
      setSaving(false);
    }
  };

  const CHOICES: { value: Kind; title: string; blurb: string }[] = [
    {
      value: 'deliverable',
      title: 'A deliverable',
      blurb: 'Something the studio produces — edited photographs, a highlight film, a bound album.',
    },
    {
      value: 'container',
      title: 'A delivery container',
      blurb: 'Something that carries the work to a client without changing it — a gallery, a Drive folder, a USB stick.',
    },
  ];

  return (
    <form className="q-form q-stack q-stack-lg" onSubmit={submit}>
      <div className="q-card q-section">
        <h2 className="q-section-title">What are you adding?</h2>
        <div className="q-stack q-stack-sm" style={{ marginTop: '12px' }}>
          {CHOICES.map((c) => (
            <label
              key={c.value}
              className="q-tile"
              style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}
            >
              <input
                type="radio"
                name="kind"
                value={c.value}
                checked={kind === c.value}
                disabled={saving}
                onChange={() => setKind(c.value)}
                style={{ marginTop: '3px' }}
              />
              <span>
                <span className="q-strong">{c.title}</span>
                <span className="q-meta-sm" style={{ display: 'block' }}>{c.blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="q-card q-section q-stack q-stack-md">
        {kind === 'deliverable' && (
          <div className="q-field">
            <label className="q-label">Which domain produces it?</label>
            <select
              className="q-select"
              value={domainId}
              disabled={saving}
              onChange={(e) => setDomainId(e.target.value)}
            >
              {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <span className="q-meta-sm">
              A deliverable belongs to one domain, so Photography naming one says nothing about
              Printing.
            </span>
          </div>
        )}

        <div className="q-field">
          <label className="q-label">Name</label>
          {kind === 'deliverable' ? (
            <PickOne
              value={name}
              onChange={setName}
              options={options}
              placeholder="Choose one, or type something new"
              disabled={saving}
              allowCreate
            />
          ) : (
            <input
              className="q-input"
              value={name}
              placeholder="e.g. Google Drive folder"
              disabled={saving}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          )}

          {clash && (
            <span className="q-meta-sm q-warm">
              {domainName} already produces {clash.name}. Adding this will use that one.
            </span>
          )}
        </div>

        {kind === 'deliverable' && (
          <>
            <div className="q-field">
              <label className="q-label">Counted in (optional)</label>
              <input
                className="q-input"
                value={unit}
                placeholder="photograph, second, page"
                disabled={saving}
                onChange={(e) => setUnit(e.target.value)}
              />
              <span className="q-meta-sm">
                What one of them is called. It is why a package reads 30 seconds video rather than
                30 video.
              </span>
            </div>

            {/*
              * DECLARED IN THE SAME ACT AS NAMING IT.
              *
              * This is the point of a deliverable being a kind rather than a
              * word: it declares what every package promising it must settle,
              * once, here. The same control the deliverable's own page uses —
              * one component, two owners of the state — because two spellings
              * of one idea is the drift this module has spent its history
              * paying for.
              */}
            <div className="q-field">
              <label className="q-label">What it needs settling (optional)</label>
              <p className="q-help">
                Every package promising this is asked these, and can fix an answer or leave it to
                the client. A service can later say it only does some of the answers.
              </p>
              <DeclaredQuestions
                questions={questions}
                onChange={setQuestions}
                disabled={saving}
                emptyHint="Nothing yet. A framed print has a size; edited photographs may be softcopy or hardcopy. Say it once and every package inherits the question."
              />
            </div>

            {already.length > 0 && (
              <div className="q-field">
                <span className="q-label">{domainName} already produces</span>
                <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {already.map((d) => (
                    <span key={d.id} className="q-badge q-badge-neutral">{d.name}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="q-row">
        <button
          type="submit"
          className="q-btn q-btn-primary"
          aria-busy={saving}
          disabled={saving || !name.trim()}
        >
          {saving ? 'Creating…' : kind === 'container' ? 'Add container' : 'Add deliverable'}
        </button>
        <button
          type="button"
          className="q-btn q-btn-secondary"
          disabled={saving}
          onClick={() => router.push('/deliverables')}
        >
          Cancel
        </button>
        {kind === 'deliverable' && (
          <span className="q-meta-sm">
            {questions.length > 0
              ? 'It will be asked for ' + questions.map((q) => q.label).join(' and ') + '.'
              : 'You can add what it needs settling later, on its own page.'}
          </span>
        )}
      </div>
    </form>
  );
}
