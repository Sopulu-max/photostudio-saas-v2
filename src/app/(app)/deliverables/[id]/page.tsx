import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listDeliverables, listVariablesForDeliverables } from '@/modules/deliverables/interface';
import { EditDeliverableForm } from './EditDeliverableForm';
import { DeliverableNeeds } from './DeliverableNeeds';

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

  /* What this kind declares — real variables, the same as a service's. */
  const needs = (await listVariablesForDeliverables([id])).map((v: any) => ({
    id: v.id, label: v.label, kind: v.kind,
    unit: v.unit ?? null,
    options: Array.isArray(v.options) ? v.options : [],
  }));

  return (
    <div className="q-page-narrow">
      <header className="q-page-header">
        <div>
          {/* It knew the name all along and titled itself with the category
              instead, so two open tabs of two different outputs were both
              called "Edit Output". */}
          <span className="q-eyebrow">Editing {type === 'output' ? 'output' : 'container'}</span>
          <h1 className="q-page-title">{initialName}</h1>
          <p className="q-page-subtitle">
            {type === 'output' ? `Belongs to ${domainName}` : 'Cross-domain delivery vessel'}
          </p>
        </div>
      </header>
      <EditDeliverableForm id={id} type={type as 'output' | 'container'} initialName={initialName} initialOutput={initialOutput} />

      {/*
        * WHAT THIS KIND NEEDS SETTLING.
        *
        * Its own section rather than a field on the form above, because it
        * saves as you go: declaring a variable is an act in itself, not a
        * pending edit to a name. The same shape a classification's "what you
        * need to know" already has on the Services settings page — one
        * mechanism, so one way of editing it.
        */}
      <section className="q-card q-section" style={{ marginTop: '24px' }}>
        <h2 className="q-section-title">What has to be settled about it</h2>
        <p className="q-meta" style={{ marginBottom: '16px' }}>
          Declared once here. Every package promising this deliverable is asked these, and can
          either fix an answer or leave it for the client.
        </p>
        <DeliverableNeeds deliverableId={id} variables={needs} />
      </section>
    </div>
  );
}
