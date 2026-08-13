'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * See the list, and type anyway.
 *
 * A <select> shows what's known but refuses new words. A text box with a
 * datalist accepts new words but hides what's known until you guess the first
 * letter. Both are wrong here, because both make you choose between the
 * system's knowledge and your own.
 *
 * This is one control that does both: click and the whole list is there;
 * type and it filters; type something the list doesn't have and that is a
 * perfectly good answer, which becomes a known option next time. The
 * knowledge leads, the studio always overrules.
 */

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [ref, onOut, active]);
}

function Combo({
  text,
  setText,
  options,
  placeholder,
  onCommit,
  disabled,
  clearOnCommit,
}: {
  text: string;
  setText: (v: string) => void;
  options: string[];
  placeholder?: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
  clearOnCommit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useOutside(box, () => setOpen(false), open);

  const typed = text.trim();
  // Filter as you type, but an exact match shouldn't hide the rest of the list —
  // you may have opened it to change your mind, not to confirm.
  const filtered = typed && !options.some((o) => o.toLowerCase() === typed.toLowerCase())
    ? options.filter((o) => o.toLowerCase().includes(typed.toLowerCase()))
    : options;

  const isNew = typed.length > 0 && !options.some((o) => o.toLowerCase() === typed.toLowerCase());

  const commit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    onCommit(v);
    setText(clearOnCommit ? '' : v);
    setOpen(false);
    setActive(0);
  };

  return (
    <div ref={box} className="q-combo">
      <input
        className="q-input q-fill"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter') {
            e.preventDefault();
            // What's highlighted, or what you typed — typing wins if it's new.
            if (open && filtered[active] && !isNew) commit(filtered[active]);
            else if (typed) commit(typed);
          }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
        onBlur={() => { if (!clearOnCommit && typed) onCommit(typed); }}
      />

      {open && (filtered.length > 0 || isNew) && (
        <div className="q-combo-menu">
          {isNew && (
            <button className="q-combo-option q-combo-create" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(typed)}>
              Use “{typed}” — new
            </button>
          )}
          {filtered.map((o, i) => (
            <button
              key={o}
              className="q-combo-option"
              style={i === active && !isNew ? { background: 'var(--q-color-ink-50)' } : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => commit(o)}
            >
              {o}
            </button>
          ))}
          {filtered.length === 0 && !isNew && <div className="q-combo-empty">Nothing known yet — type to add one.</div>}
        </div>
      )}
    </div>
  );
}

/** One value: domain, service name, primary output. */
export function PickOne({
  value,
  onChange,
  options,
  placeholder = 'Choose or type…',
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  // The parent can reset this (picking a template, switching service), and the
  // box must follow rather than keep showing what used to be there.
  useEffect(() => { setText(value); }, [value]);

  return (
    <Combo
      text={text}
      setText={setText}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      onCommit={onChange}
    />
  );
}

/** Several values: the dimensions a service constrains, the outputs it produces. */
export function PickMany({
  values,
  onChange,
  options,
  placeholder = 'Choose or type…',
  disabled,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const remaining = options.filter((o) => !values.some((v) => v.toLowerCase() === o.toLowerCase()));

  return (
    <div className="q-stack q-stack-sm">
      {values.length > 0 && (
        <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
          {values.map((v) => (
            <span key={v} className="q-badge q-badge-neutral" style={{ cursor: 'pointer' }}
              onClick={() => onChange(values.filter((x) => x !== v))}>
              {v} &times;
            </span>
          ))}
        </div>
      )}
      <Combo
        text={text}
        setText={setText}
        options={remaining}
        placeholder={placeholder}
        disabled={disabled}
        clearOnCommit
        onCommit={(v) => {
          if (values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
          onChange([...values, v]);
        }}
      />
    </div>
  );
}

/**
 * Choose or type, then it's gone — for lists that live somewhere else.
 *
 * PickMany owns its chips. Settings pages don't: the values there are rows with
 * ids, carrying their own nesting and delete, and the caller renders them. All
 * that's needed is the box, so a studio defining its vocabulary sees what the
 * app already knows about that question instead of typing into the dark.
 */
export function PickToAdd({
  options,
  placeholder = 'Choose or type…',
  onAdd,
  disabled,
}: {
  options: string[];
  placeholder?: string;
  onAdd: (value: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  return (
    <Combo
      text={text}
      setText={setText}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      clearOnCommit
      onCommit={onAdd}
    />
  );
}
