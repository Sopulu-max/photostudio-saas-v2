'use client';

import { useState, useTransition } from 'react';
import {
  addAutomation, addDiscount, markSent, removeAutomation, removeDiscount, setAutomationActive,
} from '@/weave/automations/actions';
import { Reveal } from '@/components/Reveal';
import {
  TRIGGERS, sayDiscount, sayTrigger,
  type Automation, type Discount, type DueSend, type Trigger,
} from '@/weave/automations/shape';

/**
 * What is due, what would be sent, and the codes behind it.
 *
 * NOTHING SENDS FROM HERE. No mail provider is wired, and rather than stub one
 * and pretend, each due message is written out in full so the studio can copy
 * it and send it today. "Mark it sent" records the fact, which is what stops
 * the same client being chased twice.
 *
 * A due message is shown as the letter it is — the words set in the reading
 * face, the client's name above them — because it is about to be read by a
 * person, and it should be judged here the way it will be judged there.
 */
export function Automations({
  due, automations, discounts,
}: {
  due: DueSend[];
  automations: Automation[];
  discounts: Discount[];
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [working, start] = useTransition();
  const [afterDays, setAfterDays] = useState('3');

  const run = (fn: () => Promise<unknown>) => {
    setProblem(null);
    start(async () => {
      try { await fn(); } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That did not work');
      }
    });
  };

  const copy = async (d: DueSend) => {
    const key = `${d.automationId}:${d.galleryId}:${d.personId}`;
    try {
      await navigator.clipboard.writeText(`${d.subject}\n\n${d.body}`);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setProblem('Could not copy it; the message is shown above.');
    }
  };

  return (
    <div className="q-stack q-stack-lg">
      <section className="q-stack q-stack-sm">
        <h2 className="q-section-title">Due now</h2>
        {due.length === 0 ? (
          <p className="q-empty">
            {automations.length === 0
              ? 'Nothing is set up to follow up on yet.'
              : 'Nothing is due. Every client who should have heard from you has.'}
          </p>
        ) : due.map((d) => {
          const key = `${d.automationId}:${d.galleryId}:${d.personId}`;
          return (
            <article key={key} className="q-letter">
              <header className="q-letter-head">
                <strong className="q-letter-to">{d.toName}</strong>
                <span className="q-meta-sm">{d.to}</span>
              </header>

              <p className="q-letter-subject">{d.subject}</p>
              <p className="q-letter-body">{d.body}</p>

              <footer className="q-letter-foot">
                <span className="q-meta-sm">{d.automationName} &middot; {d.galleryName}</span>
                <span className="q-row q-row-sm">
                  <button type="button" className="q-btn q-btn-ghost q-btn-xs" onClick={() => void copy(d)}>
                    {copied === key ? 'Copied' : 'Copy the message'}
                  </button>
                  <button
                    type="button" className="q-btn q-btn-secondary q-btn-xs" disabled={working}
                    onClick={() => run(() => markSent({
                      automationId: d.automationId, galleryId: d.galleryId,
                      personId: d.personId, dueAt: d.dueAt,
                    }))}
                  >
                    I sent it
                  </button>
                </span>
              </footer>
            </article>
          );
        })}
      </section>

      <section className="q-stack q-stack-sm">
        <h2 className="q-section-title">Follow-ups</h2>
        {automations.length === 0 ? (
          <p className="q-empty">None set up.</p>
        ) : (
          <div className="q-sheet">
            {automations.map((a) => (
              <div key={a.id} className={a.active ? 'q-rule' : 'q-rule q-rule-off'}>
                <div className="q-rule-main">
                  <strong className="q-strong">{a.name}</strong>
                  <span className="q-meta">{a.subject}</span>
                </div>
                <span className={a.active ? 'q-rule-when' : 'q-rule-when q-warm'}>
                  {a.active ? sayTrigger(a) : 'Off'}
                  {a.discount && <span className="q-meta-sm"> with {a.discount.code}</span>}
                </span>
                <span className="q-rule-acts">
                  <button
                    type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                    onClick={() => run(() => setAutomationActive({ automationId: a.id, active: !a.active }))}
                  >
                    {a.active ? 'Turn it off' : 'Turn it on'}
                  </button>
                  <button
                    type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                    onClick={() => run(() => removeAutomation({ automationId: a.id }))}
                  >
                    Remove
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        <Reveal says="Write a follow-up">
          {(done) => (
            <form
              className="q-stack q-stack-xs q-reveal-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const name = String(form.get('name') ?? '').trim();
                const subject = String(form.get('subject') ?? '').trim();
                if (!name) { setProblem('Name it, so you know which one it is later.'); return; }
                if (!subject) { setProblem('A message needs a subject.'); return; }
                run(async () => {
                  await addAutomation({
                    name,
                    trigger: String(form.get('trigger')) as Trigger,
                    afterDays: Number(form.get('afterDays')),
                    subject,
                    body: String(form.get('body') ?? ''),
                    discountId: String(form.get('discountId') ?? '') || null,
                  });
                  done();
                });
              }}
            >
              <div className="q-row q-row-sm">
                <input className="q-input" name="name" placeholder="Name it" autoFocus disabled={working} />
                <select className="q-input q-input-sm" name="trigger" disabled={working}>
                  {TRIGGERS.map((t) => (
                    <option key={t.trigger} value={t.trigger}>{t.says(Number(afterDays) || 0)}</option>
                  ))}
                </select>
                <input
                  className="q-input q-input-sm" name="afterDays" type="number" min="0" max="365"
                  value={afterDays} disabled={working}
                  onChange={(e) => setAfterDays(e.target.value)}
                />
                <select className="q-input q-input-sm" name="discountId" disabled={working}>
                  <option value="">No code</option>
                  {discounts.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
                </select>
              </div>
              <input className="q-input" name="subject" placeholder="Subject" disabled={working} />
              <textarea
                className="q-input" name="body" rows={3} disabled={working}
                placeholder="What to say. Use {client}, {gallery}, {link} and {code} and they fill themselves in."
              />
              <button className="q-btn q-btn-secondary q-btn-sm q-self-start" type="submit" disabled={working}>
                {working ? 'Adding' : 'Add it'}
              </button>
            </form>
          )}
        </Reveal>
      </section>

      <section className="q-stack q-stack-sm">
        <h2 className="q-section-title">Codes</h2>
        {discounts.length === 0 ? (
          <p className="q-empty">No codes yet.</p>
        ) : (
          <div className="q-sheet">
            {discounts.map((d) => (
              <div key={d.id} className="q-ware-head">
                <span className="q-code">{d.code}</span>
                <span className="q-ware-rule" aria-hidden="true" />
                <span className="q-num q-ware-price">{sayDiscount(d)}</span>
                <button
                  type="button" className="q-ware-drop" disabled={working}
                  onClick={() => run(() => removeDiscount({ discountId: d.id }))}
                  aria-label={`Remove ${d.code}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <Reveal says="Mint a code">
          {(done) => (
            <form
              className="q-row q-row-sm"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const code = String(form.get('code') ?? '').trim();
                const kind = String(form.get('kind') ?? 'percent') as 'percent' | 'amount';
                const n = Number(form.get('value'));
                if (!code) { setProblem('A code needs something to type.'); return; }
                if (!Number.isFinite(n) || n <= 0) { setProblem('That is not an amount off.'); return; }
                run(async () => {
                  await addDiscount({
                    code, kind,
                    // Percent is whole points; an amount is typed in whole units
                    // and stored in minor ones, like every other figure here.
                    value: kind === 'percent' ? Math.round(n) : Math.round(n * 100),
                    expiresOn: String(form.get('expiresOn') ?? '') || null,
                  });
                  done();
                });
              }}
            >
              <input className="q-input" name="code" placeholder="CODE" autoFocus disabled={working} />
              <select className="q-input q-input-sm" name="kind" disabled={working}>
                <option value="percent">% off</option>
                <option value="amount">Amount off</option>
              </select>
              <input
                className="q-input q-input-sm" name="value" type="number" min="0" step="0.01"
                placeholder="How much" disabled={working}
              />
              <input className="q-input q-input-sm" name="expiresOn" type="date" disabled={working} />
              <button className="q-btn q-btn-secondary q-btn-sm" type="submit" disabled={working}>Add</button>
            </form>
          )}
        </Reveal>
      </section>

      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </div>
  );
}
