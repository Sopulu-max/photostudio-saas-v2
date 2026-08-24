import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listServiceDomains } from '@/modules/services/interface';
import { NewDeliverableForm } from './NewDeliverableForm';

export const dynamic = 'force-dynamic';

export default async function NewDeliverablePage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const domains = await listServiceDomains();

  return (
    <div className="q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">New Deliverable</h1>
          <p className="q-page-subtitle">Add a new output type or delivery container to the studio registry.</p>
        </div>
      </header>
      <NewDeliverableForm domains={domains} />
    </div>
  );
}
