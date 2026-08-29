import Link from 'next/link';

type Value = { id: string; name: string };
type Tag = { id: string; name: string; position?: number; values: Value[] };

/**
 * What a service is classified as, and what that adds up to.
 *
 * WHY THIS IS NOT A LIST OF TAGS. Portrait Photography carries Subject: Person,
 * four Occasions and two Contexts. Read as tags that is seven labels and means
 * very little. Read as axes it is a SPACE — one subject by four occasions by
 * two contexts — and every point in it is a thing the studio can sell:
 * Studio Maternity Portrait, Outdoor Birthday Portrait, and six more.
 *
 * So the section shows the span rather than the labels, and each combination as
 * what it would be called. A studio does not need to invent package names; it
 * needs to see the ones its own vocabulary has already spelled out, and notice
 * which are not yet sold.
 *
 * NAME ORDER IS DIMENSION ORDER. "Studio Maternity Portrait" or "Maternity
 * Studio Portrait" is a real choice and not one this file should make. The
 * dimensions already carry a position the studio sets, so composing in that
 * order makes the ordering they can see and change the ordering that governs
 * the name. One fact doing two jobs, rather than a second setting for the same
 * decision.
 *
 * Only dimensions carrying MORE THAN ONE value multiply the space. A dimension
 * pinned to a single value is part of every name rather than a choice within
 * it, which is why Subject: Person reads as fixed here and Occasion does not.
 */

/** Every combination the axes describe, in dimension order. */
function combinationsOf(axes: Tag[]): Value[][] {
  return axes.reduce<Value[][]>(
    (acc, axis) => acc.flatMap((combo) => axis.values.map((v) => [...combo, v])),
    [[]],
  );
}

export function Classifications({
  tags,
  serviceName,
  soldNames,
}: {
  tags: Tag[];
  serviceName: string;
  /** Package names that already exist, so the list can say what is covered. */
  soldNames: string[];
}) {
  if (tags.length === 0) {
    return (
      <div className="q-card q-section">
        <h2 className="q-section-title">Classifications</h2>
        <p className="q-empty">
          Not classified yet, so it will not be found by anyone narrowing a search for it, and it
          spells out no package names of its own.
        </p>
      </div>
    );
  }

  const ordered = [...tags].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  // Fixed: one value, so it belongs to every name. Varying: more than one, so
  // it is a choice, and choices are what multiply.
  const fixed = ordered.filter((t) => t.values.length === 1);
  const varying = ordered.filter((t) => t.values.length > 1);

  /*
   * Composed from the axes that VARY, not from all of them.
   *
   * A dimension pinned to one value is true of every combination, so putting it
   * in the name says nothing and crowds out what does: "Person Anniversary
   * Outdoor Portrait Photography" against "Anniversary Outdoor Portrait
   * Photography". It is stated once underneath instead.
   */
  const combos = varying.length > 0 ? combinationsOf(varying) : [];
  const SHOWN = 12;

  const sold = new Set(soldNames.map((n) => n.trim().toLowerCase()));
  const nameFor = (combo: Value[]) => [...combo.map((v) => v.name), serviceName].join(' ');

  return (
    <div className="q-card q-section">
      <h2 className="q-section-title">Classifications</h2>

      <p className="q-meta" style={{ marginBottom: '16px' }}>
        {varying.length === 0
          ? `Classified on ${ordered.length} ${ordered.length === 1 ? 'axis' : 'axes'}, each fixed to one value.`
          : `${combos.length} combinations across ${ordered.length} ${ordered.length === 1 ? 'axis' : 'axes'}. Each is something this studio can sell.`}
      </p>

      {/* The axes themselves, in the order that governs a composed name. */}
      <div className="q-stack q-stack-sm" style={{ marginBottom: combos.length > 0 ? '24px' : 0 }}>
        {ordered.map((d) => (
          <div key={d.id} className="q-row q-row-between" style={{ alignItems: 'flex-start', gap: '16px' }}>
            <span className="q-row" style={{ gap: '8px', alignItems: 'baseline', minWidth: '140px' }}>
              <strong className="q-strong">{d.name}</strong>
              <span className="q-meta-sm">
                {d.values.length === 1 ? 'fixed' : `${d.values.length} values`}
              </span>
            </span>
            <span className="q-row" style={{ flexWrap: 'wrap', gap: '4px', justifyContent: 'flex-end', flex: 1 }}>
              {d.values.map((v) => (
                <Link
                  key={v.id}
                  href={`/services/classifications/${encodeURIComponent(v.id)}`}
                  className="q-badge q-badge-neutral"
                  title={`Every service classified ${d.name}: ${v.name}`}
                >
                  {v.name}
                </Link>
              ))}
            </span>
          </div>
        ))}
      </div>

      {combos.length > 0 && (
        <>
          <div className="q-stat-label" style={{ marginBottom: '8px' }}>What this spells out</div>
          <p className="q-meta-sm" style={{ marginBottom: '12px' }}>
            Named in the order the axes are listed above. Reorder them in{' '}
            <Link href="/services/settings" className="q-link">Services settings</Link> to change how
            these read.
          </p>

          <div className="q-stack" style={{ gap: '4px' }}>
            {combos.slice(0, SHOWN).map((combo, i) => {
              const name = nameFor(combo);
              const exists = sold.has(name.trim().toLowerCase());
              return (
                <div
                  key={i}
                  className="q-row q-row-between"
                  style={{ alignItems: 'center', padding: '6px 10px', borderRadius: '6px', background: 'var(--q-color-ink-50)' }}
                >
                  <span className="q-strong">{name}</span>
                  {exists ? (
                    <span className="q-meta-sm">Already sold</span>
                  ) : (
                    <Link
                      className="q-btn-ghost q-btn-xs"
                      href={`/packages/new?values=${combo.map((v) => v.id).join(',')}&name=${encodeURIComponent(name)}`}
                    >
                      Create package
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          {combos.length > SHOWN && (
            <p className="q-meta-sm" style={{ marginTop: '12px' }}>
              {combos.length - SHOWN} more. Narrowing an axis to fewer values, or fixing one,
              reduces this.
            </p>
          )}

          {fixed.length > 0 && (
            <p className="q-meta-sm" style={{ marginTop: '12px' }}>
              {fixed.map((d) => `${d.name}: ${d.values[0].name}`).join(' · ')} — true of all of
              these, so left out of the names.
            </p>
          )}
        </>
      )}
    </div>
  );
}
