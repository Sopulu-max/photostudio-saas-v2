'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Activity,
  FileSignature,
  GitMerge,
  Users,
  Package,
  DollarSign,
  Layers,
  PieChart,
  LayoutTemplate,
  CheckSquare,
  Settings,
  ExternalLink,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    label: 'Operations',
    items: [
      { label: 'Overview', href: '/overview', icon: LayoutDashboard },
      { label: 'Intents', href: '/intents', icon: Activity },
      { label: 'Agreements', href: '/agreements', icon: FileSignature },
      { label: 'Workflows', href: '/workflows', icon: GitMerge },
      { label: 'My Tasks', href: '/my-tasks', icon: CheckSquare },
    ]
  },
  {
    label: 'Studio',
    items: [
      { label: 'People', href: '/people', icon: Users },
      { label: 'Resources', href: '/resources', icon: Package },
      { label: 'Services', href: '/services', icon: Layers },
      { label: 'Finances', href: '/finances', icon: DollarSign },
    ]
  },
  {
    label: 'Platform',
    items: [
      { label: 'Visual Engine', href: '/visual-layouts', icon: LayoutTemplate },
      { label: 'Analytics', href: '/analytics', icon: PieChart },
      { label: 'Settings', href: '/settings', icon: Settings },
    ]
  },
];

export function Sidebar({ studioName, orgSlug }: { studioName?: string; orgSlug?: string }) {
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
        <Link href="/dashboard" style={{ textDecoration: 'none' }}>
          <div style={{ fontWeight: 700, fontSize: '1.125rem', letterSpacing: '-0.02em', color: 'var(--q-color-ink-900)' }}>
            {studioName || 'Studio OS'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--q-color-ink-400)', marginTop: '2px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Studio Operating System
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

      {/* Footer: Storefront Link */}
      {orgSlug && (
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--q-color-ink-100)' }}>
          <a
            href={`/storefront/${orgSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '0.8rem',
              color: 'var(--q-color-ink-500)',
              border: '1px solid var(--q-color-ink-200)',
            }}
          >
            <ExternalLink size={14} />
            View Storefront
          </a>
        </div>
      )}
    </aside>
  );
}
