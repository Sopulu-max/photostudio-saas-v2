import React from 'react';
import Link from 'next/link';

export default function InternalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      {/* SKELETON SIDEBAR */}
      <nav style={{ 
        width: '260px', 
        background: 'var(--color-surface-elevated)', 
        borderRight: '1px solid var(--color-border-subtle)',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <div style={{ paddingBottom: '32px', paddingLeft: '8px' }}>
          <h2 style={{ fontFamily: 'var(--font-family-serif)', fontSize: '1.4rem' }}>Studio Name</h2>
        </div>
        
        <SidebarLink href="/specimen" label="Ontology Specimen" />
        <SidebarLink href="/" label="Command Center" />
        <SidebarLink href="/instances" label="Active Instances" />
        <SidebarLink href="/assets" label="Asset Vault" />
        <SidebarLink href="/finance" label="Ledger (Finance)" />
        
        <div style={{ marginTop: 'auto' }}>
          <SidebarLink href="/_scaffolding" label="Scaffolding (Settings)" />
        </div>
      </nav>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </main>

    </div>
  );
}

function SidebarLink({ href, label }: { href: string, label: string }) {
  return (
    <Link href={href} style={{
      padding: '8px 12px',
      borderRadius: '6px',
      color: 'var(--color-text-secondary)',
      fontSize: '0.95rem',
      fontWeight: 500,
      transition: 'background var(--transition-fast), color var(--transition-fast)'
    }}>
      {label}
    </Link>
  );
}
