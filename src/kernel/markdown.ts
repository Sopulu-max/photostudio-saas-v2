/**
 * Markdown — how a note's text is read.
 *
 * A note's body is a text column and stays one. Formatting is a SECOND READING
 * of that text, not a second place to store it.
 *
 * The alternative was a rich-document column — HTML, or an editor's own JSON.
 * It would have cost four things this app already has: the first line standing
 * in for a missing title, searching a note by its words, the plain render on a
 * booking page, and every note already written. It would also have needed a
 * sanitiser and a migration. Text needs none of them: a note typed before this
 * existed is already valid, and one that never gets a heading is not a defect.
 *
 * WHY THIS IS HAND-WRITTEN. Nothing here parses untrusted input — a note is
 * typed by the operator whose studio it belongs to — and the output is React
 * elements rather than an HTML string, so there is no markup to sanitise and
 * nothing for dangerouslySetInnerHTML to do. A dependency would have brought an
 * HTML pipeline this app has no other use for.
 *
 * WHAT IS DELIBERATELY MISSING. Images. The syntax is three lines to parse and
 * would render a box a person cannot fill, because nothing here uploads a file
 * to put in it. A control that cannot be used is worse than one that is absent,
 * and images are their own slice with their own storage.
 */

export type Inline =
  | { kind: 'text'; text: string }
  /** A newline inside a paragraph. In a note, Enter means a new line. */
  | { kind: 'break' }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'strike'; children: Inline[] }
  | { kind: 'mark'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] };

export type ListItem = {
  content: Inline[];
  /** Null for an ordinary bullet; true or false for a task box. */
  checked: boolean | null;
  /**
   * Which line of the body this item is on.
   *
   * Carried because ticking a box has to rewrite exactly one line of the text
   * the operator typed, and leave the rest of it alone — including whatever
   * they wrote that this parser does not understand.
   */
  line: number;
  children: Block[];
};

export type Align = 'left' | 'center' | 'right';

export type Block =
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'heading'; level: 1 | 2 | 3; content: Inline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'code'; text: string; lang: string | null }
  | { kind: 'rule' }
  | { kind: 'table'; align: Align[]; head: Inline[][]; rows: Inline[][][] };

/** A line of the body, with the number it had before anything was stripped. */
type Src = { text: string; no: number };

