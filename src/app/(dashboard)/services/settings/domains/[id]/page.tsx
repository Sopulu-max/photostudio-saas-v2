import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  getServiceDomain,
  listDeliverables,
  listOccasions,
  listContexts,
  listSubjects,
  listPurposes,
  listClientTypes,
} from '@/modules/services/interface';
import { DomainDNAEditor } from './DomainDNAEditor';

export const dynamic = 'force-dynamic';

export default async function DomainDNAPage({ params }: { params: { id: string } }) {
  await getAuthOrgId();

  const [domain, deliverables, occasions, contexts, subjects, purposes, clientTypes] = await Promise.all([
    getServiceDomain(params.id),
    listDeliverables(),
    listOccasions(),
    listContexts(),
    listSubjects(),
    listPurposes(),
    listClientTypes(),
  ]);

  if (!domain) {
    notFound();
  }

  return (
    <div className="q-page-narrow">
      <Link href="/services/settings" className="q-back">&larr; Back to Service Settings</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">{domain.name} DNA</h1>
          <p className="q-page-subtitle">
            Configure the foundational rules for this Service Parent. Any services created under this domain will inherit these properties.
          </p>
        </div>
      </header>

      <DomainDNAEditor
        domain={domain}
        allDeliverables={deliverables}
        allOccasions={occasions}
        allContexts={contexts}
        allSubjects={subjects}
        allPurposes={purposes}
        allClientTypes={clientTypes}
      />
    </div>
  );
}
