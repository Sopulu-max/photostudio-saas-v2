import React from 'react';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { signOut } from '@/app/actions/auth';
import { SyncStateIndicator } from '@/components/layout/SyncStateIndicator';

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>

      {/* SIDEBAR */}
      <nav style={{
        width: '260px',
        background: 'var(--color-surface-elevated)',
        borderRight: '1px solid var(--color-border-subtle)',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        flexShrink: 0,
      }}>
        <div style={{ paddingBottom: '32px', paddingLeft: '8px' }}>
          <h2 style={{ fontFamily: 'var(--font-family-serif)', fontSize: '1.4rem', margin: 0 }}>
            Studio
          </h2>
          {session?.orgId && (
            <p style={{
              margin: '4px 0 0',
              fontSize: '0.7rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-family-mono, monospace)',
            }}>
              {session.orgId.slice(0, 8)}…
            </p>
          )}
        </div>

        <SidebarLink href="/specimen" label="Ontology Specimen" />
        <SidebarLink href="/" label="Command Center" />
        <SidebarLink href="/instances" label="Active Instances" />
        <SidebarLink href="/assets" label="Asset Vault" />
        <SidebarLink href="/finance" label="Ledger (Finance)" />
        <SidebarLink href="/quick-sale" label="Quick Sale" />

        {/* Foot: user info + sign out */}
        <div style={{
          marginTop: 'auto',
          paddingTop: '16px',
          borderTop: '1px solid var(--color-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <SidebarLink href="/_scaffolding" label="Scaffolding" />

          {session && (
            <div style={{ padding: '8px 12px' }}>
              <p style={{
                margin: '0 0 8px',
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {session.email}
              </p>
              <form action={signOut}>
                <button type="submit" style={{
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontFamily: 'var(--font-family-sans)',
                  color: 'var(--color-text-secondary)',
                  background: 'transparent',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                }}>
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        <SyncStateIndicator />
        {children}
      </main>
    </div>
  );
}

function SidebarLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} style={{
      padding: '8px 12px',
      borderRadius: '6px',
      color: 'var(--color-text-secondary)',
      fontSize: '0.95rem',
      fontWeight: 500,
      transition: 'background var(--transition-fast), color var(--transition-fast)',
      display: 'block',
    }}>
      {label}
    </Link>
  );
}
