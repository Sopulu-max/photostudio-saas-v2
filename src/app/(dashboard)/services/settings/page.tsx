import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  listCategories,
  listServices,
  listBlueprints,
  getServiceDefaults,
} from '@/modules/services/interface';
import { CategoryManager } from '../CategoryManager';
import { NewBlueprintForm } from '../NewBlueprintForm';
import { BlueprintRow } from '../BlueprintRow';
import { DefaultsForm } from './DefaultsForm';

export const dynamic = 'force-dynamic';

/**
 * Services' own settings — the module owns its configuration, so groups,
 * blueprints and defaults sit with the thing they affect rather than in global
 * Settings. The catalogue page is left to be a catalogue.
 */
export default async function ServiceSettingsPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [categories, services, blueprints, defaults] = await Promise.all([
    listCategories(), listServices(), listBlueprints(), getServiceDefaults(),
  ]);

  const counts: Record<string, number> = {};
  for (const s of services as any[]) {
    if (s.category_id) counts[s.category_id] = (counts[s.category_id] || 0) + 1;
  }

  return (
    <div className="q-page-narrow">
      <Link href="/services" className="q-back">&larr; Back to Services</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Service settings</h1>
          <p className="q-page-subtitle">How your catalogue is organised, and what it starts from.</p>
        </div>
      </header>

      <div className="q-stack q-stack-lg">

        <section className="q-card q-section">
          <h2 className="q-section-title">Groups</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            How your catalogue is arranged. Nothing in the system reads these — they&rsquo;re for you.
          </p>
          <CategoryManager categories={categories} counts={counts} />
        </section>

        <section className="q-card q-section">
          <h2 className="q-section-title">Blueprints</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            Reusable stage sets. Attach one to a service and its work starts from those stages.
          </p>
          {blueprints.length === 0 ? (
            <p className="q-empty">No blueprints yet.</p>
          ) : (
            <div className="q-stack q-stack-sm" style={{ marginBottom: '16px' }}>
              {blueprints.map((bp: any) => <BlueprintRow key={bp.id} blueprint={bp} />)}
            </div>
          )}
          <NewBlueprintForm />
        </section>

        <section className="q-card q-section">
          <h2 className="q-section-title">Defaults</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            What a new service starts with. You can change it per service afterwards.
          </p>
          <DefaultsForm depositPercentage={defaults.depositPercentage} />
        </section>

      </div>
    </div>
  );
}
