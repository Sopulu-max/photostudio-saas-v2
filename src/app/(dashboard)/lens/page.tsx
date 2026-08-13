import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listValueEntries } from '@/modules/services/interface';
import type { ValueEntry } from '@/modules/services/interface';
import { Aperture } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * Every way into the studio's own work.
 *
 * The rest of the app enters from the thing — a service, a package, a booking.
 * This enters from the classification: pick Birthday and see what this studio
 * does for birthdays. Nothing here is stored for it. Each entry point is a
 * dimension value that already exists because some service was tagged with it,
 * read from the other end.
 *
 * The count is the honest signal. A value nothing carries is vocabulary the
 * studio wrote down and never used, and saying so is more useful than hiding it.
 */
export default async function LensIndexPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const entries = await listValueEntries();

  // Domain → dimension → values, which is the shape the graph already has.
  const byDomain = new Map<string, Map<string, ValueEntry[]>>();
  for (const e of entries) {
    const domain = e.domainName || 'Unfiled';
    if (!byDomain.has(domain)) byDomain.set(domain, new Map());
    const dims = byDomain.get(domain)!;
    if (!dims.has(e.dimensionName)) dims.set(e.dimensionName, []);
    dims.get(e.dimensionName)!.push(e);
  }

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Lens</h1>
          <p className="q-page-subtitle">
            Look at what you do from any angle you classify by — and leave with a package, or a new service.
          </p>
        </div>
      </header>

      {entries.length === 0 ? (
        <div className="q-card q-empty-lg q-stack">
          <div className="q-empty-icon"><Aperture size={24} /></div>
          <h3 className="q-section-title">Nothing to look through yet</h3>
          <p className="q-meta">
            A lens is a value one of your services is filed under. Define how a domain classifies its
            work, tag a service with it, and it becomes a way in.
          </p>
          <Link href="/services/settings" className="q-btn q-btn-primary">Set up how you classify</Link>
        </div>
      ) : (
        <div className="q-stack q-stack-lg">
          {[...byDomain.entries()].map(([domain, dims]) => (
            <section key={domain}>
              <h2 className="q-section-title">{domain}</h2>
              <div className="q-stack q-stack-md" style={{ marginTop: '12px' }}>
                {[...dims.entries()].map(([dimension, values]) => (
                  <div key={dimension} className="q-tile q-stack q-stack-sm">
                    <strong className="q-strong">{dimension}</strong>
                    <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                      {values.map((v) => (
                        <Link
                          key={v.id}
                          href={`/lens/${v.id}`}
                          className={`q-badge ${v.services > 0 ? 'q-badge-success' : 'q-badge-neutral'}`}
                          title={v.services > 0
                            ? `${v.services} service${v.services === 1 ? '' : 's'} filed under ${v.name}`
                            : `Nothing filed under ${v.name} yet`}
                        >
                          {v.name}
                          {v.services > 0 && <span style={{ marginLeft: '6px', opacity: 0.7 }}>{v.services}</span>}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
