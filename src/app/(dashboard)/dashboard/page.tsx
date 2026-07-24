'use client';

import Link from 'next/link';
import { Activity, LayoutDashboard, Users, GitMerge, Package, DollarSign, Layers, PieChart, FileSignature, CheckSquare, LayoutTemplate, Settings } from 'lucide-react';

export default function LaunchpadPage() {
  const appGrid = [
    { label: 'Overview', href: '/overview', desc: 'Command center. Operational state at a glance.', icon: <LayoutDashboard size={28} color="white" /> },
    { label: 'Intents', href: '/intents', desc: 'Incoming inquiries from potential clients.', icon: <Activity size={28} color="white" /> },
    { label: 'Agreements', href: '/agreements', desc: 'Contracts, proposals, and signed commitments.', icon: <FileSignature size={28} color="white" /> },
    { label: 'Workflow Blueprints', href: '/workflows/templates', desc: 'Reusable production pipelines you attach to services.', icon: <GitMerge size={28} color="white" /> },
    { label: 'My Tasks', href: '/my-tasks', desc: 'Your assigned production stages.', icon: <CheckSquare size={28} color="white" /> },
    { label: 'People', href: '/people', desc: 'Clients, staff, and vendors.', icon: <Users size={28} color="white" /> },
    { label: 'Resources', href: '/resources', desc: 'Inventory, gear, and spaces.', icon: <Package size={28} color="white" /> },
    { label: 'Services', href: '/services', desc: 'Offerings, pricing, and workflow templates.', icon: <Layers size={28} color="white" /> },
    { label: 'Finances', href: '/finances', desc: 'Unified ledger of all money movements.', icon: <DollarSign size={28} color="white" /> },
    { label: 'Visual Engine', href: '/visual-layouts', desc: 'Design storefronts, portals, and galleries.', icon: <LayoutTemplate size={28} color="white" /> },
    { label: 'Analytics', href: '/analytics', desc: 'Business insights and operational metrics.', icon: <PieChart size={28} color="white" /> },
    { label: 'Settings', href: '/settings', desc: 'Studio profile, team, and configuration.', icon: <Settings size={28} color="white" /> },
  ];

  const jewelGradients = [
    'var(--q-jewel-indigo)',
    'var(--q-jewel-emerald)',
    'var(--q-jewel-rose)',
    'var(--q-jewel-slate)',
    'var(--q-jewel-indigo)',
    'var(--q-jewel-emerald)',
    'var(--q-jewel-rose)',
    'var(--q-jewel-slate)',
    'var(--q-jewel-indigo)',
    'var(--q-jewel-emerald)',
    'var(--q-jewel-rose)',
    'var(--q-jewel-slate)',
  ];

  return (
    <div style={{ padding: '32px 0' }}>
      <header style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 600, margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>Studio OS</h1>
        <p style={{ fontSize: '1rem', color: 'var(--q-color-ink-500)', margin: 0 }}>Select a module to begin.</p>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '16px',
      }}>
        {appGrid.map((app, index) => (
          <Link
            key={app.label}
            href={app.href}
            className="q-card q-card-interactive"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: '12px',
              padding: '24px 16px',
              textDecoration: 'none',
              color: 'var(--q-color-ink-900)',
            }}
          >
            <div style={{
              width: '52px',
              height: '52px',
              background: jewelGradients[index % jewelGradients.length],
              borderRadius: '14px',
              boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.3), var(--q-shadow-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {app.icon}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px' }}>{app.label}</div>
              <div style={{ fontSize: '0.775rem', color: 'var(--q-color-ink-500)', lineHeight: 1.4 }}>{app.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