const FENCE = /^ {0,3}```[ \t]*([A-Za-z0-9+#._-]*)[ \t]*$/;
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*)$/;
const QUOTE = /^ {0,3}>[ \t]?(.*)$/;
const ITEM = /^([ \t]*)(?:([-*+])|(\d{1,9})[.)])[ \t]+(.*)$/;
const TASK = /^\[([ xX])\](?:[ \t]+(.*))?$/;
const DELIM = /^[ \t]*\|?(?:[ \t]*:?-+:?[ \t]*\|)*[ \t]*:?-+:?[ \t]*\|?[ \t]*$/;

/** Tabs count as two columns, so an indent typed either way nests the same. */
function width(indent: string): number {
  let n = 0;
  for (const c of indent) n += c === '\t' ? 2 : 1;
  return n;
}

function leading(line: string): string {
  return /^[ \t]*/.exec(line)![0];
}

/** Take `by` columns off the front, so nested content parses from zero. */
function dedent(lines: Src[], by: number): Src[] {
  return lines.map(({ text, no }) => {
    let k = 0;
    let taken = 0;
    while (k < text.length && taken < by && (text[k] === ' ' || text[k] === '\t')) {
      taken += text[k] === '\t' ? 2 : 1;
      k++;
    }
    return { text: text.slice(k), no };
  });
}

/** The note, read. */
export function parseMarkdown(body: string): Block[] {
  const src: Src[] = (body ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((text, no) => ({ text, no }));
  return blocksOf(src);
}

function isTableAt(src: Src[], i: number): boolean {
  return (
    src[i].text.includes('|') &&
    i + 1 < src.length &&
    src[i + 1].text.includes('-') &&
    DELIM.test(src[i + 1].text)
  );
}

/** Does this line begin something other than the paragraph being gathered? */
function startsBlock(src: Src[], i: number): boolean {
  const line = src[i].text;
  if (FENCE.test(line) || RULE.test(line) || HEADING.test(line)) return true;
  if (QUOTE.test(line) || ITEM.test(line)) return true;
  return isTableAt(src, i);
}

function blocksOf(src: Src[]): Block[] {
  const out: Block[] = [];
  let i = 0;

  while (i < src.length) {
    const line = src[i].text;

    if (!line.trim()) { i++; continue; }

    const fence = FENCE.exec(line);
    if (fence) {
      const lines: string[] = [];
      i++;
      while (i < src.length && !FENCE.test(src[i].text)) { lines.push(src[i].text); i++; }
      if (i < src.length) i++; // the closing fence, when there is one
      out.push({ kind: 'code', text: lines.join('\n'), lang: fence[1] || null });
      continue;
    }

    /* Before the list check: a rule has no marker-then-space, so it cannot be
       taken for a bullet, but reading it first says the intent plainly. */
    if (RULE.test(line)) { out.push({ kind: 'rule' }); i++; continue; }

    const heading = HEADING.exec(line);
    if (heading) {
      // Deeper than three in a note is a document pretending to be a thought.
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      const text = heading[2].replace(/[ \t]+#+[ \t]*$/, '').trim();
      out.push({ kind: 'heading', level, content: inlinesOf(text) });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: Src[] = [];
      while (i < src.length && QUOTE.test(src[i].text)) {
        inner.push({ text: QUOTE.exec(src[i].text)![1], no: src[i].no });
        i++;
      }
      out.push({ kind: 'quote', blocks: blocksOf(inner) });
      continue;
    }

    if (isTableAt(src, i)) {
      const [table, next] = tableAt(src, i);
      out.push(table);
      i = next;
      continue;
    }

    if (ITEM.test(line)) {
      const [list, next] = listAt(src, i);
      out.push(list);
      i = next;
      continue;
    }

    const para: string[] = [];
    while (i < src.length && src[i].text.trim() && !startsBlock(src, i)) {
      para.push(src[i].text.trim());
      i++;
    }
    /* Defensive: a first line that both failed every check above and claims to
       start a block would otherwise spin here forever. */
    if (para.length === 0) { para.push(src[i].text.trim()); i++; }
    out.push({ kind: 'paragraph', content: inlinesOf(para.join('\n')) });
  }

  return out;
}

function listAt(src: Src[], from: number): [Block, number] {
  const first = ITEM.exec(src[from].text)!;
  const base = width(first[1]);
  const ordered = Boolean(first[3]);
  const start = ordered ? Number(first[3]) : 1;
  const items: ListItem[] = [];
  let i = from;

  while (i < src.length) {
    // A blank line belongs to the list only if the list carries on after it.
    if (!src[i].text.trim()) {
      let j = i;
      while (j < src.length && !src[j].text.trim()) j++;
      if (j >= src.length) break;
      const ahead = ITEM.exec(src[j].text);
      const carriesOn = ahead
        ? width(ahead[1]) >= base
        : width(leading(src[j].text)) > base;
      if (!carriesOn) break;
      i = j;
      continue;
    }

    const m = ITEM.exec(src[i].text);
    if (!m) break;
    if (width(m[1]) !== base) break;
    /* A bulleted list directly under a numbered one is its own list, not a
       stray item — they are different claims about the same lines. */
    if (Boolean(m[3]) !== ordered) break;

    let text = m[4];
    let checked: boolean | null = null;
    const task = TASK.exec(text);
    if (task) {
      checked = task[1].toLowerCase() === 'x';
      text = task[2] ?? '';
    }

    const line = src[i].no;
    i++;

    // Everything indented under it belongs to it.
    const nested: Src[] = [];
    while (i < src.length) {
      if (!src[i].text.trim()) {
        let j = i;
        while (j < src.length && !src[j].text.trim()) j++;
        if (j < src.length && width(leading(src[j].text)) > base) { nested.push(src[i]); i++; continue; }
        break;
      }
      if (width(leading(src[i].text)) <= base) break;
      nested.push(src[i]);
      i++;
    }

    items.push({
      content: inlinesOf(text),
      checked,
      line,
      children: nested.length ? blocksOf(dedent(nested, base + 1)) : [],
    });
  }

  return [{ kind: 'list', ordered, start, items }, i];
}

/** An escaped pipe is one cell holding a pipe, not two cells. */
function splitCells(row: string): string[] {
  let text = row.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);

  const out: string[] = [];
  let buf = '';
  for (let k = 0; k < text.length; k++) {
    if (text[k] === '\\' && text[k + 1] === '|') { buf += '|'; k++; continue; }
    if (text[k] === '|') { out.push(buf); buf = ''; continue; }
    buf += text[k];
  }
  out.push(buf);
  return out.map((c) => c.trim());
}

function tableAt(src: Src[], from: number): [Block, number] {
  const head = splitCells(src[from].text);
  const align: Align[] = splitCells(src[from + 1].text).map((c) => {
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });

  let i = from + 2;
  const rows: Inline[][][] = [];
  while (i < src.length && src[i].text.trim() && src[i].text.includes('|')) {
    const cells = splitCells(src[i].text);
    // Ragged rows are normal in something typed by hand; square them up.
    while (cells.length < head.length) cells.push('');
    rows.push(cells.slice(0, head.length).map(inlinesOf));
    i++;
  }

  return [{
    kind: 'table',
    align: head.map((_, k) => align[k] ?? 'left'),
    head: head.map(inlinesOf),
    rows,
  }, i];
}

/**
 * Where a link is allowed to point.
 *
 * A scheme that executes is refused rather than rendered — the note is the
 * operator's own, but a pasted link is not necessarily, and something that runs
 * has no business being one click away. Anything with no scheme at all is
 * treated as a domain someone typed, which is what they meant.
 */
export function safeHref(raw: string): string | null {
  const href = (raw ?? '').trim();
  if (!href) return null;
  if (/^(?:https?:|mailto:|tel:)/i.test(href)) return href;
  if (/^[/#]/.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  return `https://${href}`;
}

