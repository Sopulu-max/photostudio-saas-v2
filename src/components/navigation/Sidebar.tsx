'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarCheck,
  CalendarDays,
  FileSignature,
  Images,
  Users,
  Boxes,
  Package,
  DollarSign,
  Layers,
  PieChart,
  CheckSquare,
  Clock,
  Settings,
  Box,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    label: 'Cockpit',
    items: [
      { label: 'Command Center', href: '/overview', icon: LayoutDashboard },
      { label: 'Calendar', href: '/calendar', icon: CalendarDays },
      { label: 'Tasks', href: '/tasks', icon: CheckSquare },
      // Cockpit, not Studio: who is in is a thing you check this morning, not
      // something you configure.
      { label: 'Attendance', href: '/attendance', icon: Clock },
    ]
  },
  {
    label: 'Work',
    items: [
      { label: 'Bookings', href: '/bookings', icon: CalendarCheck },
      { label: 'Galleries', href: '/galleries', icon: Images },
      { label: 'Clients', href: '/clients', icon: Users },
      { label: 'Contracts', href: '/contracts', icon: FileSignature },
      { label: 'Finances', href: '/finances', icon: DollarSign },
    ]
  },
  {
    label: 'Studio',
    items: [
      { label: 'Services', href: '/services', icon: Layers },
      { label: 'Packages', href: '/packages', icon: Package },
      { label: 'Deliverables', href: '/deliverables', icon: Box },
      { label: 'Team', href: '/team', icon: Boxes },
    ]
  },
  {
    label: 'Platform',
    items: [
      { label: 'Analytics', href: '/analytics', icon: PieChart },
      { label: 'Settings', href: '/settings', icon: Settings },
    ]
  },
];

export function Sidebar({ studioName, studioLogo }: { studioName?: string; orgSlug?: string; studioLogo?: string }) {
  const pathname = usePathname();

  return (
    <aside style={{
      width: '220px',
      minWidth: '220px',
      height: '100vh',
      position: 'sticky',
      top: 0,
      borderRight: '1px solid var(--q-color-ink-100)',
      backgroundColor: 'var(--q-color-paper)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      zIndex: 40,
    }}>
      {/* Studio Name / Logo */}
      <div style={{
        padding: '20px 16px 16px',
        borderBottom: '1px solid var(--q-color-ink-100)',
      }}>
        <Link href="/home" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {studioLogo && (
            <img 
              src={studioLogo} 
              alt={studioName || 'Studio'} 
              style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover' }} 
            />
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.125rem', letterSpacing: '-0.02em', color: 'var(--q-color-ink-900)' }}>
              {studioName || 'Studio OS'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--q-color-ink-400)', marginTop: '2px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Studio Operating System
            </div>
          </div>
        </Link>
      </div>

      {/* Navigation Sections */}
      <nav style={{ flex: 1, padding: '8px 8px' }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} style={{ marginBottom: '8px' }}>
            <div style={{
              fontSize: '0.65rem',
              fontWeight: 600,
              color: 'var(--q-color-ink-400)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '12px 8px 4px',
            }}>
              {section.label}
            </div>
            {section.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--q-color-ink-900)' : 'var(--q-color-ink-600)',
                    backgroundColor: isActive ? 'var(--q-color-ink-100)' : 'transparent',
                    marginBottom: '1px',
                    transition: 'background-color 0.1s, color 0.1s',
                  }}
                >
                  <Icon size={16} style={{ flexShrink: 0 }} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
