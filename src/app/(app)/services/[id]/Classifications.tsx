import Link from 'next/link';

type Value = { id: string; name: string };
type Tag = { id: string; name: string; position?: number; values: Value[] };

/**
 * What a service is classified as.
 *
 * WHY THIS IS NOT A ROW OF TAGS. It was drawn as a grid of panels with the
 * dimension's name set in the label style and its values as small grey mono
 * badges — the styling this system uses for a status or a count. That reads as
 * metadata the studio scribbled on the back of a service, and puts the emphasis
 * on the wrong half: the dimension is the question, and the VALUES are the
 * answers a client actually meets.
 *
 * They are not internal. Every value is a filter on the storefront, and on the
 * custom enquiry path they are the words a client picks to say what they want.
 * Maternity is a door someone walks through to find this studio.
 *
 * So the hierarchy is inverted. The dimension becomes a quiet label above, and
 * the values carry the weight — larger, on paper rather than in a grey pill,
 * lifting under a pointer because each is a link to every service classified
 * the same way.
 *
 * Ordered by the dimension's own position, which is the order the studio set and
 * can change.
 */
export function Classifications({ tags }: { tags: Tag[] }) {
  const ordered = [...tags].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return (
    <div className="q-card q-section">
      <h2 className="q-section-title">Classifications</h2>

      {ordered.length === 0 ? (
        <p className="q-empty">
          Not classified yet. Clients narrow the storefront by these, so until there are some, this
          service cannot be found by anyone looking for the kind of work it is.
        </p>
      ) : (
        <>
          <p className="q-meta" style={{ marginBottom: '20px' }}>
            How clients find this. Each is a filter on your storefront, and one of the words a client
            can pick when describing what they want.
          </p>

          <div className="q-stack q-stack-lg">
            {ordered.map((d) => (
              <div key={d.id} className="q-stack q-stack-sm">
                <span className="q-eyebrow">{d.name}</span>
                <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  {d.values.map((v) => (
                    <Link
                      key={v.id}
                      href={`/services/classifications/${encodeURIComponent(v.id)}`}
                      className="q-value"
                      title={`Every service classified ${d.name}: ${v.name}`}
                    >
                      {v.name}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