const ESCAPABLE = '\\`*_~=[]()#-+>!|';

const WRAPS: Array<[string, 'strong' | 'em' | 'strike' | 'mark']> = [
  ['**', 'strong'],
  ['__', 'strong'],
  ['~~', 'strike'],
  ['==', 'mark'],
  ['*', 'em'],
  ['_', 'em'],
];

function isWordChar(c: string | undefined): boolean {
  return c !== undefined && /[A-Za-z0-9]/.test(c);
}

/** The index of the bracket closing the one at `from`, counting nested pairs. */
function matchBracket(text: string, from: number): number {
  let depth = 0;
  for (let k = from; k < text.length; k++) {
    if (text[k] === '\\') { k++; continue; }
    if (text[k] === '[') depth++;
    else if (text[k] === ']') { depth--; if (depth === 0) return k; }
  }
  return -1;
}

function inlinesOf(text: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ kind: 'text', text: buf }); buf = ''; } };

  let i = 0;
  while (i < text.length) {
    const c = text[i];

    if (c === '\\' && ESCAPABLE.includes(text[i + 1] ?? '')) {
      buf += text[i + 1];
      i += 2;
      continue;
    }

    if (c === '\n') { flush(); out.push({ kind: 'break' }); i++; continue; }

    // Code first, and nothing inside it is read as anything else.
    if (c === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ kind: 'code', text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (c === '<') {
      const auto = /^<((?:https?:\/\/|mailto:)[^\s>]+)>/.exec(text.slice(i));
      if (auto) {
        const href = safeHref(auto[1]);
        if (href) {
          flush();
          out.push({ kind: 'link', href, children: [{ kind: 'text', text: auto[1] }] });
          i += auto[0].length;
          continue;
        }
      }
    }

    if (c === '[') {
      const close = matchBracket(text, i);
      if (close > i && text[close + 1] === '(') {
        const end = text.indexOf(')', close + 2);
        if (end > close) {
          const target = text.slice(close + 2, end).trim().split(/\s+/)[0];
          const href = safeHref(target);
          if (href) {
            flush();
            out.push({ kind: 'link', href, children: inlinesOf(text.slice(i + 1, close)) });
            i = end + 1;
            continue;
          }
        }
      }
    }

    if (c === 'h' || c === 'w') {
      const bare = /^(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]|www\.[^\s<>()]*[^\s<>().,;:!?'"])/
        .exec(text.slice(i));
      if (bare) {
        const href = safeHref(bare[1].startsWith('www.') ? `https://${bare[1]}` : bare[1]);
        if (href) {
          flush();
          out.push({ kind: 'link', href, children: [{ kind: 'text', text: bare[1] }] });
          i += bare[1].length;
          continue;
        }
      }
    }

    let wrapped = false;
    for (const [mark, kind] of WRAPS) {
      if (!text.startsWith(mark, i)) continue;

      /* An underscore inside a word and a multiplication sign are not
         emphasis. A single-character mark has to sit on a word boundary and
         hug its contents, or it is just a character somebody typed. */
      if (mark.length === 1) {
        if (mark === '_' && isWordChar(text[i - 1])) continue;
        if (text[i + 1] === ' ' || text[i + 1] === undefined) continue;
      }

      const close = text.indexOf(mark, i + mark.length);
      if (close <= i + mark.length) continue;
      if (text[close - 1] === ' ') continue;
      if (mark === '_' && isWordChar(text[close + mark.length])) continue;

      flush();
      out.push({ kind, children: inlinesOf(text.slice(i + mark.length, close)) } as Inline);
      i = close + mark.length;
      wrapped = true;
      break;
    }
    if (wrapped) continue;

    buf += c;
    i++;
  }

  flush();
  return out;
}

/* -------------------------------------------------------------------------
 * The other readings of the same text.
 * ---------------------------------------------------------------------- */

function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => {
    switch (n.kind) {
      case 'text': return n.text;
      case 'code': return n.text;
      case 'break': return '\n';
      default: return inlineText(n.children);
    }
  }).join('');
}

