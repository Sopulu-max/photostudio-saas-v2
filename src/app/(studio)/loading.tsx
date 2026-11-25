/**
 * What a studio sees while a page is being read.
 *
 * Not a spinner. A spinner says something is happening somewhere; this says
 * what is coming, in the shape it will arrive in and in the place it will
 * arrive — a title, a line under it, then rows. When the real page lands it
 * occupies the same space, so nothing jumps.
 *
 * It renders inside the shell rather than instead of it, which is the whole
 * reason the sidebar moved into a layout. The chrome stays put; only this
 * region changes.
 *
 * Deliberately generic. A per-page skeleton that drifts from its page is a
 * lie about what is coming, and ten of them would drift. The parts every
 * studio page shares — a title, a subtitle, a stack of rows — are the parts
 * worth standing in for.
 */
export default function Loading() {
  return (
    <div className="q-page" aria-busy="true" aria-live="polite">
      <span className="q-sr">Loading</span>

      <header className="q-page-header">
        <div className="q-stack q-stack-sm">
          <span className="q-bone q-bone-title" />
          <span className="q-bone q-bone-line" />
        </div>
      </header>

      <div className="q-stack q-stack-sm">
        {[0, 1, 2, 3].map((row) => (
          <span key={row} className="q-bone q-bone-row" />
        ))}
      </div>
    </div>
  );
}
