import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listDeliverablesByDomain, listDeliveryContainers } from '@/modules/deliverables/interface';
import { Box, PackageOpen } from 'lucide-react';
import { ContainerManager } from './ContainerManager';

export const dynamic = 'force-dynamic';

export default async function DeliverablesPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [outputsByDomain, containers] = await Promise.all([
    listDeliverablesByDomain(),
    // Was `const containers: any[] = []`. The table had a row in it the whole
    // time and nothing could reach it.
    listDeliveryContainers(),
  ]);

  return (
    <div className="q-page">
      <header className="q-page-header">
        <div>
          {/*
            * ONE WORD, EVERYWHERE.
            *
            * These rows were called three things: "Deliverables" here,
            * "Output types" on the Services settings page showing the very same
            * rows, and "output type" in the errors the domain raised. An
            * operator moving between two pages was told they were looking at
            * two different things.
            *
            * The blueprint reserves "deliverable" for a package's promise and
            * calls this level an output type. That distinction is real in the
            * model and it is not what a studio says out loud — a studio has
            * deliverables, and the word it uses is the word the interface uses.
            * The document is the map; this is the territory.
            *
            * So: deliverable, on every page, in every error, in the nav.
            */}
          <h1 className="q-page-title">Deliverables</h1>
          <p className="q-page-subtitle">
            The kinds of thing your studio produces, and the vessels that carry them to a client.
          </p>
        </div>
        <Link href="/deliverables/new" className="q-btn q-btn-primary">
          New deliverable
        </Link>
      </header>

      <div className="q-stack q-stack-lg">
        {/* Primary Outputs */}
        {Object.keys(outputsByDomain).length === 0 ? (
          <div className="q-blank-state">
            <p>No primary outputs have been defined yet.</p>
          </div>
        ) : (
          Object.entries(outputsByDomain).map(([domain, outputs]) => (
            <section key={domain}>
              <h2 className="q-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Box size={18} className="q-icon-dim" />
                {domain} Outputs
              </h2>
              <div className="q-grid-cards">
                {outputs.map((output) => (
                  <Link
                    key={output.id}
                    href={`/deliverables/${output.id}?type=output`}
                    className="q-card q-stack"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <strong className="q-strong">{output.name}</strong>
                    <span className="q-meta-sm">Primary Output</span>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}

        {/* Deliverable Containers */}
        <section>
          <h2 className="q-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PackageOpen size={18} className="q-icon-dim" />
            Delivery containers
          </h2>
          {/*
            * This mapped over `([] as any[])` — a literal empty array written
            * into the markup — under a heading promising containers, beside a
            * `containers` variable that was itself hardcoded empty. Two
            * separate ways of guaranteeing nothing could ever be drawn, while
            * the studio had a container called "Google Drive Folder" sitting in
            * the table.
            */}
          <p className="q-meta" style={{ marginTop: '4px', marginBottom: '16px' }}>
            How finished work reaches a client — a gallery, a Drive folder, a USB stick. They carry
            outputs without changing them, so they are never services.
          </p>
          <ContainerManager containers={containers} />
        </section>
      </div>
    </div>
  );
}
