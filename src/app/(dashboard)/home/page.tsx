import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudio } from '@/kernel/organizations';
import {
  LayoutDashboard, Layers, CheckSquare, DollarSign,
  CalendarCheck, CalendarDays, FileSignature,
  Package, Users, PieChart, Settings, Clock, Aperture,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

// Mirrors the sidebar's grouping — Cockpit / Work / Studio / Platform. When
// one moves, so does the other; two different answers to "where does this
// live" is worse than either answer alone.
const SECTIONS = [
  {
    label: 'Cockpit',
    jewel: 'q-bg-jewel-indigo',
    apps: [
      { label: 'Command Center', href: '/overview', desc: 'What needs your attention', icon: LayoutDashboard },
      { label: 'Calendar', href: '/calendar', desc: "What's coming up", icon: CalendarDays },
      { label: 'Tasks', href: '/tasks', desc: 'Who is doing what, across every booking', icon: CheckSquare },
      // Cockpit rather than Studio, matching the sidebar: who is in is
      // something you check this morning, not something you configure.
      { label: 'Attendance', href: '/attendance', desc: 'Who is in today', icon: Clock },
    ],
  },
  {
    label: 'Work',
    jewel: 'q-bg-jewel-emerald',
    apps: [
      { label: 'Bookings', href: '/bookings', desc: 'Every job in one place', icon: CalendarCheck },
      { label: 'Clients', href: '/clients', desc: 'Who you work with', icon: Users },
      { label: 'Contracts', href: '/contracts', desc: 'Proposals and contracts', icon: FileSignature },
      { label: 'Finances', href: '/finances', desc: 'The money ledger', icon: DollarSign },
    ],
  },
  {
    label: 'Studio',
    jewel: 'q-bg-jewel-amber',
    apps: [
      { label: 'Services', href: '/services', desc: 'What this studio knows how to do', icon: Layers },
      { label: 'Packages', href: '/packages', desc: 'What clients can book', icon: Package },
      { label: 'Lens', href: '/lens', desc: 'The same work, read by how it is classified', icon: Aperture },
      { label: 'Team', href: '/team', desc: 'Employees and roles', icon: Users },
    ],
  },
  {
    label: 'Platform',
    jewel: 'q-bg-jewel-slate',
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
            <div className="q-eyebrow">{section.label}</div>
            <div className="q-grid-cards">
              {section.apps.map((app) => {
                const Icon = app.icon;
                return (
                  <Link
                    key={app.href}
                    href={app.href}
                    className="q-card q-card-interactive q-plain-link q-row q-row-nowrap"
                  >
                    <div className={`q-lp-icon ${section.jewel}`}>
                      <Icon size={22} />
                    </div>
                    <div className="q-fill">
                      <div className="q-lp-tile-label">{app.label}</div>
                      <div className="q-lp-tile-desc">{app.desc}</div>
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
