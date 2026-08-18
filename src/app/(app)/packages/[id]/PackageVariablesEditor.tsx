'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { VariableField } from '@/components/VariableField';
import { updatePackage } from '@/modules/packages/interface';
import type { ServiceVariable } from '@/modules/services/interface';

/**
 * What this package includes.
 *
 * The services decide what may vary; this only chooses values. That is the
 * whole "packages select, they never redefine" rule made visible — there is no
 * way to invent a variable here, only to fix one the bundled services already
 * declared.
 *
 * Leaving something unset is a real choice, not an omission: it stays open and
 * becomes a question for the client at booking. So every row can be cleared.
 */

type Props = {
  packageId: string;
  /** Variables of the services this package bundles, with the service they came from. */
  variables: (ServiceVariable & { serviceName: string })[];
  initial: { serviceVariableId: string; value: unknown }[];
};

export function PackageVariablesEditor({ packageId, variables, initial }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const initialMap: Record<string, string> = {};
  for (const v of initial) initialMap[v.serviceVariableId] = String(v.value ?? '');
  const [values, setValues] = useState<Record<string, string>>(initialMap);

  const dirty = JSON.stringify(values) !== JSON.stringify(initialMap);

  const set = (id: string, raw: string) => setValues((v) => ({ ...v, [id]: raw }));

  const save = () =>
    startTransition(async () => {
      try {
        const payload = variables
          .filter((v) => (values[v.id] ?? '') !== '')
          .map((v) => {
            const raw = values[v.id];
            const value =
              v.kind === 'number' ? Number(raw)
              : v.kind === 'boolean' ? raw === 'true'
              : raw;
            return { serviceVariableId: v.id, value };
          });
        await updatePackage({ packageId, variableValues: payload });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Failed to save.');
      }
    });

  if (variables.length === 0) {
    return (
      <div className="q-card q-section">
        <h2 className="q-section-title">What&rsquo;s included</h2>
        <p className="q-empty">
          The services in this package don&rsquo;t declare anything that varies yet. Add what can vary on the service itself, and it becomes selectable here.
        </p>
      </div>
    );
  }

  // Grouped by service, because the same variable name can appear on two
  // services and "Edited images" twice with no context reads as a bug.
  const byService = variables.reduce<Record<string, typeof variables>>((acc, v) => {
    (acc[v.serviceName] ||= []).push(v);
    return acc;
  }, {});

  return (
    <div className="q-card q-section">
      <div className="q-row q-row-between">
        <div>
          <h2 className="q-section-title">What&rsquo;s included</h2>
          <p className="q-meta" style={{ marginBottom: 0 }}>
            Fix what this package covers. Anything you leave blank stays open and is asked at booking.
          </p>
        </div>
        {saved && <span className="q-badge q-badge-success">Saved</span>}
      </div>

      <div className="q-stack q-stack-md" style={{ marginTop: '16px' }}>
        {Object.entries(byService).map(([serviceName, vars]) => (
          <div key={serviceName}>
            <h3 className="q-section-title" style={{ fontSize: '0.95rem' }}>{serviceName}</h3>
            <div className="q-stack q-stack-sm">
              {vars.map((v) => {
                const current = values[v.id] ?? '';
                return (
                  <div key={v.id} className="q-tile q-row q-row-between" style={{ flexWrap: 'wrap' }}>
                    <div>
                      <strong className="q-strong">{v.label}</strong>
                      {current === '' && <span className="q-meta-sm"> · asked at booking</span>}
                    </div>
                    <div className="q-row">
                      <VariableField
                        kind={v.kind}
                        value={current}
                        onChange={(next) => set(v.id, Array.isArray(next) ? next.join(', ') : next)}
                        options={v.options}
                        unit={v.unit}
                        min={v.min}
                        max={v.max}
                        disabled={isPending}
                        emptyLabel="Ask the client"
                      />
                      {current !== '' && (
                        <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending} onClick={() => set(v.id, '')}>Clear</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {dirty && (
        <div className="q-row" style={{ marginTop: '16px' }}>
          <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending} onClick={save}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" disabled={isPending} onClick={() => setValues(initialMap)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
