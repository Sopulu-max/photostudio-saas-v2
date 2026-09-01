import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listValueEntries } from '@/modules/services/interface';
import { ClassificationIndex } from './ClassificationIndex';
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
  const unused = entries.filter((e) => e.servicesIncludingNarrower === 0).length;

  return (
    <div>
      <Link href="/services" className="q-back">&larr; Services</Link>

      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">By classification</h1>
          <p className="q-page-subtitle">
            The same services and packages, entered from how they are classified rather than from what
            they are. Nothing is stored for this view — every value below is one a service already carries.
            {/*
              * The one thing this page knows that no other page does.
              *
              * It could already tell which vocabulary nothing carries — it drew
              * those badges in a different colour — but it never said so, and a
              * fact worth colouring is a fact worth stating. A word written
              * down and never used is either work the studio is not describing
              * or a word it should drop.
              */}
            {unused > 0 && (
              <> {unused} of {entries.length} {unused === 1 ? 'is' : 'are'} not yet carried by any service.</>
            )}
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
        <ClassificationIndex entries={entries} />
      )}
    </div>
  );
}
