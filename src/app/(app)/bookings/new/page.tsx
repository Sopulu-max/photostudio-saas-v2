import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { NewBookingForm } from '../NewBookingForm';
import { listClients } from '@/modules/clients/interface';
import { listPackages } from '@/modules/packages/interface';
import { listActiveServices, listDimensionsByDomain, listVariablesForServices } from '@/modules/services/interface';
import { listDeliverables } from '@/modules/deliverables/interface';
import { listRoles, listEmployees } from '@/modules/team/interface';
// The words a contract is made of. A contract is a document of agreed terms;
// this is where the terms live.
import { getContractTermsTemplate } from '@/modules/contracts/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { studioTimezone } from '@/kernel/studioHours';
import { premisesValueIds } from '@/modules/services/interface';
// The studio's tax position. The invoice raised below is snapshotted with it,
// so the form has to know it to show what the client will actually be asked for.
import { getTaxRate } from '@/modules/finances/interface';

export const dynamic = 'force-dynamic';

export default async function NewBookingPage(
  props: { searchParams: Promise<{ package?: string }> },
) {
  let orgId: string;
  try {
    orgId = (await getAuthOrgId()).orgId;
  } catch {
    redirect('/login');
  }

  /*
   * A booking started from the catalogue arrives already knowing its package.
   *
   * The Book button on a package card carries the id here rather than doing
   * anything itself — taking a booking is this form's job, and the catalogue
   * is one more way in. Read as a plain string and checked against the
   * studio's own packages below, because a query parameter is whatever
   * somebody typed into the address bar.
   */
  const { package: wantedPackage } = await props.searchParams;

  /*
   * WHAT THIS PAGE CANNOT DO WITHOUT, AND WHAT MERELY ENRICHES IT.
   *
   * Nine loads ran together and any one of them failing took the whole page
   * down. During an hour of network trouble that meant "Failed to load roles"
   * and no booking form at all — when roles are for STAFFING, which the
   * booking's own page does perfectly well afterwards. A studio could not take
   * a booking because it could not list its job titles.
   *
   * The split is not "what is cheap to lose". It is whether missing it makes
   * the form LIE:
   *
   *   Required — clients, packages, services, dimensions, deliverables. An
   *   empty catalogue is indistinguishable from a studio that sells nothing,
   *   and a booking taken against one is wrong in a way nobody notices until
   *   it is invoiced. These still fail loudly.
   *
   *   Enriching — roles, employees, the contract wording, the tax rate. Absent,
   *   the form offers less; it never states anything untrue. These degrade,
   *   AND SAY THEY HAVE, because a crew list that is empty because of a
   *   timeout looks exactly like a studio with no crew.
   */
  const [clientRows, packageRows, activeServices, dimensionsByDomain, allDeliverables] = await Promise.all([
    listClients(), listPackages(), listActiveServices(), listDimensionsByDomain(), listDeliverables(),
  ]);

  const degraded: string[] = [];
  const orEmpty = async <T,>(what: string, load: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await load();
    } catch (e) {
      console.error(`New booking: ${what} could not be loaded`, e);
      degraded.push(what);
      return fallback;
    }
  };

  const [roles, currencyCode, employees, termsTemplate] = await Promise.all([
    orEmpty('team roles', listRoles, [] as any[]),
    getStudioCurrency(),
    // Who the studio has, so a booking can be staffed while it is being taken
    // rather than only afterwards.
    orEmpty('the team', listEmployees, [] as any[]),
    orEmpty('the contract wording', getContractTermsTemplate, null as any),
  ]);

  // What the studio asks for up front, so the contract field opens on it rather
  // than on nothing.

  /*
   * What the studio charges on top.
   *
   * The form used to show the sum of its package prices and call that the
   * invoice. createInvoiceForBooking snapshots this rate onto the document and
   * writes tax_amount, so a studio on 7.5% read ₦200,000 here and sent the
   * client ₦215,000 — the form quoting one figure and the invoice demanding
   * another, with nothing anywhere saying so.
   */
  const taxRate = await getTaxRate();
  // Whose clock the date field and the day's other bookings are on.
  const timeZone = await studioTimezone(orgId);
  // Which of the studio's own values mean its building, so the date field only
  // mentions opening hours when they apply to what is being booked.
  const premisesValues = await premisesValueIds();

  const allVariables = (await listVariablesForServices(activeServices.map((s: any) => s.id)))
    .map((v: any) => {
      const sName = (activeServices as any[]).find(s => s.id === v.serviceId)?.name || 'Service';
      return { ...v, serviceName: sName };
    });

  const clientOptions = clientRows
    .filter((c: any) => c.status !== 'archived')
    .map((c: any) => ({ 
      id: c.contact?.id as string, 
      name: c.contact?.display_name as string,
      email: c.contact?.email as string,
      phone: c.contact?.phone as string
    }))
    .filter((c: { id: string }) => !!c.id);
    
  const packageOptions = packageRows
    .filter((p: any) => p.status !== 'retired')
    .map((p: any) => ({ 
      id: p.id as string, 
      name: p.name as string,
      description: p.description as string | null,
      durationMinutes: p.duration_minutes as number | null,
      services: p.services || [],  
      deliverables: p.deliverables || [], 
      dimensions: p.dimensions || [],
      // The picker shows the package as a card now, so it needs what a card
      // shows: the picture, where to look in it, and the price.
      coverUrl: (p.cover_url ?? null) as string | null,
      coverPosition: (p.cover_position ?? null) as string | null,
      price: p.price ?? null,
    }));

  const serviceOptions = activeServices.map((s: any) => ({
    id: s.id,
    name: s.name,
    domainName: s.domain?.name || ''
  }));

  /*
   * WHAT THIS BOOKING WAS STARTED FROM.
   *
   * Clicking Book on a package card lands here, and the package IS added — but
   * the page said "New booking · Start one with whatever you know", word for
   * word what it says when started from nothing. An operator who came here
   * deliberately, from one package, got no sign the click had done anything
   * and had to scroll to the second section to find out.
   *
   * Named for PROVENANCE rather than for current state: "started from" stays
   * true if the operator then removes the line, where "is on this booking"
   * would quietly become a lie.
   */
  const startedFrom = wantedPackage
    ? (packageOptions as any[]).find((p) => p.id === wantedPackage)?.name ?? null
    : null;

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href={startedFrom ? `/packages/${wantedPackage}` : '/bookings'}>
        &larr; {startedFrom ? `Back to ${startedFrom}` : 'Back to Bookings'}
      </Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">New booking</h1>
          <p className="q-page-subtitle">
            {startedFrom
              ? `Started from ${startedFrom}, already added below.`
              : 'Start one with whatever you know — the rest fills in as you go.'}
          </p>
        </div>
      </header>

      {/*
        * SAID, NOT SWALLOWED.
        *
        * Degrading quietly is its own lie: a crew list that is empty because a
        * request timed out looks exactly like a studio that has hired nobody,
        * and an operator would go looking for the team they know they added.
        * The booking can still be taken, and the sentence says which part of
        * the page is not itself.
        */}
      {degraded.length > 0 && (
        <div className="q-card q-section" style={{ marginBottom: '20px', borderColor: 'var(--q-color-warm)' }}>
          <strong className="q-strong">{degraded.join(' and ')} could not be loaded.</strong>
          <p className="q-meta" style={{ margin: '4px 0 0' }}>
            The booking can still be taken. Reload to try again.
          </p>
        </div>
      )}

      <NewBookingForm 
        clients={clientOptions} 
        packages={packageOptions} 
        /*
         * Only if it is really one of this studio's. An id that matches nothing
         * is dropped rather than passed on, so a mistyped or stale link opens an
         * ordinary empty form instead of a form quietly trying to load a package
         * that is not there — or one belonging to somebody else, since
         * packageOptions is already scoped to this organization.
         */
        initialPackageId={
          wantedPackage && packageOptions.some((p: any) => p.id === wantedPackage)
            ? wantedPackage
            : undefined
        }
        services={serviceOptions}
        dimensionsByDomain={dimensionsByDomain}
        allServices={activeServices as any}
        allVariables={allVariables as any}
        allDeliverables={allDeliverables as any}
        roleOptions={(roles as any[]).map((r) => r.name)}
        roleChoices={(roles as any[]).map((r) => ({ id: r.id, name: r.name }))}
        employees={(employees as any[]).map((e) => ({
          id: e.id as string,
          name: (e.contact?.display_name as string) || 'Unnamed',
          roleIds: ((e.employee_roles || []) as any[]).map((er) => er.role?.id).filter(Boolean),
        }))}
        currencyCode={currencyCode}
        // The studio's standing terms, as the wording this booking starts
        // from. Not a flag: the form opens on these and lets them be edited for
        // this one agreement, which is the whole point of a contract being a
        // document rather than a setting.
        termsTemplate={termsTemplate}
        taxRate={taxRate}
        timeZone={timeZone}
        premisesValueIds={premisesValues}
      />
    </div>
  );
}
