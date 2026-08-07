import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudio } from '@/kernel/organizations';
import {
  LayoutDashboard, Layers, CheckSquare, DollarSign,
  CalendarCheck, CalendarDays, FileSignature,
  Package, Users, PieChart, Settings,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

// Mirrors the sidebar's grouping — Cockpit / Work / Studio / Platform. When
// one moves, so does the other; two different answers to "where does this
// live" is worse than either answer alone.
const SECTIONS = [
  {
    label: 'Cockpit',
    jewel: 'var(--q-jewel-indigo)',
    apps: [
      { label: 'Command Center', href: '/overview', desc: 'What needs your attention', icon: LayoutDashboard },
      { label: 'Calendar', href: '/calendar', desc: "What's coming up", icon: CalendarDays },
      { label: 'Tasks', href: '/tasks', desc: 'Who is doing what, across every booking', icon: CheckSquare },
    ],
  },
  {
    label: 'Work',
    jewel: 'var(--q-jewel-emerald)',
    apps: [
      { label: 'Bookings', href: '/bookings', desc: 'Every job in one place', icon: CalendarCheck },
      { label: 'Clients', href: '/clients', desc: 'Who you work with', icon: Users },
      { label: 'Contracts', href: '/contracts', desc: 'Proposals and contracts', icon: FileSignature },
      { label: 'Finances', href: '/finances', desc: 'The money ledger', icon: DollarSign },
    ],
  },
  {
    label: 'Studio',
    jewel: 'var(--q-jewel-amber)',
    apps: [
      { label: 'Services', href: '/services', desc: 'What this studio knows how to do', icon: Layers },
      { label: 'Packages', href: '/packages', desc: 'What clients can book', icon: Package },
      { label: 'Team', href: '/team', desc: 'Employees and roles', icon: Users },
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
    await getAuthOrgId();
    const org = await getStudio();
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

      <div className="q-stack q-stack-xl">
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
                    className="q-card q-card-interactive q-plain-link q-row q-row-nowrap"
                    style={{ gap: '15px', padding: '18px' }}
                  >
                    <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: section.jewel, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--q-color-accent-text)', flexShrink: 0, boxShadow: 'var(--q-shadow-sm)' }}>
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
