'use client';

import { useState, useTransition } from 'react';
import {
  addAutomation, addDiscount, markSent, removeAutomation, removeDiscount, setAutomationActive,
} from '@/weave/automations/actions';
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

  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<Trigger>('kept_not_bought');
  const [afterDays, setAfterDays] = useState('3');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [discountId, setDiscountId] = useState('');

  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('');
  const [expiresOn, setExpiresOn] = useState('');

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
    <div className="q-stack q-stack-md">
      <section className="q-card q-stack q-stack-sm">
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
            <div key={key} className="q-tile q-stack q-stack-xs">
              <div className="q-row q-row-between">
                <strong className="q-strong">{d.toName}</strong>
                <span className="q-meta">{d.automationName} &middot; {d.galleryName}</span>
              </div>
              <span className="q-meta-sm">{d.to}</span>
              <span className="q-text-body">{d.subject}</span>
              <p className="q-meta" style={{ whiteSpace: 'pre-wrap' }}>{d.body}</p>
              <div className="q-row q-row-sm">
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
              </div>
            </div>
          );
        })}
      </section>

      <section className="q-card q-stack q-stack-sm">
        <h2 className="q-section-title">Follow-ups</h2>
        {automations.length === 0 ? (
          <p className="q-empty">None set up.</p>
        ) : automations.map((a) => (
          <div key={a.id} className="q-tile q-stack q-stack-xs">
            <div className="q-row q-row-between">
              <strong className="q-strong">{a.name}</strong>
              <span className={a.active ? 'q-meta' : 'q-meta q-warm'}>
                {a.active ? sayTrigger(a) : 'Off'}
              </span>
            </div>
            <span className="q-meta">{a.subject}</span>
            {a.discount && <span className="q-meta-sm">With {a.discount.code}</span>}
            <div className="q-row q-row-sm">
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
            </div>
          </div>
        ))}

        <form
          className="q-stack q-stack-xs"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await addAutomation({
                name, trigger, afterDays: Number(afterDays), subject, body,
                discountId: discountId || null,
              });
              setName(''); setSubject(''); setBody(''); setDiscountId('');
            });
          }}
        >
          <div className="q-row q-row-sm">
            <input className="q-input" placeholder="Name it" value={name} disabled={working}
              onChange={(e) => setName(e.target.value)} />
            <select className="q-input q-input-sm" value={trigger} disabled={working}
              onChange={(e) => setTrigger(e.target.value as Trigger)}>
              {TRIGGERS.map((t) => (
                <option key={t.trigger} value={t.trigger}>{t.says(Number(afterDays) || 0)}</option>
              ))}
            </select>
            <input className="q-input q-input-sm" type="number" min="0" max="365" value={afterDays}
              disabled={working} onChange={(e) => setAfterDays(e.target.value)} />
            <select className="q-input q-input-sm" value={discountId} disabled={working}
              onChange={(e) => setDiscountId(e.target.value)}>
              <option value="">No code</option>
              {discounts.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
            </select>
          </div>
          <input className="q-input" placeholder="Subject" value={subject} disabled={working}
            onChange={(e) => setSubject(e.target.value)} />
          <textarea
            className="q-input" rows={3} disabled={working} value={body}
            placeholder="What to say. Use {client}, {gallery}, {link} and {code} and they fill themselves in."
            onChange={(e) => setBody(e.target.value)}
          />
          <button className="q-btn q-btn-secondary" type="submit" disabled={working}>
            {working ? 'Adding' : 'Add a follow-up'}
          </button>
        </form>
      </section>

      <section className="q-card q-stack q-stack-sm">
        <h2 className="q-section-title">Codes</h2>
        {discounts.length === 0 ? (
          <p className="q-empty">No codes yet.</p>
        ) : discounts.map((d) => (
          <div key={d.id} className="q-row q-row-between">
            <span className="q-text-body">{d.code}</span>
            <span className="q-row q-row-sm">
              <span className="q-meta">{sayDiscount(d)}</span>
              <button
                type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                onClick={() => run(() => removeDiscount({ discountId: d.id }))}
              >
                Remove
              </button>
            </span>
          </div>
        ))}

        <form
          className="q-row q-row-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(value);
            run(async () => {
              await addDiscount({
                code, kind,
                // Percent is whole points; an amount is typed in whole units
                // and stored in minor ones, like every other figure here.
                value: kind === 'percent' ? Math.round(n) : Math.round(n * 100),
                expiresOn: expiresOn || null,
              });
              setCode(''); setValue(''); setExpiresOn('');
            });
          }}
        >
          <input className="q-input" placeholder="CODE" value={code} disabled={working}
            onChange={(e) => setCode(e.target.value)} />
          <select className="q-input q-input-sm" value={kind} disabled={working}
            onChange={(e) => setKind(e.target.value as 'percent' | 'amount')}>
            <option value="percent">% off</option>
            <option value="amount">Amount off</option>
          </select>
          <input className="q-input q-input-sm" type="number" min="0" step="0.01" placeholder="How much"
            value={value} disabled={working} onChange={(e) => setValue(e.target.value)} />
          <input className="q-input q-input-sm" type="date" value={expiresOn} disabled={working}
            onChange={(e) => setExpiresOn(e.target.value)} />
          <button className="q-btn q-btn-secondary" type="submit" disabled={working}>Add</button>
        </form>
      </section>

      {problem && <p className="q-meta">{problem}</p>}
    </div>
  );
}
