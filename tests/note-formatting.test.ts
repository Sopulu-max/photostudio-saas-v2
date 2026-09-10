import { describe, it, expect } from 'vitest';
import {
  parseMarkdown, plainText, toggleTaskLine, taskProgress, safeHref, safeImageSrc, noteStats,
  type Block, type Inline,
} from '@/kernel/markdown';

/**
 * A NOTE'S FORMATTING IS A READING OF ITS TEXT.
 *
 * The body is a text column and stays one. Everything here is the second
 * reading — what the same string looks like when it is shown rather than
 * edited. No database: this is string work, and a test that reaches for the
 * network to check string work is testing the network.
 *
 * What is pinned is the behaviour that is easy to get wrong and invisible when
 * it is: that a note written before any of this existed still reads correctly,
 * that a search matches the words rather than the marks, that ticking a box
 * rewrites one line and disturbs nothing else, and that a pasted link cannot
 * carry a scheme that executes.
 */

/** The text a block tree renders, for assertions that do not care about shape. */
function textOf(nodes: Inline[]): string {
  return nodes.map((n) => {
    if (n.kind === 'text' || n.kind === 'code') return n.text;
    if (n.kind === 'break') return '\n';
    if (n.kind === 'image') return n.alt;
    return textOf(n.children);
  }).join('');
}

describe('a note written before any of this still reads', () => {
  it('keeps plain text as plain text', () => {
    /*
     * Every note in the database was typed into a plain textarea. If reading
     * them as markdown changed what they say, this whole approach would be a
     * migration wearing a disguise.
     */
    const body = 'Ring the framer about 20x30 stock.\nSecond shooter away in June.';
    const blocks = parseMarkdown(body);

    expect(blocks.length, 'plain lines became more than one block').toBe(1);
    expect(blocks[0].kind).toBe('paragraph');
    expect(plainText(body)).toBe(body);
  });

  it('treats a single newline as a line break, not as one long line', () => {
    /*
     * In real markdown a lone newline is a space. In a NOTE a person pressed
     * Enter because they wanted a new line, and joining their lines up would be
     * the app arguing with them.
     */
    const blocks = parseMarkdown('First thought\nSecond thought');
    const para = blocks[0] as Extract<Block, { kind: 'paragraph' }>;
    expect(para.content.some((n) => n.kind === 'break'), 'the newline was swallowed').toBe(true);
  });

  it('reads an empty note as nothing at all', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(plainText('')).toBe('');
    expect(taskProgress('')).toBeNull();
  });
});

describe('the marks a note can carry', () => {
  it('reads headings, and only down to three', () => {
    const blocks = parseMarkdown('# One\n\n## Two\n\n#### Still three');
    const levels = blocks.map((b) => (b.kind === 'heading' ? b.level : null));
    expect(levels).toEqual([1, 2, 3]);
  });

  it('reads bold, italic, strikethrough, highlight and code', () => {
    const para = parseMarkdown('**b** *i* ~~s~~ ==h== `c`')[0] as Extract<Block, { kind: 'paragraph' }>;
    const kinds = para.content.filter((n) => n.kind !== 'text').map((n) => n.kind);
    expect(kinds).toEqual(['strong', 'em', 'strike', 'mark', 'code']);
  });

  it('leaves a multiplication sign and a snake_case name alone', () => {
    /*
     * The reason single-character marks need a boundary rule at all. A studio
     * writing "2 * 3 * 4" or a file called "shot_list_final" is not asking for
     * italics, and silently eating their characters is worse than not
     * formatting at all.
     */
    for (const body of ['2 * 3 * 4', 'shot_list_final.psd', 'a_b_c']) {
      const para = parseMarkdown(body)[0] as Extract<Block, { kind: 'paragraph' }>;
      expect(para.content.every((n) => n.kind === 'text'), `"${body}" was read as emphasis`).toBe(true);
      expect(plainText(body), `"${body}" did not survive`).toBe(body);
    }
  });

  it('reads nothing inside a code span', () => {
    const para = parseMarkdown('`**not bold**`')[0] as Extract<Block, { kind: 'paragraph' }>;
    expect(para.content[0]).toEqual({ kind: 'code', text: '**not bold**' });
  });

  it('lets a mark be escaped back into a character', () => {
    const body = 'Charge \\*before\\* the shoot';
    expect(plainText(body)).toBe('Charge *before* the shoot');
  });

  it('reads bullets, numbers and nesting', () => {
    const list = parseMarkdown('- Lens\n- Bodies\n  - The spare\n')[0] as Extract<Block, { kind: 'list' }>;
    expect(list.kind).toBe('list');
    expect(list.ordered).toBe(false);
    expect(list.items.length, 'the nested item was counted as a sibling').toBe(2);
    expect(textOf(list.items[1].children.flatMap((b) => (b.kind === 'list' ? b.items[0].content : [])))).toBe('The spare');
  });

  it('keeps a numbered list starting where it was told to', () => {
    const list = parseMarkdown('3. Third\n4. Fourth')[0] as Extract<Block, { kind: 'list' }>;
    expect(list.ordered).toBe(true);
    expect(list.start, 'a numbered list restarted at one').toBe(3);
  });

  it('reads a quote, a rule and a fenced block', () => {
    const blocks = parseMarkdown('> Said on the phone\n\n---\n\n```sql\nselect 1\n```');
    expect(blocks.map((b) => b.kind)).toEqual(['quote', 'rule', 'code']);
    const code = blocks[2] as Extract<Block, { kind: 'code' }>;
    expect(code.lang).toBe('sql');
    expect(code.text).toBe('select 1');
  });

  it('reads a table, with its alignment', () => {
    const table = parseMarkdown(
      '| Size | Price |\n| --- | ---: |\n| 20x30 | 45000 |',
    )[0] as Extract<Block, { kind: 'table' }>;
    expect(table.kind).toBe('table');
    expect(table.align).toEqual(['left', 'right']);
    expect(table.rows.length).toBe(1);
    expect(textOf(table.rows[0][1])).toBe('45000');
  });
});

