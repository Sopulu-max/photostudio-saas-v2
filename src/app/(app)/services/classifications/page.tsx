import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listValueEntries } from '@/modules/services/interface';
import type { ValueEntry } from '@/modules/services/interface';
import { Aperture } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * The studio's work, read by how it is classified.
 *
 * A VIEW OF SERVICES, NOT A PLACE OF ITS OWN. This was a top-level "Lens"
 * beside Services and Packages, which put a way of LOOKING among the things a
 * studio owns and implied it stored something. It never did: every answer is
 * the edge `service ↔ dimension value` read from the other end. Forward, that
 * edge narrows the service form — choose Photography, get Photography's
 * questions. Backward, it answers what this studio actually does for Birthdays.
 * Same rows, no second table, so it belongs inside Services with the
 * classifications it reads.
 *
 * THE SHAPE IS THE ONTOLOGY'S. Domain → classification → value, because that is
 * how the graph is built: a value belongs to exactly one classification of
 * exactly one domain. Showing it any other way would flatten a hierarchy the
 * database keeps.
 *
 * The count is the honest signal. A value nothing carries is vocabulary the
 * studio wrote down and never used, and saying so is more useful than hiding it.
 */
export default async function ClassificationsPage() {
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
      <Link href="/services" className="q-back">&larr; Services</Link>

      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">By classification</h1>
          <p className="q-page-subtitle">
            The same services and packages, entered from how they are classified rather than from what
            they are. Nothing is stored for this view — every value below is one a service already carries.
          </p>
        </div>
      </header>

      {entries.length === 0 ? (
        <div className="q-card q-empty-lg q-stack">
          <div className="q-empty-icon"><Aperture size={24} /></div>
          <h3 className="q-section-title">No classifications yet</h3>
          <p className="q-meta">
            Each entry below is a classification value applied to one of your services. Define how a
            domain classifies its work, then apply those values to a service.
          </p>
          <Link href="/services/settings" className="q-btn q-btn-primary">Configure classifications</Link>
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
                          href={`/services/classifications/${v.id}`}
                          className={`q-badge ${v.servicesIncludingNarrower > 0 ? 'q-badge-success' : 'q-badge-neutral'}`}
                          title={
                            v.servicesIncludingNarrower === 0
                              ? `No services classified as ${v.name}`
                              : v.servicesIncludingNarrower === v.services
                                ? `${v.services} service${v.services === 1 ? '' : 's'} classified as ${v.name}`
                                : `${v.services} classified as ${v.name}, ${v.servicesIncludingNarrower} including narrower values`
                          }
                        >
                          {/* A value nested inside another is shown as such, so
                              the list reads as the tree the studio built. */}
                          {v.parentId && <span style={{ opacity: 0.5, marginRight: '4px' }}>↳</span>}
                          {v.name}
                          {v.servicesIncludingNarrower > 0 && (
                            <span style={{ marginLeft: '6px', opacity: 0.7 }}>{v.servicesIncludingNarrower}</span>
                          )}
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
