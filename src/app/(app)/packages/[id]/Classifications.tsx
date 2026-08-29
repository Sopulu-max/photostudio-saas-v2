import Link from 'next/link';

type Value = { id: string; name: string };
type Tag = { id: string; name: string; position?: number; values: Value[] };
type BundledService = { id: string; name: string; dimensions?: Tag[]; narrowedTo?: Tag[] };

/**
 * What a package is classified as.
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
 * storefront filters by. This page read only the narrowings, so a package that
 * had never narrowed anything reported "None of the bundled services have
 * classifications" while the storefront was busy filing it under all of them.
 *
 * Attribution to a service appears only where there is more than one to
 * attribute to. A package bundling a single service would otherwise print "For
 * Portrait Photography" under a heading that could not have meant anything else.
 */
export function Classifications({ services }: { services: BundledService[] }) {
  const ordered = (tags: Tag[]) => [...tags].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const readingFor = (s: BundledService) => {
    const narrowed = s.narrowedTo || [];
    return narrowed.length > 0
      ? { tags: ordered(narrowed), inherited: false }
      : { tags: ordered(s.dimensions || []), inherited: true };
  };

  const anywhere = services.some((s) => readingFor(s).tags.length > 0);

  return (
    <div className="q-card q-section">
      <h2 className="q-section-title">Classifications</h2>

      {services.length === 0 ? (
        <p className="q-text-meta">No services bundled.</p>
      ) : !anywhere ? (
        <p className="q-empty">
          Not classified yet. Clients narrow the storefront by these, so until there are some, this
          package cannot be found by anyone looking for the kind of work it is.
        </p>
      ) : (
        <>
          <p className="q-meta" style={{ marginBottom: '20px' }}>
            How clients find this. Each is a filter on your storefront, and one of the words a client
            can pick when describing what they want.
          </p>

          <div className="q-stack q-stack-lg">
            {services.map((s) => {
              const { tags, inherited } = readingFor(s);
              return (
                <div key={s.id} className="q-stack q-stack-md">
                  {services.length > 1 && (
                    <h3 className="q-strong">{s.name}</h3>
                  )}

                  {tags.length === 0 ? (
                    <p className="q-text-meta">Not classified.</p>
                  ) : (
                    <>
                      {inherited && (
                        // Said plainly rather than left to be inferred: this
                        // package narrowed nothing, so it stands where the
                        // service stands and will move if the service does.
                        <span className="q-meta-sm">As {s.name} is classified — this package narrows nothing of its own.</span>
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
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
