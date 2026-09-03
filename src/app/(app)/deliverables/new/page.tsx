import React from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listServiceDomains, listServices, buildDeliverableSuggestions } from '@/modules/services/interface';
import { listDeliverablesByDomain } from '@/modules/deliverables/interface';
import { NewDeliverableForm } from './NewDeliverableForm';

export const dynamic = 'force-dynamic';

export default async function NewDeliverablePage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [domains, existingByDomain, services] = await Promise.all([
    listServiceDomains(),
    listDeliverablesByDomain(),
    listServices(),
  ]);

  /*
   * WHAT THE APP ALREADY KNOWS WORK LIKE THIS PRODUCES.
   *
   * The same suggestions the service form and the settings page offer — the
   * library's, plus what this studio's own services already produce. This page
   * was the one place a studio had to type a deliverable blind, which is how
   * near-duplicates get made: "Edited Photos" beside "Edited photographs",
   * matched by neither.
   */
  const suggestions = buildDeliverableSuggestions(services as any);

  return (
    <div className="q-page-narrow">
      <Link href="/deliverables" className="q-back">&larr; Deliverables</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">New deliverable</h1>
          <p className="q-page-subtitle">
            A kind of thing your studio produces. Name it once here and every service and package
            can point at it — quantities, sizes and anything else it needs settling are said later.
          </p>
        </div>
      </header>
      <NewDeliverableForm
        domains={domains}
        existingByDomain={existingByDomain}
        suggestions={suggestions as any}
      />
    </div>
  );
}
