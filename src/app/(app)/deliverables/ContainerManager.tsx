'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createDeliveryContainer, renameDeliveryContainer, deleteDeliveryContainer,
} from '@/modules/deliverables/interface';
import { ConfirmButton } from '@/components/ConfirmButton';
import { toast, readableError } from '@/components/Toast';

/**
 * The vessels a studio delivers through.
 *
 * A gallery, a Drive folder, a USB stick, a QR code on a card. The ontology
 * calls them delivery containers and is explicit that they "transport outputs
 * without transforming them" and are never services — which is why they are
 * managed here beside deliverables rather than inside Services.
 *
 * WHY THIS EXISTS AT ALL. The table has been in the schema all along, this
 * studio has a container in it, and the page had a section headed for them —
 * but the section was two hardcoded empty arrays, so it drew nothing and could
 * never have drawn anything. A concept the ontology lists as built was
 * unreachable in the interface.
 *
 * Same shape as the deliverable chips it sits under: a name that becomes its
 * own text field, Enter to keep, Escape to abandon, and removing as its own
 * armed act. There is no reason for two lists of studio vocabulary on one page
 * to be edited two different ways.
 */
export function ContainerManager({
  containers,
}: {
  containers: { id: string; name: string; position: number }[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e) { toast.bad(readableError(e, 'That could not be saved.')); }
    });

  return (
    <div className="q-stack q-stack-md">
      <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
        {containers.map((c) => (
          <span key={c.id} className="q-row" style={{ gap: '4px', alignItems: 'center' }}>
            {editing === c.id ? (
              <input
                className="q-input q-input-sm"
                autoFocus
                defaultValue={c.name}
                style={{ maxWidth: '12rem' }}
                disabled={isPending}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  setEditing(null);
                  // An empty box is an abandoned edit, not a deletion. Removing
                  // is its own button, and it asks first.
                  if (next && next !== c.name) run(() => renameDeliveryContainer(c.id, next));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="q-badge q-badge-neutral"
                style={{ cursor: 'pointer' }}
                disabled={isPending}
                title={`Rename ${c.name}`}
                onClick={() => setEditing(c.id)}
              >
                {c.name}
              </button>
            )}
            <ConfirmButton
              className="q-btn-ghost q-btn-xs"
              disabled={isPending}
              confirmLabel={`Remove ${c.name}?`}
              title={`Remove ${c.name} from the studio's delivery containers`}
              onConfirm={() => run(() => deleteDeliveryContainer(c.id))}
            >
              &times;
            </ConfirmButton>
          </span>
        ))}
        {containers.length === 0 && (
          <span className="q-meta-sm">
            None yet. Add the way this studio actually hands work over.
          </span>
        )}
      </div>

      {adding ? (
        <div className="q-row">
          <input
            autoFocus
            className="q-input"
            placeholder="e.g. Google Drive folder"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                run(() => createDeliveryContainer(name.trim()), () => { setName(''); setAdding(false); });
              }
              if (e.key === 'Escape') { setName(''); setAdding(false); }
            }}
            style={{ minWidth: '14rem' }}
          />
          <button
            className="q-btn q-btn-primary q-btn-sm"
            aria-busy={isPending}
            disabled={isPending || !name.trim()}
            onClick={() => run(
              () => createDeliveryContainer(name.trim()),
              () => { setName(''); setAdding(false); },
            )}
          >
            Add
          </button>
          <button
            className="q-btn q-btn-secondary q-btn-sm"
            onClick={() => { setName(''); setAdding(false); }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setAdding(true)}>
          + Add a container
        </button>
      )}
    </div>
  );
}
