import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listDeliverables,  } from '@/modules/deliverables/interface';
import { EditDeliverableForm } from './EditDeliverableForm';

export const dynamic = 'force-dynamic';

export default async function EditDeliverablePage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }> }) {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const { id } = await props.params;
  const { type } = await props.searchParams;

  let initialName = '';
  let domainName = '';
  let initialOutput: any = null;

  if (type === 'output') {
    const outputs = await listDeliverables();
    const out = outputs.find(o => o.id === id);
    if (!out) redirect('/deliverables');
    initialName = out.name;
    domainName = out.domainName || '';
    initialOutput = out;
  } else {
    redirect('/deliverables');
  }

  return (
    <div className="q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Edit {type === 'output' ? 'Output' : 'Container'}</h1>
          <p className="q-page-subtitle">
            {type === 'output' ? `Belongs to ${domainName}` : 'Cross-domain delivery vessel'}
          </p>
        </div>
      </header>
      <EditDeliverableForm id={id} type={type as 'output' | 'container'} initialName={initialName} initialOutput={initialOutput} />
    </div>
  );
}