describe('a search matches the words, not the marks', () => {
  it('strips formatting for the list preview and the fallback title', () => {
    /*
     * The card in the list and the heading that stands in for a missing title
     * both read this. Showing "## Ring the framer" would be showing a person
     * the marks instead of what they wrote.
     */
    const body = '## Ring the framer\n\n- **20x30** stock\n- [ ] Call ~~Tuesday~~ Wednesday';
    const plain = plainText(body);

    expect(plain.split('\n')[0], 'the heading kept its hashes').toBe('Ring the framer');
    expect(plain, 'a mark survived into the preview').not.toMatch(/[*#~[\]]/);
    expect(plain, 'searching for a bolded word would miss it').toContain('20x30 stock');
    expect(plain).toContain('Call Tuesday Wednesday');
  });

  it('counts words on the words', () => {
    expect(noteStats('**Two** words').words).toBe(2);
    expect(noteStats('').words).toBe(0);
  });
});

describe('a checklist is the part of a note that is also work', () => {
  it('reads a box, ticked or not, and says which line it is on', () => {
    const list = parseMarkdown('Shot list\n\n- [ ] Rings\n- [x] Vows')[0 + 1] as Extract<Block, { kind: 'list' }>;
    expect(list.items.map((i) => i.checked)).toEqual([false, true]);
    expect(list.items.map((i) => i.line), 'a box pointed at the wrong line').toEqual([2, 3]);
  });

  it('an ordinary bullet is not a box', () => {
    const list = parseMarkdown('- Just a bullet')[0] as Extract<Block, { kind: 'list' }>;
    expect(list.items[0].checked, 'a plain bullet grew a checkbox').toBeNull();
  });

  it('ticking rewrites one line and disturbs nothing else', () => {
    /*
     * The whole reason a box carries its line number. A note is text the
     * operator typed, including whatever this parser does not understand, and
     * a tick must not rewrite any of it.
     */
    const body = [
      '# Wedding kit',
      '',
      '- [ ] Rings',
      '- [x] Vows',
      '',
      'Odd line the parser has no opinion about | & <>',
    ].join('\n');

    const ticked = toggleTaskLine(body, 2);
    expect(ticked.split('\n')[2]).toBe('- [x] Rings');
    expect(ticked.split('\n').filter((_, i) => i !== 2))
      .toEqual(body.split('\n').filter((_, i) => i !== 2));

    // And back again.
    expect(toggleTaskLine(ticked, 2)).toBe(body);
    // Unticking the other one is the same move in reverse.
    expect(toggleTaskLine(body, 3).split('\n')[3]).toBe('- [ ] Vows');
  });

  it('refuses to rewrite a line that is not a box', () => {
    const body = '# Wedding kit\n- [ ] Rings';
    expect(toggleTaskLine(body, 0), 'a heading was rewritten as a checkbox').toBe(body);
    expect(toggleTaskLine(body, 99), 'a line that does not exist was rewritten').toBe(body);
  });

  it('counts the progress of a note that has boxes, and only of one that does', () => {
    expect(taskProgress('- [x] Done\n- [ ] Not\n- [x] Also done')).toEqual({ done: 2, total: 3 });
    expect(taskProgress('- Just bullets\n- No boxes'), 'a note without boxes claimed progress').toBeNull();
    expect(taskProgress('- [ ] Outer\n  - [x] Inner'), 'a nested box was not counted').toEqual({ done: 1, total: 2 });
  });
});

describe('a link cannot carry a scheme that executes', () => {
  it('allows the schemes a studio actually types', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com');
    expect(safeHref('mailto:studio@example.com')).toBe('mailto:studio@example.com');
    expect(safeHref('tel:+2348012345678')).toBe('tel:+2348012345678');
    expect(safeHref('/bookings'), 'a link into the app itself was refused').toBe('/bookings');
    expect(safeHref('example.com'), 'a bare domain was not read as one').toBe('https://example.com');
  });

  it('refuses one that runs', () => {
    /*
     * A note is the operator's own text, but a pasted link is not necessarily,
     * and something that executes has no business being one click away.
     */
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>', 'vbscript:x']) {
      expect(safeHref(bad), `${bad} was allowed`).toBeNull();
    }
  });

  it('drops the link rather than the words when the target is refused', () => {
    // The person still wrote something; refusing the href must not eat it.
    const plain = plainText('[Click here](javascript:alert(1))');
    expect(plain).toContain('Click here');
  });

  it('reads a bare address as a link', () => {
    const para = parseMarkdown('See https://example.com/prices for it.')[0] as Extract<Block, { kind: 'paragraph' }>;
    const link = para.content.find((n) => n.kind === 'link');
    expect(link, 'a pasted address was left as text').toBeTruthy();
    expect((link as Extract<Inline, { kind: 'link' }>).href).toBe('https://example.com/prices');
  });

  it('does not swallow the sentence that follows an address', () => {
    const para = parseMarkdown('At https://example.com. Then ring them.')[0] as Extract<Block, { kind: 'paragraph' }>;
    const link = para.content.find((n) => n.kind === 'link') as Extract<Inline, { kind: 'link' }>;
    expect(link.href, 'the full stop was taken into the address').toBe('https://example.com');
    expect(textOf(para.content)).toContain('. Then ring them.');
  });
});

