'use client';

import React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { parseMarkdown, type Block, type Inline, type Align } from '@/kernel/markdown';

/**
 * A note, shown rather than edited.
 *
 * REACT ELEMENTS, NEVER AN HTML STRING. The parser hands back a tree and this
 * turns it into elements, so there is no markup to sanitise and no reason for
 * this app to own a `dangerouslySetInnerHTML`. It has exactly one, in
 * `layout.tsx`, for the script that resolves the theme before first paint —
 * and this is not going to be the second.
 *
 * A TICK IS AN EDIT. Passing `onToggleTask` makes the boxes real: clicking one
 * rewrites that line of the body and saves it the same way typing does. Without
 * it the boxes still show their state but cannot be pressed, which is right
 * wherever the note is being read rather than worked on.
 */
export function Markdown({
  text,
  onToggleTask,
  className,
}: {
  text: string;
  onToggleTask?: (line: number) => void;
  className?: string;
}) {
  const blocks = React.useMemo(() => parseMarkdown(text), [text]);
  if (blocks.length === 0) return null;

  return (
    <div className={className ? `q-prose ${className}` : 'q-prose'}>
      <Blocks blocks={blocks} onToggleTask={onToggleTask} />
    </div>
  );
}

function Blocks({
  blocks,
  onToggleTask,
}: {
  blocks: Block[];
  onToggleTask?: (line: number) => void;
}) {
  return (
    <>
      {blocks.map((block, i) => (
        <One key={i} block={block} onToggleTask={onToggleTask} />
      ))}
    </>
  );
}

const ALIGN: Record<Align, string> = {
  left: 'q-md-left',
  center: 'q-md-center',
  right: 'q-md-right',
};

function One({ block, onToggleTask }: { block: Block; onToggleTask?: (line: number) => void }) {
  switch (block.kind) {
    case 'paragraph':
      return <p><Inlines nodes={block.content} /></p>;

    case 'heading': {
      const content = <Inlines nodes={block.content} />;
      if (block.level === 1) return <h3 className="q-md-h1">{content}</h3>;
      if (block.level === 2) return <h4 className="q-md-h2">{content}</h4>;
      return <h5 className="q-md-h3">{content}</h5>;
    }

    /*
     * A note's headings render as h3/h4/h5 rather than h1/h2/h3. The page
     * already has an h1 and the section that holds the note has its own
     * heading; a note that outranked them would leave a screen reader's
     * outline claiming the note is the page.
     */

    case 'rule':
      return <hr className="q-md-rule" />;

    case 'quote':
      return (
        <blockquote className="q-md-quote">
          <Blocks blocks={block.blocks} onToggleTask={onToggleTask} />
        </blockquote>
      );

    case 'code':
      return (
        <pre className="q-md-pre"><code>{block.text}</code></pre>
      );

    case 'list': {
      // A list of boxes is a checklist and loses its bullets to them.
      const tasks = block.items.some((i) => i.checked !== null);
      const items = block.items.map((item, i) => (
        <li key={i} className={item.checked !== null ? 'q-md-task' : undefined}>
          {item.checked !== null && (
            <Box checked={item.checked} line={item.line} onToggleTask={onToggleTask} />
          )}
          <span className={item.checked ? 'q-md-done' : undefined}>
            <Inlines nodes={item.content} />
          </span>
          {item.children.length > 0 && (
            <Blocks blocks={item.children} onToggleTask={onToggleTask} />
          )}
        </li>
      ));

      if (block.ordered) {
        return <ol className="q-md-ol" start={block.start}>{items}</ol>;
      }
      return <ul className={tasks ? 'q-md-ul q-md-tasks' : 'q-md-ul'}>{items}</ul>;
    }

    case 'table':
      return (
        <div className="q-table-container q-md-table">
          <table className="q-table">
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th key={i} className={`q-table-th ${ALIGN[block.align[i] ?? 'left']}`}>
                    <Inlines nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="q-table-tr">
                  {row.map((cell, c) => (
                    <td key={c} className={`q-table-td ${ALIGN[block.align[c] ?? 'left']}`}>
                      <Inlines nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/**
 * The box itself.
 *
 * A real button when it can be pressed, and a plain marker when it cannot —
 * rather than a disabled button, which looks like something broken instead of
 * like a note being read.
 */
function Box({
  checked,
  line,
  onToggleTask,
}: {
  checked: boolean;
  line: number;
  onToggleTask?: (line: number) => void;
}) {
  const face = checked ? <Check size={12} strokeWidth={3} /> : null;
  const cls = checked ? 'q-md-box q-md-box-on' : 'q-md-box';

  if (!onToggleTask) {
    return (
      <span className={cls} role="img" aria-label={checked ? 'Done' : 'Not done'}>
        {face}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={cls}
      role="checkbox"
      aria-checked={checked}
      onClick={() => onToggleTask(line)}
    >
      {face}
    </button>
  );
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.kind) {
          case 'text': return <React.Fragment key={i}>{node.text}</React.Fragment>;
          case 'break': return <br key={i} />;
          case 'code': return <code key={i} className="q-md-code">{node.text}</code>;
          case 'strong': return <strong key={i}><Inlines nodes={node.children} /></strong>;
          case 'em': return <em key={i}><Inlines nodes={node.children} /></em>;
          case 'strike': return <del key={i}><Inlines nodes={node.children} /></del>;
          case 'mark': return <mark key={i} className="q-md-mark"><Inlines nodes={node.children} /></mark>;
          case 'link': return <Anchor key={i} href={node.href}>{<Inlines nodes={node.children} />}</Anchor>;
        }
      })}
    </>
  );
}

/**
 * A link out, and a link back in.
 *
 * A note pointing at a booking is worth keeping on the client router — that is
 * the app talking to itself. Anything leaving opens elsewhere and carries
 * `noreferrer`, because where a studio's notes point is nobody else's business.
 */
function Anchor({ href, children }: { href: string; children: React.ReactNode }) {
  const internal = href.startsWith('/') || href.startsWith('#');
  if (internal) {
    return <Link href={href} className="q-link">{children}</Link>;
  }
  return (
    <a href={href} className="q-link" target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

/**
 * How much of a note's checklist is done.
 *
 * Shown on the card in the list and beside the editor's saved line. A note that
 * is half a checklist is a different thing to read than one that is finished,
 * and opening it to find out is the work the list is there to save.
 */
export function TaskProgress({ done, total }: { done: number; total: number }) {
  const complete = done === total;
  return (
    <span
      className={complete ? 'q-md-progress q-md-progress-done' : 'q-md-progress'}
      title={`${done} of ${total} done`}
    >
      <span className="q-md-progress-bar">
        <span
          className="q-md-progress-fill"
          /* The one measurement that cannot be a class: it is the data. */
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </span>
      {done}/{total}
    </span>
  );
}