function blockText(blocks: Block[]): string {
  return blocks.map((b) => {
    switch (b.kind) {
      case 'paragraph':
      case 'heading':
        return inlineText(b.content);
      case 'code':
        return b.text;
      case 'rule':
        return '';
      case 'quote':
        return blockText(b.blocks);
      case 'list':
        return b.items
          .map((it) => [inlineText(it.content), blockText(it.children)].filter(Boolean).join('\n'))
          .join('\n');
      case 'table':
        return [b.head, ...b.rows]
          .map((row) => row.map(inlineText).filter(Boolean).join(' · '))
          .join('\n');
    }
  }).filter((t) => t.trim()).join('\n');
}

/**
 * The note with its formatting taken back off.
 *
 * What a list preview shows, what stands in for a missing title, and what a
 * search matches against — because a person looking for the framer typed
 * "framer", not the marks around it, and a card showing a heading's hashes
 * would be showing them the marks instead of the words.
 */
export function plainText(body: string): string {
  return blockText(parseMarkdown(body)).replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Tick a box, and change nothing else.
 *
 * Rewrites exactly the one line, character for character either side of the
 * bracket, so a note that also contains something this parser does not
 * understand survives being ticked.
 */
export function toggleTaskLine(body: string, line: number): string {
  const lines = (body ?? '').replace(/\r\n?/g, '\n').split('\n');
  const text = lines[line];
  if (text === undefined) return body;

  const m = /^([ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])(\])/.exec(text);
  if (!m) return body;

  const flipped = m[2].toLowerCase() === 'x' ? ' ' : 'x';
  lines[line] = m[1] + flipped + m[3] + text.slice(m[0].length);
  return lines.join('\n');
}

/**
 * How much of the note's checklist is done, or null if it has no boxes.
 *
 * Shown on the card in the list, because a note that is half a checklist is a
 * different thing to read than one that is finished, and opening it to find out
 * is the work the list is meant to save.
 */
export function taskProgress(body: string): { done: number; total: number } | null {
  let done = 0;
  let total = 0;

  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.kind === 'list') {
        for (const it of b.items) {
          if (it.checked !== null) { total++; if (it.checked) done++; }
          walk(it.children);
        }
      } else if (b.kind === 'quote') {
        walk(b.blocks);
      }
    }
  };

  walk(parseMarkdown(body));
  return total > 0 ? { done, total } : null;
}

/** What the editor's footer says. Words are counted on the words, not the marks. */
export function noteStats(body: string): { words: number; characters: number } {
  const plain = plainText(body);
  return { words: plain.split(/\s+/).filter(Boolean).length, characters: plain.length };
}
