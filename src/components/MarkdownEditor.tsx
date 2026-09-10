'use client';

import React, { useRef, useLayoutEffect, useCallback, useState } from 'react';
import {
  Bold, Italic, Strikethrough, Highlighter, Heading, List, ListOrdered,
  ListChecks, Quote, Code, Link2, Minus, ImagePlus, Loader,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getStudioAssetUploadTarget, getPublicUrlForStudioAsset } from '@/kernel/organizations';
import { prepareImage } from './prepareImage';
import { toast } from './Toast';

/**
 * Writing a note.
 *
 * IT IS STILL A TEXTAREA. The body is text, so the thing that edits it edits
 * text — the toolbar and the shortcuts put marks into the string, and a person
 * who would rather type the marks themselves gets exactly the same note. A
 * contenteditable surface would have made the textarea's own behaviour — undo,
 * spellcheck, dictation, the caret a phone keyboard expects — something this
 * app had to reimplement badly.
 *
 * THE PART THAT IS NOT DECORATION. Enter continues a list, and empties it when
 * the item is empty; Tab indents inside one. Those two are why a checklist is
 * usable at all — without them, writing five items means typing the marker five
 * times, and nobody does that twice.
 *
 * Every button is a toggle. Pressing Bold on bold text unbolds it, and pressing
 * Checklist on a bullet converts it rather than stacking a second marker onto
 * the first, because the markers are mutually exclusive claims about a line.
 */

/** Any block marker at the head of a line — the family a new one replaces. */
const MARKER = /^([ \t]*)(#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+\[[ xX]\][ \t]*|[-*+][ \t]+|\d{1,9}[.)][ \t]+)?/;

/** A list item, taken apart: indent, marker, box, and what was written. */
const CONTINUES = /^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))[ \t]+(\[[ xX]\][ \t]*)?(.*)$/;
const QUOTED = /^([ \t]*)>[ \t]?(.*)$/;

type Selection = [number, number];

/** What a toolbar button does. A name, so the bar is data rather than closures. */
type Command =
  | 'bold' | 'italic' | 'strike' | 'highlight' | 'code' | 'link'
  | 'heading' | 'bullets' | 'numbers' | 'checklist' | 'quote' | 'rule';

/*
 * The bar itself lives out here, built once.
 *
 * It was an array of closures built during render, each holding the callbacks
 * that read the textarea — which is a ref being reached for while React is
 * rendering. Naming the commands instead leaves the bar as plain data and the
 * reaching to the click, where it belongs.
 */
const TOOLBAR: Array<{ cmd: Command; label: string; keys?: string; icon: React.ReactNode }> = [
  { cmd: 'bold', label: 'Bold', keys: '⌘B', icon: <Bold size={14} /> },
  { cmd: 'italic', label: 'Italic', keys: '⌘I', icon: <Italic size={14} /> },
  { cmd: 'strike', label: 'Strikethrough', keys: '⌘⇧X', icon: <Strikethrough size={14} /> },
  { cmd: 'highlight', label: 'Highlight', icon: <Highlighter size={14} /> },
  { cmd: 'heading', label: 'Heading', icon: <Heading size={14} /> },
  { cmd: 'bullets', label: 'Bulleted list', icon: <List size={14} /> },
  { cmd: 'numbers', label: 'Numbered list', icon: <ListOrdered size={14} /> },
  { cmd: 'checklist', label: 'Checklist', icon: <ListChecks size={14} /> },
  { cmd: 'quote', label: 'Quote', icon: <Quote size={14} /> },
  { cmd: 'code', label: 'Code', keys: '⌘E', icon: <Code size={14} /> },
  { cmd: 'link', label: 'Link', keys: '⌘K', icon: <Link2 size={14} /> },
  { cmd: 'rule', label: 'Divider', icon: <Minus size={14} /> },
];

