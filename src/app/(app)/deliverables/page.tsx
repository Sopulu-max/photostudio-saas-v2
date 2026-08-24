import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listOutputTypesByDomain, listDeliveryContainers } from '@/modules/deliverables/interface';
import { Box, PackageOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DeliverablesPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [outputsByDomain, containers] = await Promise.all([
    listOutputTypesByDomain(),
    listDeliveryContainers(),
  ]);

  return (
    <div className="q-page">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Deliverables</h1>
          <p className="q-page-subtitle">The structural outputs your studio produces and the vessels used to deliver them.</p>
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

        {/* Delivery Containers */}
        <section>
          <h2 className="q-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PackageOpen size={18} className="q-icon-dim" />
            Delivery Containers
          </h2>
          {containers.length === 0 ? (
            <p className="q-meta" style={{ marginTop: '16px' }}>No delivery containers defined.</p>
          ) : (
            <div className="q-grid-cards">
              {containers.map((c) => (
                <Link
                  key={c.id}
                  href={`/deliverables/${c.id}?type=container`}
                  className="q-card q-stack"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <strong className="q-strong">{c.name}</strong>
                  <span className="q-meta-sm">Vessel / Packaging</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
