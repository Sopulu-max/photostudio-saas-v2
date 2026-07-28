import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  LayoutDashboard, Layers, CheckSquare, DollarSign,
  CalendarCheck, FileSignature, FolderOpen,
  Package, GitMerge, Users, Boxes,
  PieChart, Settings,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const SECTIONS = [
  {
    label: 'Studio Desk',
    jewel: 'var(--q-jewel-indigo)',
    apps: [
      { label: 'Command Center', href: '/overview', desc: 'What needs your attention', icon: LayoutDashboard },
      { label: 'Bookings', href: '/bookings', desc: 'Every job in one place', icon: CalendarCheck },
      { label: 'Workflows', href: '/workflows', desc: 'Active jobs and pipelines', icon: Layers },
      { label: 'My Tasks', href: '/my-tasks', desc: 'Your assigned work', icon: CheckSquare },
      { label: 'Finances', href: '/finances', desc: 'The money ledger', icon: DollarSign },
    ],
  },
  {
    label: 'Pipeline',
    jewel: 'var(--q-jewel-emerald)',
    apps: [
      { label: 'Clients', href: '/clients', desc: 'Who you work with', icon: Users },
      { label: 'Contracts', href: '/contracts', desc: 'Proposals and contracts', icon: FileSignature },
      { label: 'Assets', href: '/assets', desc: 'Files and deliverables', icon: FolderOpen },
    ],
  },
  {
    label: 'Configuration',
    jewel: 'var(--q-jewel-amber)',
    apps: [
      { label: 'Services', href: '/services', desc: 'Your offerings and pricing', icon: Package },
      
      { label: 'Team', href: '/team', desc: 'Employees and roles', icon: Users },
      { label: 'Resources', href: '/resources', desc: 'Gear and spaces', icon: Boxes },
    ],
  },
  {
    label: 'Platform',
    jewel: 'var(--q-jewel-slate)',
    apps: [
      { label: 'Analytics', href: '/analytics', desc: 'Insights and metrics', icon: PieChart },
      { label: 'Settings', href: '/settings', desc: 'Studio configuration', icon: Settings },
    ],
  },
];

export default async function LaunchpadPage() {
  let orgName = 'Your studio';
  try {
    const { orgId } = await getAuthOrgId();
    const { data: org } = await supabaseAdmin.from('organizations').select('name').eq('id', orgId).single();
    if (org?.name) orgName = org.name;
  } catch {
    redirect('/login');
  }

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">{orgName}</h1>
          <p className="q-page-subtitle">Everything your studio runs on, in one place.</p>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
        {SECTIONS.map((section) => (
          <section key={section.label}>
            <div style={{ fontFamily: 'var(--q-font-mono)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--q-color-ink-500)', marginBottom: '16px' }}>
              {section.label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '16px' }}>
              {section.apps.map((app) => {
                const Icon = app.icon;
                return (
                  <Link
                    key={app.href}
                    href={app.href}
                    className="q-card q-card-interactive"
                    style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '15px', padding: '18px' }}
                  >
                    <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: section.jewel, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, boxShadow: 'var(--q-shadow-sm)' }}>
                      <Icon size={22} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--q-color-ink-900)', letterSpacing: '-0.01em' }}>{app.label}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.desc}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
