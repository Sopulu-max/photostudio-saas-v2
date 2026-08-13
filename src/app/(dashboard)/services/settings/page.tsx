import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  listServices, listBlueprints, listDimensionsByDomain,
  buildDimensionSuggestions, buildDeliverableSuggestions,
  listServiceDomains, createServiceDomain, renameServiceDomain, deleteServiceDomain,
  listDeliveryContainers, createDeliveryContainer, renameDeliveryContainer, deleteDeliveryContainer,
} from '@/modules/services/interface';
import { listRoles } from '@/modules/team/interface';
import { FacetManager } from '@/components/FacetManager';
import { NewBlueprintForm } from '../NewBlueprintForm';
import { BlueprintRow } from '../BlueprintRow';
import { DimensionManager } from './DimensionManager';
import { OutputTypeManager } from './OutputTypeManager';
import { DomainManager } from './DomainManager';

export const dynamic = 'force-dynamic';

/**
 * Services' own settings — the ontology layer's configuration. Domains and
 * Deliverables are studio-editable vocabulary; Blueprints are the Processes
 * a Service runs. How each domain classifies its work lives here too — it
 * applies to both Service and Package, and Services is the layer both depend
 * on. Category and pricing stay in Packages' own settings — those describe how
 * something's sold, not what it is.
 */
export default async function ServiceSettingsPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [services, blueprints, domains, containers, roles, dimensionsByDomain] = await Promise.all([
    listServices(), listBlueprints(), listServiceDomains(), listDeliveryContainers(), listRoles(),
    listDimensionsByDomain(),
  ]);

  // The same knowledge the service form narrows with. Defining the vocabulary
  // and using it are the same act seen from two ends, so they draw on one source.
  const dimensionSuggestions = buildDimensionSuggestions(services as any);
  const deliverableSuggestions = buildDeliverableSuggestions(services as any);

  // Questions worth offering when inventing one: what this studio's other
  // domains already ask. Printing could classify by Style because Photography
  // does — that is the studio teaching itself, not the engine prescribing.
  const questionNames = [...new Set(
    Object.values(dimensionsByDomain).flat().map((d) => d.name)
  )].sort();
  const roleOptions = (roles as any[]).map((r) => r.name);

  const domainCounts: Record<string, number> = {};
  for (const s of services as any[]) {
    if (s.service_domain_id) domainCounts[s.service_domain_id] = (domainCounts[s.service_domain_id] || 0) + 1;
  }



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
        {/* First, because it is the first thing defined: everything else on
            this page and in the service form is chosen in relation to it. */}
        <section className="q-card q-section">
          <h2 className="q-section-title">Service Domains</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            The broad capabilities this studio offers — Photography, Videography, Printing. A service is
            defined in relation to one of these, and picking one is what shapes the rest of its form.
          </p>
          <DomainManager
            domains={domains} counts={domainCounts}
            onCreate={createServiceDomain} onDelete={deleteServiceDomain}
          />
        </section>

        <section className="q-card q-section">
          <h2 className="q-section-title">The questions you ask about your own work</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            Each one is a <strong>question</strong> — &ldquo;what occasion is it for?&rdquo; — and under it, the{' '}
            <strong>answers</strong> you actually use. Every service you define gets asked these, and
            everything you tag becomes a way to look at your work later.
          </p>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            The ones below came with the app. They are ordinary — rename them, switch off the ones you
            don&rsquo;t think in, add your own. Each belongs to a single domain, so Photography can ask
            about Style without Printing ever hearing about it.
          </p>
          <DimensionManager
            domains={domains.map((d: any) => ({ id: d.id, name: d.name }))}
            suggestions={dimensionSuggestions}
            questionNames={questionNames}
          />
        </section>

        <section className="q-card q-section">
          <h2 className="q-section-title">What each domain produces</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            The KINDS of thing a service can turn out — RAW images, edited video, a bound album. Like
            dimensions, these belong to a domain. How many, how big and to what spec is a package&rsquo;s
            business, so nothing here carries a quantity.
          </p>
          <OutputTypeManager
            domains={domains.map((d: any) => ({ id: d.id, name: d.name }))}
            suggestions={deliverableSuggestions}
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
