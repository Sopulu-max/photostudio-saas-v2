import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  listServices, listBlueprints,
  listServiceDomains, createServiceDomain, renameServiceDomain, deleteServiceDomain,
  listDeliverables, createDeliverable, renameDeliverable, deleteDeliverable,
  listDeliveryContainers, createDeliveryContainer, renameDeliveryContainer, deleteDeliveryContainer,
  getEnabledDimensions,
  listOccasions, createOccasion, renameOccasion, deleteOccasion,
  listContexts, createContext, renameContext, deleteContext,
  listSubjects, createSubject, renameSubject, deleteSubject,
  listPurposes, createPurpose, renamePurpose, deletePurpose,
  listClientTypes, createClientType, renameClientType, deleteClientType,
} from '@/modules/services/interface';
import { listRoles } from '@/modules/team/interface';
import { FacetManager } from '@/components/FacetManager';
import { NewBlueprintForm } from '../NewBlueprintForm';
import { BlueprintRow } from '../BlueprintRow';
import { DimensionChooser } from '../DimensionChooser';
import { DomainManager } from './DomainManager';

export const dynamic = 'force-dynamic';

/**
 * Services' own settings — the ontology layer's configuration. Domains and
 * Deliverables are studio-editable vocabulary; Blueprints are the Processes
 * a Service runs. The five classification dimensions (Subject, Occasion,
 * Context, Purpose, Client) live here too — they apply to both Service and
 * Package, and Services is the layer both depend on. Category and pricing
 * stay in Packages' own settings — those describe how something's sold, not
 * what it is.
 */
export default async function ServiceSettingsPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [services, blueprints, domains, deliverables, containers, roles, enabledDimensions, occasions, contexts, subjects, purposes, clientTypes] = await Promise.all([
    listServices(), listBlueprints(), listServiceDomains(), listDeliverables(), listDeliveryContainers(), listRoles(),
    getEnabledDimensions(), listOccasions(), listContexts(), listSubjects(), listPurposes(), listClientTypes(),
  ]);
  const roleOptions = (roles as any[]).map((r) => r.name);

  const domainCounts: Record<string, number> = {};
  for (const s of services as any[]) {
    if (s.service_domain_id) domainCounts[s.service_domain_id] = (domainCounts[s.service_domain_id] || 0) + 1;
  }

  const countBy = (key: 'occasion' | 'context' | 'subject' | 'purpose' | 'client_type') => {
    const counts: Record<string, number> = {};
    for (const s of services as any[]) {
      const id = s[key]?.id;
      if (id) counts[id] = (counts[id] || 0) + 1;
    }
    return counts;
  };


  return (
    <div className="q-page-narrow">
      <Link href="/services" className="q-back">&larr; Back to Services</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Service settings</h1>
          <p className="q-page-subtitle">The vocabulary this studio&rsquo;s services are built from.</p>
        </div>
      </header>

      <div className="q-stack q-stack-lg">
        <section className="q-card q-section">
          <h2 className="q-section-title">Which dimensions do you organize by?</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            Fashion Photography and Birthday Photography don&rsquo;t answer the same question — one&rsquo;s a subject, one&rsquo;s an
            occasion. Turn on whichever of these actually matter to how you think about what you do. Applies to both Services and
            the Packages you sell them in.
          </p>
          <DimensionChooser enabled={enabledDimensions} />
        </section>

        <section className="q-card q-section">
          <h2 className="q-section-title">Service Domains</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>The broad capabilities this studio offers — Photography, Videography, Printing.</p>
          <DomainManager
            domains={domains} counts={domainCounts}
            onCreate={createServiceDomain} onDelete={deleteServiceDomain}
          />
        </section>

        <section className="q-card q-section">
          <h2 className="q-section-title">Output Types (Assets)</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>What a service can directly produce — RAW images, edited video, a 3D model.</p>
          <FacetManager
            facets={deliverables} counts={{}} noun="service" placeholder="e.g. Edited photographs"
            onCreate={createDeliverable} onRename={renameDeliverable} onDelete={deleteDeliverable}
          />
        </section>

        <section className="q-card q-section">
          <h2 className="q-section-title">Delivery Containers</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>How deliverables are handed to the client — Online Gallery, USB Drive, Photobook.</p>
          <FacetManager
            facets={containers} counts={{}} noun="package" placeholder="e.g. Online Gallery"
            onCreate={createDeliveryContainer} onRename={renameDeliveryContainer} onDelete={deleteDeliveryContainer}
          />
        </section>

        {enabledDimensions.includes('subject') && (
          <section className="q-card q-section">
            <h2 className="q-section-title">Subject</h2>
            <p className="q-meta" style={{ marginBottom: '16px' }}>What is being photographed — Person, Product, Building, Real Estate.</p>
            <FacetManager facets={subjects} counts={countBy('subject')} noun="service" placeholder="e.g. Real Estate"
              onCreate={createSubject} onRename={renameSubject} onDelete={deleteSubject} countDim="subject" />
          </section>
        )}

        {enabledDimensions.includes('occasion') && (
          <section className="q-card q-section">
            <h2 className="q-section-title">Occasion</h2>
            <p className="q-meta" style={{ marginBottom: '16px' }}>Wedding, birthday, none in particular.</p>
            <FacetManager facets={occasions} counts={countBy('occasion')} noun="service" placeholder="e.g. Anniversary"
              onCreate={createOccasion} onRename={renameOccasion} onDelete={deleteOccasion} countDim="occasion" />
          </section>
        )}

        {enabledDimensions.includes('context') && (
          <section className="q-card q-section">
            <h2 className="q-section-title">Context</h2>
            <p className="q-meta" style={{ marginBottom: '16px' }}>Where and under what conditions — In-studio, Outdoor, On-location.</p>
            <FacetManager facets={contexts} counts={countBy('context')} noun="service" placeholder="e.g. On-location"
              onCreate={createContext} onRename={renameContext} onDelete={deleteContext} countDim="context" />
          </section>
        )}

        {enabledDimensions.includes('purpose') && (
          <section className="q-card q-section">
            <h2 className="q-section-title">Purpose</h2>
            <p className="q-meta" style={{ marginBottom: '16px' }}>What it&rsquo;s for — Passport, Advertising, Editorial.</p>
            <FacetManager facets={purposes} counts={countBy('purpose')} noun="service" placeholder="e.g. Editorial"
              onCreate={createPurpose} onRename={renamePurpose} onDelete={deletePurpose} countDim="purpose" />
          </section>
        )}

        {enabledDimensions.includes('client') && (
          <section className="q-card q-section">
            <h2 className="q-section-title">Client</h2>
            <p className="q-meta" style={{ marginBottom: '16px' }}>Who&rsquo;s buying — Individual, Family, Corporate.</p>
            <FacetManager facets={clientTypes} counts={countBy('client_type')} noun="service" placeholder="e.g. Corporate"
              onCreate={createClientType} onRename={renameClientType} onDelete={deleteClientType} countDim="client" />
          </section>
        )}

        <section className="q-card q-section">
          <h2 className="q-section-title">Blueprints</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>A Service&rsquo;s Process — the stages it runs through, each optionally routed to a role.</p>
          {blueprints.length === 0 ? (
            <p className="q-empty">No blueprints yet.</p>
          ) : (
            <div className="q-stack q-stack-sm" style={{ marginBottom: '16px' }}>
              {blueprints.map((bp: any) => <BlueprintRow key={bp.id} blueprint={bp} roleOptions={roleOptions} />)}
            </div>
          )}
          <NewBlueprintForm roleOptions={roleOptions} />
        </section>
      </div>
    </div>
  );
}
