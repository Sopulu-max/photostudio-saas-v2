import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { NewBookingForm } from '../NewBookingForm';
import { listClients } from '@/modules/clients/interface';
import { listPackages } from '@/modules/packages/interface';
import { listActiveServices, listDimensionsByDomain, listVariablesForServices } from '@/modules/services/interface';
import { listDeliverables } from '@/modules/deliverables/interface';
import { listRoles } from '@/modules/team/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { getDepositDefault } from '@/modules/contracts/interface';

export const dynamic = 'force-dynamic';

export default async function NewBookingPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [clientRows, packageRows, activeServices, dimensionsByDomain, roles, currencyCode, allDeliverables] = await Promise.all([


    listClients(), listPackages(), listActiveServices(), listDimensionsByDomain(),
    listRoles(), getStudioCurrency(), listDeliverables()
  ]);

  // What the studio asks for up front, so the contract field opens on it rather
  // than on nothing.
  const depositDefault = await getDepositDefault();

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

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href="/bookings">&larr; Back to Bookings</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">New booking</h1>
          <p className="q-page-subtitle">Start one with whatever you know — the rest fills in as you go.</p>
        </div>
      </header>
      
      <NewBookingForm 
        clients={clientOptions} 
        packages={packageOptions} 
        services={serviceOptions}
        dimensionsByDomain={dimensionsByDomain}
        allServices={activeServices as any}
        allVariables={allVariables as any}
        allDeliverables={allDeliverables as any}
        roleOptions={(roles as any[]).map((r) => r.name)}
        roleChoices={(roles as any[]).map((r) => ({ id: r.id, name: r.name }))}
        currencyCode={currencyCode}
        depositDefault={depositDefault}
      />
    </div>
  );
}
