import React from 'react';
import { getPortalCustomer } from '@/app/actions/portal';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function PortalLayout({
  children,
  params
}: {
  children: React.ReactNode,
  params: Promise<any>
}) {
  const { orgId } = await params;
  const customerId = await getPortalCustomer(orgId);
  
  // If not on login page and not logged in, redirect
  // We can't access pathname here, so we just wrap the children and let the page handle login logic.
  // Wait, layout runs for all routes inside portal.
  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '20px' }}>
        <h1 style={{ fontFamily: 'var(--font-family-serif)', fontSize: '1.5rem' }}>Client Portal</h1>
        {customerId && (
          <form action={async () => {
            'use server';
            const { logoutCustomer } = await import('@/app/actions/portal');
            await logoutCustomer(orgId);
          }}>
            <button style={{ background: 'transparent', border: '1px solid var(--color-border-subtle)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
              Sign Out
            </button>
          </form>
        )}
      </header>
      {children}
    </div>
  );
}