describe('a picture is a mark, not a column', () => {
  it('reads one, and keeps what it was called', () => {
    /*
     * An image in a note is the same claim as a link: a URL written into the
     * body. That is the whole of it — no table, no column, and a note with a
     * picture in it is still one text column.
     */
    const para = parseMarkdown('![The gate](https://cdn.example.com/gate.jpg)')[0] as Extract<Block, { kind: 'paragraph' }>;
    const img = para.content.find((n) => n.kind === 'image') as Extract<Inline, { kind: 'image' }>;
    expect(img, 'a picture was left as text').toBeTruthy();
    expect(img.src).toBe('https://cdn.example.com/gate.jpg');
    expect(img.alt).toBe('The gate');
  });

  it('is not mistaken for the link it is spelled like', () => {
    const para = parseMarkdown('[The gate](https://example.com/gate)')[0] as Extract<Block, { kind: 'paragraph' }>;
    expect(para.content.some((n) => n.kind === 'image'), 'a link was read as a picture').toBe(false);
    expect(para.content.some((n) => n.kind === 'link'), 'the link stopped being one').toBe(true);
  });

  it('reads plainly as what it was called', () => {
    // A preview and a search have no use for the URL and every use for the words.
    const plain = plainText('Before ![the gate](https://cdn.example.com/g.jpg) after');
    expect(plain).toBe('Before the gate after');
    expect(plain, 'the address leaked into the preview').not.toContain('http');
  });

  it('refuses a src that is not a picture request', () => {
    /*
     * Narrower than a link on purpose. A link may be a mailto or a telephone
     * number, and a src is a request the browser makes ON ITS OWN, before
     * anybody chooses to follow it.
     */
    expect(safeImageSrc('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(safeImageSrc('/uploads/a.jpg'), 'a picture served by this app was refused').toBe('/uploads/a.jpg');

    for (const bad of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', 'mailto:a@b.c', 'tel:123', 'file:///etc/passwd']) {
      expect(safeImageSrc(bad), `${bad} was allowed as a picture`).toBeNull();
    }
  });

  it('leaves the words alone when the src is refused', () => {
    // The person still wrote something; refusing the address must not eat it.
    expect(plainText('![the gate](javascript:alert(1))')).toContain('the gate');
  });

  it('a note written before pictures existed still reads the same', () => {
    // The bang is only special immediately before a bracket.
    const body = 'Ring the framer! Ask about 20x30.';
    expect(plainText(body)).toBe(body);
  });
});
