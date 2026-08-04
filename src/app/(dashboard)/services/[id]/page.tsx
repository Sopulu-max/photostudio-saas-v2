import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { listBlueprints, listCategories, getIntakeQuestions, getLockedQuestionIds, listServiceExtras } from '@/modules/services/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { ServiceEditor } from './ServiceEditor';
import { QuestionEditor } from './QuestionEditor';
import { ExtraEditor } from './ExtraEditor';

export const dynamic = 'force-dynamic';

export default async function ServiceDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let orgId: string;
  try {
    orgId = (await getAuthOrgId()).orgId;
  } catch {
    redirect('/login');
  }

  const { data: service } = await supabaseAdmin
    .from('services')
    .select('id, name, description, pricing, status, duration_minutes, price_unit, category_id, payment_policy, form_schema, default_blueprint_id')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single();

  if (!service) notFound();

  const [blueprints, categories, currencyCode, questions, lockedIds, extras] = await Promise.all([
    listBlueprints(),
    listCategories(),
    getStudioCurrency(),
    getIntakeQuestions(params.id),
    getLockedQuestionIds(params.id),
    listServiceExtras(params.id),
  ]);

  const pricing: any = service.pricing || {};
  const basePrice = Number(pricing.base_price || 0);
  const paymentPolicy = (service.payment_policy === 'full' ? 'full' : 'deposit') as 'deposit' | 'full';
  const depositPct = paymentPolicy === 'full' ? 100 : Number(pricing.deposit_percentage || 0);
  const depositAmount = (basePrice * depositPct) / 100;

  // How often this service has actually been sold — Bookings' side of the story.
  const { count: timesBooked } = await supabaseAdmin
    .from('booking_lines')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('service_id', service.id);


  return (
    <div className="q-page-narrow">
      <Link className="q-back" href="/services">&larr; Back to Services</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">{service.name}</h1>
          <p className="q-page-subtitle">What you sell, and what it costs.</p>
        </div>
        <span className={`q-badge ${service.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>
          {service.status}
        </span>
      </header>

      <div className="q-stack q-stack-lg">

        <div className="q-card q-section">
          <h2 className="q-section-title">At a glance</h2>
          <div className="q-grid-3">
            <div className="q-panel">
              <div className="q-stat-label">Price</div>
              <div className="q-stat-value">{formatMoney(basePrice, currencyCode)}</div>
            </div>
            <div className="q-panel">
              <div className="q-stat-label">Payment</div>
              <div className="q-stat-value">{paymentPolicy === 'full' ? 'Full price' : `${depositPct}% deposit`}</div>
              {depositPct > 0 && <span className="q-meta-sm">{formatMoney(depositAmount, currencyCode)} due to book</span>}
            </div>
            <div className="q-panel">
              <div className="q-stat-label">Times booked</div>
              <div className="q-stat-value q-num">{timesBooked || 0}</div>
            </div>
          </div>
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">Details</h2>
          <ServiceEditor
            serviceId={service.id}
            name={service.name}
            description={service.description}
            basePrice={basePrice}
            paymentPolicy={paymentPolicy}
            depositPercentage={depositPct}
            blueprintId={service.default_blueprint_id}
            durationMinutes={service.duration_minutes}
            priceUnit={service.price_unit}
            categoryId={service.category_id}
            categories={categories}
            status={service.status}
            currencyCode={currencyCode}
            blueprints={blueprints}
          />
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">Intake questions</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            What a client is asked when they book this online.
          </p>
          <QuestionEditor serviceId={service.id} questions={questions} lockedIds={lockedIds} />
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">Extras</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            Optional add-ons for this service. Picking one on a booking just adds a line.
          </p>
          <ExtraEditor serviceId={service.id} extras={extras} currencyCode={currencyCode} />
        </div>

      </div>
    </div>
  );
}
