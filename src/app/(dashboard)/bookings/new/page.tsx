import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { NewBookingForm } from '../NewBookingForm';
import { listClients } from '@/modules/clients/interface';
import { listPackages } from '@/modules/packages/interface';

export const dynamic = 'force-dynamic';

export default async function NewBookingPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [clientRows, packageRows] = await Promise.all([
    listClients(), listPackages(),
  ]);

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
    .map((p: any) => ({ id: p.id as string, name: p.name as string }));

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href="/bookings">&larr; Back to Bookings</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">New booking</h1>
          <p className="q-page-subtitle">Start one with whatever you know — the rest fills in as you go.</p>
        </div>
      </header>
      
      <NewBookingForm clients={clientOptions} packages={packageOptions} />
    </div>
  );
}