export function MarkdownEditor({
  value,
  onChange,
  rows = 14,
  placeholder,
  disabled,
  autoFocus,
  toolbar = true,
  onSubmit,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  toolbar?: boolean;
  /** Cmd/Ctrl+Enter, where the surface has a button rather than autosaving. */
  onSubmit?: () => void;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const pending = useRef<Selection | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  /*
   * React owns the value, so the caret has to be put back by hand after every
   * change this component makes — before paint, or the caret visibly jumps to
   * the end and back.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !pending.current) return;
    const [start, end] = pending.current;
    pending.current = null;
    el.focus();
    el.setSelectionRange(start, end);
  });

  const apply = useCallback((next: string, selection: Selection) => {
    pending.current = selection;
    onChange(next);
  }, [onChange]);

  /** The text, and what of it is selected, at the moment a command runs. */
  const surface = useCallback(() => {
    const el = ref.current!;
    return { text: value, start: el.selectionStart, end: el.selectionEnd };
  }, [value]);

  /** Bold, italic, strike, highlight, code — on, or back off. */
  const wrap = useCallback((mark: string) => {
    const el = ref.current;
    if (!el) return;
    const { text, start, end } = surface();
    const n = mark.length;

    // Already wrapped, either inside the selection or just outside it.
    const inside = text.slice(start, end);
    if (inside.startsWith(mark) && inside.endsWith(mark) && inside.length >= n * 2) {
      const bare = inside.slice(n, -n);
      apply(text.slice(0, start) + bare + text.slice(end), [start, start + bare.length]);
      return;
    }
    if (text.slice(start - n, start) === mark && text.slice(end, end + n) === mark) {
      apply(
        text.slice(0, start - n) + inside + text.slice(end + n),
        [start - n, end - n],
      );
      return;
    }

    apply(
      text.slice(0, start) + mark + inside + mark + text.slice(end),
      inside ? [start + n, end + n] : [start + n, start + n],
    );
  }, [apply, surface]);

  /**
   * Put a marker on every line the selection touches, or take it off.
   *
   * `make` is given the line's position so a numbered list can count. The
   * existing marker is stripped first whatever it was, which is what makes the
   * buttons mutually exclusive rather than cumulative.
   */
  const prefixLines = useCallback((make: (index: number) => string) => {
    const el = ref.current;
    if (!el) return;
    const { text, start, end } = surface();

    const from = text.lastIndexOf('\n', start - 1) + 1;
    const toRaw = text.indexOf('\n', end);
    const to = toRaw === -1 ? text.length : toRaw;

    const lines = text.slice(from, to).split('\n');
    const already = lines.every((line, i) => {
      const m = MARKER.exec(line)!;
      return (m[2] ?? '') === make(i);
    });

    const next = lines.map((line, i) => {
      const m = MARKER.exec(line)!;
      const bare = line.slice(m[0].length);
      return already ? m[1] + bare : m[1] + make(i) + bare;
    }).join('\n');

    apply(
      text.slice(0, from) + next + text.slice(to),
      [from, from + next.length],
    );
  }, [apply, surface]);

  const rule = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { text, start } = surface();
    const at = text.indexOf('\n', start) === -1 ? text.length : text.indexOf('\n', start);
    const before = text.slice(0, at);
    const insert = `${before && !before.endsWith('\n') ? '\n' : ''}\n---\n\n`;
    apply(before + insert + text.slice(at), [before.length + insert.length, before.length + insert.length]);
  }, [apply, surface]);

  /**
   * A link, opened at whichever end still needs filling in.
   *
   * Selected an address, and the words are missing; selected the words, and the
   * address is. The caret lands in the empty half either way, so the next thing
   * typed or pasted is the thing that was not there.
   */
  const link = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { text, start, end } = surface();
    const picked = text.slice(start, end).trim();
    const isUrl = /^(?:https?:\/\/|mailto:|www\.)\S+$/i.test(picked);

    const label = isUrl ? '' : picked;
    const href = isUrl ? picked : '';
    const made = `[${label}](${href})`;
    const caret = isUrl ? start + 1 : start + made.length - 1;

    apply(text.slice(0, start) + made + text.slice(end), [caret, caret]);
  }, [apply, surface]);

  /* ---------------------------------------------------------------------
   * The keyboard.
   * ------------------------------------------------------------------ */

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit(); return; }

    if (mod && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') { e.preventDefault(); wrap('**'); return; }
      if (key === 'i') { e.preventDefault(); wrap('*'); return; }
      if (key === 'e') { e.preventDefault(); wrap('`'); return; }
      if (key === 'k') { e.preventDefault(); link(); return; }
      if (e.shiftKey && key === 'x') { e.preventDefault(); wrap('~~'); return; }
    }

    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    const from = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', end) === -1 ? value.length : value.indexOf('\n', end);
    const line = value.slice(from, value.indexOf('\n', start) === -1 ? value.length : value.indexOf('\n', start));

    /*
     * Enter carries the list on.
     *
     * On an item that has words: a new item, indented the same, numbered the
     * next, with a fresh box if the one above had one. On an item that is
     * empty: the marker comes off instead, which is how a person gets out of a
     * list without reaching for the mouse.
     */
    if (e.key === 'Enter' && !e.shiftKey && !mod && start === end) {
      const item = CONTINUES.exec(line);
      if (item) {
        const [, indent, bullet, number, delim, box, written] = item;
        if (!written.trim()) {
          e.preventDefault();
          apply(value.slice(0, from) + indent + value.slice(from + line.length), [
            from + indent.length, from + indent.length,
          ]);
          return;
        }
        const marker = bullet
          ? `${bullet} ${box ? '[ ] ' : ''}`
          : `${Number(number) + 1}${delim} ${box ? '[ ] ' : ''}`;
        const insert = `\n${indent}${marker}`;
        e.preventDefault();
        apply(value.slice(0, start) + insert + value.slice(end), [
          start + insert.length, start + insert.length,
        ]);
        return;
      }

      const quoted = QUOTED.exec(line);
      if (quoted) {
        if (!quoted[2].trim()) {
          e.preventDefault();
          apply(value.slice(0, from) + quoted[1] + value.slice(from + line.length), [
            from + quoted[1].length, from + quoted[1].length,
          ]);
          return;
        }
        const insert = `\n${quoted[1]}> `;
        e.preventDefault();
        apply(value.slice(0, start) + insert + value.slice(end), [
          start + insert.length, start + insert.length,
        ]);
        return;
      }
      return;
    }

    /*
     * Tab indents, but only inside a list.
     *
     * Anywhere else it moves to the next control, because a textarea that eats
     * Tab is a keyboard trap — a person who cannot use a mouse would have no
     * way out of the note.
     */
    if (e.key === 'Tab' && CONTINUES.test(line)) {
      e.preventDefault();
      const lines = value.slice(from, lineEnd).split('\n');
      let firstDelta = 0;
      let total = 0;
      const next = lines.map((l, i) => {
        if (e.shiftKey) {
          const off = /^(?: {1,2}|\t)/.exec(l);
          const delta = off ? -off[0].length : 0;
          if (i === 0) firstDelta = delta;
          total += delta;
          return off ? l.slice(off[0].length) : l;
        }
        if (i === 0) firstDelta = 2;
        total += 2;
        return `  ${l}`;
      }).join('\n');

      apply(value.slice(0, from) + next + value.slice(lineEnd), [
        Math.max(from, start + firstDelta),
        Math.max(from, end + total),
      ]);
    }
  };

  /**
   * A picture, put where the caret is.
   *
   * The same four steps the cover and avatar pickers take — resize, ask the
   * studio's bucket for a target, upload, publish — because there is one way
   * this app puts a file somewhere and this is not going to be a second. What
   * comes back is a URL, and a URL in a note is a mark like any other, so the
   * whole of "an image in a note" is the markdown this writes.
   */
  const attach = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const prepared = await prepareImage(file, { maxEdge: 1600 });
      const { bucket, path } = await getStudioAssetUploadTarget(prepared.file.name, 'notes');
      const supabase = createClient();
      const { error } = await supabase.storage.from(bucket).upload(path, prepared.file);
      if (error) throw new Error(error.message);
      const url = await getPublicUrlForStudioAsset(path);

      const el = ref.current;
      const at = el ? el.selectionStart : value.length;
      // Named after the file, which is the only name anybody has given it yet.
      const alt = file.name.replace(/\.[^.]+$/, '');
      const before = value.slice(0, at);
      const lead = before && !before.endsWith('\n') ? '\n\n' : '';
      const made = `${lead}![${alt}](${url})\n`;
      apply(before + made + value.slice(at), [at + made.length, at + made.length]);
    } catch (err) {
      // Said in full: a studio that cannot upload needs to know whether it is
      // the file, the network, or its own permissions.
      const why = err instanceof Error && err.message ? `: ${err.message}` : '.';
      toast.bad(`That picture could not be added${why}`);
    } finally {
      setUploading(false);
    }
  }, [apply, value]);

  const runCommand = useCallback((cmd: Command) => {
    switch (cmd) {
      case 'bold': return wrap('**');
      case 'italic': return wrap('*');
      case 'strike': return wrap('~~');
      case 'highlight': return wrap('==');
      case 'code': return wrap('`');
      case 'link': return link();
      case 'heading': return prefixLines(() => '## ');
      case 'bullets': return prefixLines(() => '- ');
      case 'numbers': return prefixLines((i) => `${i + 1}. `);
      case 'checklist': return prefixLines(() => '- [ ] ');
      case 'quote': return prefixLines(() => '> ');
      case 'rule': return rule();
    }
  }, [wrap, link, prefixLines, rule]);

  return (
    <div className="q-md">
      {toolbar && (
        <div className="q-md-bar" role="toolbar" aria-label="Formatting">
          {TOOLBAR.map((b) => (
            <button
              key={b.cmd}
              type="button"
              className="q-md-btn"
              title={b.keys ? `${b.label}  ${b.keys}` : b.label}
              aria-label={b.label}
              disabled={disabled}
              /* The textarea must keep the selection the button is about to act
                 on, so the press must not move focus first. */
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCommand(b.cmd)}
            >
              {b.icon}
            </button>
          ))}

          {/* A file input has no appearance worth keeping, so the button is the
              button and this is only the mechanism behind it. */}
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const picked = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (picked) attach(picked);
            }}
          />
          <button
            type="button"
            className="q-md-btn"
            title="Picture"
            aria-label="Picture"
            disabled={disabled || uploading}
            aria-busy={uploading}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => file.current?.click()}
          >
            {uploading ? <Loader size={14} className="q-spin" /> : <ImagePlus size={14} />}
          </button>
        </div>
      )}

      <textarea
        ref={ref}
        className="q-textarea q-md-text"
        rows={rows}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        spellCheck
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
