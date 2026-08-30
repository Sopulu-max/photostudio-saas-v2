import Link from 'next/link';

type Value = { id: string; name: string };
type Tag = { id: string; name: string; position?: number; values: Value[] };
type BundledService = { id: string; name: string; dimensions?: Tag[]; narrowedTo?: Tag[] };

/**
 * How one bundled service is classified within this package.
 *
 * WHY THIS IS NOT A GRID OF PANELS. It was drawn exactly the way the service
 * page was before it was fixed: the dimension's name in the label style, its
 * values as small grey badges — the styling this system uses for a status or a
 * count. That reads as metadata scribbled on the back of a package, and puts
 * the weight on the wrong half. The dimension is the question; the VALUES are
 * the answers, and the answers are what a client actually meets.
 *
 * They are not internal. Every value is a filter on the storefront and one of
 * the words a client picks to describe what they want, so Maternity is a door
 * someone walks through to find this studio. The hierarchy is inverted for that
 * reason: the dimension becomes a quiet label above, and the values carry the
 * weight and link to everything classified the same way.
 *
 * INHERITED CLASSIFICATION IS SHOWN, which is the substantive fix rather than
 * the visual one. A package that narrows nothing is classified exactly as the
 * services it bundles are — that is the rule the editor states and the rule the
 * storefront filters by. The page read only the narrowings, so a package that
 * had never narrowed anything reported that it had no classifications at all
 * while the storefront was busy filing it under every one of them.
 *
 * It takes one service rather than the bundle because the page is now grouped
 * by service: everything a package says, it says about one of the services in
 * it, so that is the unit both pages are built from.
 */
export function ClassificationsFor({ service }: { service: BundledService }) {
  const narrowed = service.narrowedTo || [];
  const inherited = narrowed.length === 0;
  const tags = [...(inherited ? (service.dimensions || []) : narrowed)]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  if (tags.length === 0) {
    return (
      <p className="q-text-meta">
        Not classified. Clients narrow the storefront by these, so this package cannot be found by
        anyone looking for the kind of work it is.
      </p>
    );
  }

  return (
    <div className="q-stack q-stack-md">
      {inherited && (
        // Said plainly rather than left to be inferred: this package narrowed
        // nothing, so it stands where the service stands and moves if it does.
        <span className="q-meta-sm">
          As {service.name} is classified — this package narrows nothing of its own.
        </span>
      )}
      {tags.map((d) => (
        <div key={d.id} className="q-stack q-stack-sm">
          <span className="q-eyebrow">{d.name}</span>
          <div className="q-row q-row-sm">
            {d.values.map((v) => (
              <Link
                key={v.id}
                href={`/services/classifications/${encodeURIComponent(v.id)}`}
                className="q-value"
                title={`Everything classified ${d.name}: ${v.name}`}
              >
                {v.name}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
