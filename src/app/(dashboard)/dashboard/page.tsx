'use client';

import Link from 'next/link';
import { Activity, LayoutDashboard, Users, GitMerge, Package, DollarSign, Layers, PieChart } from 'lucide-react';

export default function LaunchpadPage() {
  const appGrid = [
    { label: 'Command Center', href: '/overview', desc: 'Aggregate state of the Organization.', icon: <LayoutDashboard size={28} color="white" /> },
    { label: 'Intents', href: '/intents', desc: 'Incoming inquiries and potentials.', icon: <Activity size={28} color="white" /> },
    { label: 'People', href: '/people', desc: 'Clients, staff, and vendors.', icon: <Users size={28} color="white" /> },
    { label: 'Workflows', href: '/workflows', desc: 'Active production sequences.', icon: <GitMerge size={28} color="white" /> },
    { label: 'Resources', href: '/resources', desc: 'Inventory, gear, and spaces.', icon: <Package size={28} color="white" /> },
    { label: 'Finances', href: '/finances', desc: 'Ledger, invoices, and deposits.', icon: <DollarSign size={28} color="white" /> },
    { label: 'Services', href: '/services', desc: 'Offerings, pricing, and templates.', icon: <Layers size={28} color="white" /> },
    { label: 'Analytics', href: '/analytics', desc: 'Insights and operational metrics.', icon: <PieChart size={28} color="white" /> },
  ];

  return (
    <div style={{ padding: '64px 0' }}>
      <header style={{ textAlign: 'center', marginBottom: '64px' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 600, margin: '0 0 16px 0', letterSpacing: '-0.02em' }}>Production OS</h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--q-color-ink-500)', margin: 0 }}>Select an application to begin.</p>
      </header>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '24px',
        maxWidth: '1000px',
        margin: '0 auto'
      }}>
        {appGrid.map((app, index) => {
          // Assign a jewel gradient based on index to differentiate the apps visually
          const jewelGradients = [
            'var(--q-jewel-indigo)', 
            'var(--q-jewel-emerald)', 
            'var(--q-jewel-rose)', 
            'var(--q-jewel-slate)',
            'var(--q-jewel-indigo)', 
            'var(--q-jewel-emerald)', 
            'var(--q-jewel-rose)', 
            'var(--q-jewel-slate)'
          ];
          
          return (
            <Link 
              key={app.label} 
              href={app.href}
              className="q-card q-card-interactive"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '16px',
                padding: '32px 24px',
                textDecoration: 'none',
                color: 'var(--q-color-ink-900)'
              }}
            >
              <div style={{ 
                width: '64px', 
                height: '64px', 
                background: jewelGradients[index % jewelGradients.length], 
                borderRadius: '16px',
                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.3), var(--q-shadow-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {app.icon}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1.125rem', marginBottom: '8px' }}>{app.label}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', lineHeight: 1.4 }}>{app.desc}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
