import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  listServices, listDimensionsByDomain,
  buildDimensionSuggestions, buildDeliverableSuggestions,
  listServiceDomains, createServiceDomain, renameServiceDomain, deleteServiceDomain,
} from '@/modules/services/interface';
import { listRoles } from '@/modules/team/interface';
import { FacetManager } from '@/components/FacetManager';
import { DimensionManager } from './DimensionManager';
import { OutputTypeManager } from './OutputTypeManager';
import { DomainManager } from './DomainManager';
import { WorkflowManager } from './WorkflowManager';
import { listWorkflowsByDomain, saveWorkflow, deleteWorkflow } from '@/modules/services/interface';

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

  const [services, domains, roles, dimensionsByDomain, workflowsByDomain] = await Promise.all([
    listServices(), listServiceDomains(), listRoles(),
    listDimensionsByDomain(), listWorkflowsByDomain(),
  ]);

  // The same knowledge the service form narrows with. Defining the vocabulary
  // and using it are the same act seen from two ends, so they draw on one source.
  const dimensionSuggestions = buildDimensionSuggestions(services as any);
  const deliverableSuggestions = buildDeliverableSuggestions(services as any);

  // Questions worth offering when inventing one: what this studio's other
  // domains already ask. Printing could classify by Style because Photography
  // does — that is the studio teaching itself, not the engine prescribing.
  const questionNames = [...new Set(
    Object.values(dimensionsByDomain).flat().map((d: any) => d.name)
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
          <h2 className="q-section-title">Classifications</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            How each domain categorises its work. A classification is a question — &ldquo;What occasion is
            it for?&rdquo; — and its values are the permitted answers. Services in that domain are
            classified against them, which drives filtering and reporting.
          </p>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            Those listed below are supplied as defaults. Rename them, disable any you do not use, or add
            your own. Each belongs to a single domain, so Photography can classify by Style without
            affecting Printing.
          </p>
          <DimensionManager
            domains={domains.map((d: any) => ({ id: d.id, name: d.name }))}
            suggestions={dimensionSuggestions}
            questionNames={questionNames}
          />
        </section>

        <section className="q-card q-section">
          <h2 className="q-section-title">Workflows</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            The standard production workflows defined for each domain. These are available as templates when creating a service.
          </p>
          <WorkflowManager
            domains={domains}
            workflowsByDomain={workflowsByDomain}
            roleOptions={roleOptions}
            onSave={saveWorkflow}
            onDelete={deleteWorkflow}
          />
        </section>

        <section className="q-card q-section">
          <h2 className="q-section-title">Output types</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            The types of output a service produces — RAW images, edited video, a bound album. Like
            classifications, these belong to a domain. Quantities, sizes and specifications are set on a
            package, not here.
          </p>
          <OutputTypeManager
            domains={domains.map((d: any) => ({ id: d.id, name: d.name }))}
            suggestions={deliverableSuggestions}
          />
        </section>

        
      </div>
    </div>
  );
}
