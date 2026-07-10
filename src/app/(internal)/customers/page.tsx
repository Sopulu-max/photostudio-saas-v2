import React from 'react';
import { getOrgId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { StateBadge } from '@/components/ontology/StateBadge';
import { Invitation } from '@/components/ontology/Invitation';
import { DatabaseOfflineFallback } from '@/components/layout/DatabaseOfflineFallback';
import { CustomerDTO } from '@/lib/domains/kernel/types';

export const dynamic = 'force-dynamic';

async function getCustomers(orgId: string): Promise<{ customers: CustomerDTO[]; dbOffline: boolean }> {
  try {
    const supabase = await createClient();
    const repo = new KernelRepository(supabase);
    const customers = await repo.getCustomersByOrganization(orgId);
    return { customers, dbOffline: false };
  } catch {
    return { customers: [], dbOffline: true };
  }
}

export default async function CustomersPage() {
  const orgId = await getOrgId();
  if (!orgId) return <div>Unauthorized</div>;

  const { customers, dbOffline } = await getCustomers(orgId);

  return (
    <div style={{ padding: '48px', maxWidth: '1100px', margin: '0 auto' }}>
      {dbOffline && <DatabaseOfflineFallback />}

      {/* Page Header */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: '48px',
        paddingBottom: '24px',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-family-serif)',
            fontSize: '2.5rem',
            fontWeight: 700,
            margin: '0 0 8px 0',
            letterSpacing: '-0.02em',
          }}>
            Customers
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '1rem' }}>
            Every relationship your studio holds.{' '}
            <span style={{ color: 'var(--color-text-tertiary)' }}>
              {customers.length} active {customers.length === 1 ? 'record' : 'records'}
            </span>
          </p>
        </div>
      </header>

      {customers.length === 0 ? (
        <Invitation
          label="No customers yet"
          actionLabel="Customers are created when a booking Request is accepted"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 180px 180px 120px',
            padding: '8px 16px',
            fontSize: '0.72rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}>
            <div>Customer</div>
            <div>Contact</div>
            <div>Since</div>
            <div>Status</div>
          </div>

          {/* Table rows */}
          {customers.map(customer => {
            const name = (customer.profileData as any)?.name || customer.primaryIdentifier;
            const email = (customer.profileData as any)?.email;
            const phone = (customer.profileData as any)?.phone;
            const contact = email || phone || customer.primaryIdentifier;
            const since = new Date(customer.createdAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });

            return (
              <div
                key={customer.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 180px 180px 120px',
                  padding: '16px',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  alignItems: 'center',
                  background: 'var(--color-surface-elevated)',
                  transition: 'background var(--transition-fast)',
                  cursor: 'default',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-base)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface-elevated)')}
              >
                {/* Identity column */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'var(--color-surface-base)',
                    border: '1px solid var(--color-border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: 'var(--color-text-secondary)',
                    flexShrink: 0,
                  }}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
                      {name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>
                      {customer.id.substring(0, 8)}
                    </div>
                  </div>
                </div>

                {/* Contact */}
                <div style={{
                  fontSize: '0.85rem',
                  color: 'var(--color-text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {contact}
                </div>

                {/* Since date */}
                <div style={{
                  fontSize: '0.85rem',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'var(--font-family-mono)',
                }}>
                  {since}
                </div>

                {/* Status */}
                <StateBadge state={customer.status} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
