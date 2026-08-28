'use client';

import React, { useState, useMemo, useEffect } from 'react';

/**
 * Choosing, or creating, the client a booking is for.
 *
 * ONE PICKER, USED EVERYWHERE. There were two: a search box on the new-booking
 * form and a bare <select> of names on the booking edit form. So a fix to one
 * left the other exactly as it was — the same shape of failure as a rule living
 * in one screen while another screen does the same job differently. Both now
 * mount this.
 *
 * WHAT IT DOES THAT A NAME LIST CANNOT. Two clients can share a name; in a
 * studio they do, because families book together and a name is not an identity.
 * So this searches phone and email as well as name, says so when a name is
 * shared, and — once a client is chosen — SHOWS their details rather than
 * collapsing to a name. An operator picking between two identical rows and
 * hoping is the failure this replaces.
 *
 * The details stay editable. A wrong phone number is discovered exactly when
 * someone is being booked, and making them leave the booking to go and fix it
 * on the client page is how it stays wrong.
 */

export type ClientOption = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
};

/**
 * What the form ends up holding.
 *
 * `id` empty means this client does not exist yet and must be created; `id`
 * present means it exists, and the three fields are its details as they now
 * stand — which may differ from what was on file, if the operator corrected
 * something.
 */
export type ClientSelection = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

const EMPTY: ClientSelection = { id: '', name: '', email: '', phone: '' };

/** Did the operator change anything about a client that already exists? */
export function clientEdits(
  selection: ClientSelection | null,
  clients: ClientOption[],
): { clientId: string; name?: string; email?: string | null; phone?: string | null } | null {
  if (!selection?.id) return null;
  const before = clients.find((c) => c.id === selection.id);
  if (!before) return null;

  const changed: Record<string, unknown> = {};
  if (selection.name.trim() && selection.name.trim() !== (before.name || '')) changed.name = selection.name.trim();
  if (selection.email.trim() !== (before.email || '')) changed.email = selection.email.trim() || null;
  if (selection.phone.trim() !== (before.phone || '')) changed.phone = selection.phone.trim() || null;

  return Object.keys(changed).length > 0 ? { clientId: selection.id, ...changed } : null;
}

export function ClientPicker({
  clients,
  value,
  onChange,
  label = 'Client',
  allowNone = false,
}: {
  clients: ClientOption[];
  value: ClientSelection | null;
  onChange: (next: ClientSelection | null) => void;
  label?: string;
  /** Booking edit allows "no client yet"; new booking does not offer it as a step. */
  allowNone?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  /** True once a client has been chosen and then cleared, so focus can return. */
  const [returningToSearch, setReturningToSearch] = useState(false);

  // Names held by more than one client, so those rows can say which is which.
  const duplicates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of clients) {
      const key = (c.name || '').trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [clients]);

  const sharesName = (name: string) => (duplicates.get((name || '').trim().toLowerCase()) ?? 0) > 1;

  const needle = query.trim().toLowerCase();
  const filtered = needle === ''
    ? clients
    : clients.filter((c) =>
        [c.name, c.email, c.phone].some((f) => (f || '').toLowerCase().includes(needle)));

  const pick = (c: ClientOption) => {
    // Selecting fills the form with what is on file, rather than leaving the
    // operator to remember whether this is the right one of two same-named people.
    onChange({ id: c.id, name: c.name || '', email: c.email || '', phone: c.phone || '' });
    setQuery('');
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  // ── Chosen, or being created: the details, filled in and editable ────────
  if (value) {
    const existing = Boolean(value.id);
    const collision = !existing && clients.some(
      (c) => (c.name || '').trim().toLowerCase() === value.name.trim().toLowerCase() && value.name.trim() !== '');

    return (
      <div className="q-stack q-stack-sm">
        <div className="q-row q-row-between" style={{ alignItems: 'baseline' }}>
          <label className="q-label">{existing ? label : 'New client'}</label>
          <button
            type="button"
            className="q-btn-ghost q-btn-xs"
            onClick={() => { setReturningToSearch(true); onChange(null); }}
          >
            {existing ? 'Change client' : 'Select an existing client'}
          </button>
        </div>

        <div className="q-field">
          <input
            className="q-input"
            placeholder="Full name"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </div>

        <div className="q-row">
          <div className="q-field" style={{ flex: 1 }}>
            <label className="q-label">Phone</label>
            <input
              className="q-input"
              type="tel"
              placeholder="Optional"
              value={value.phone}
              onChange={(e) => onChange({ ...value, phone: e.target.value })}
            />
          </div>
          <div className="q-field" style={{ flex: 1 }}>
            <label className="q-label">Email</label>
            <input
              className="q-input"
              type="email"
              placeholder="Optional"
              value={value.email}
              onChange={(e) => onChange({ ...value, email: e.target.value })}
            />
          </div>
        </div>

        {existing && sharesName(value.name) && (
          <span className="q-meta-sm">
            Another client has this name. The phone number and email above distinguish them.
          </span>
        )}
        {collision && (
          <span className="q-meta-sm">
            A client named {value.name.trim()} already exists. Add a phone number or email to
            distinguish them.
          </span>
        )}
        {existing && (
          <span className="q-meta-sm">Changes are saved to the client record.</span>
        )}
      </div>
    );
  }

  // ── Nothing chosen yet: search or create ─────────────────────────────────
  return (
    <div className="q-field q-combo">
      <label className="q-label">{label}</label>
      <input
        className="q-input"
        placeholder="Search by name, phone or email"
        value={query}
        // Focused on mount only when the operator has just come back here from a
        // chosen client, so "Change client" lands ready to type rather than
        // needing a second click. A fresh form does not steal focus.
        autoFocus={returningToSearch}
        onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => { setTimeout(() => setIsOpen(false), 200); }}
      />

      {isOpen && (
        <div className="q-combo-menu">
          {allowNone && (
            <button
              type="button"
              className="q-combo-option"
              onMouseDown={() => { onChange(null); setIsOpen(false); }}
            >
              <div className="q-combo-title">No client yet</div>
            </button>
          )}

          {filtered.map((c) => (
            <button
              type="button"
              key={c.id}
              className="q-combo-option"
              onMouseDown={() => pick(c)}
            >
              <div className="q-combo-title">{c.name}</div>
              {(c.phone || c.email) ? (
                <div className="q-combo-sub">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
              ) : sharesName(c.name) ? (
                // Same name, nothing to tell them apart: picking the wrong one
                // here is silent, so it is said out loud instead.
                <div className="q-combo-sub">Duplicate name · no phone or email on record</div>
              ) : null}
            </button>
          ))}

          {/*
            * Creating is offered whether or not anything has been typed.
            *
            * It used to appear only once you started typing, so opening the list
            * and seeing nothing but existing names read as "these are your only
            * options". Adding someone new is half of what this control is for,
            * and it should not be a thing you have to discover.
            */}
          {filtered.length > 0 && <div className="q-combo-sep" />}
          <button
            type="button"
            className="q-combo-option q-combo-create"
            onMouseDown={() => {
              onChange({ ...EMPTY, name: query.trim() });
              setIsOpen(false);
            }}
          >
            {query.trim() !== ''
              ? <>Add new client: &ldquo;{query.trim()}&rdquo;</>
              : <>Add a new client</>}
          </button>

          {clients.length === 0 && query.trim() === '' && (
            <div className="q-combo-empty">No clients yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
