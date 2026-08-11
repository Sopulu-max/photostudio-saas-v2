'use client';

import React from 'react';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
import type { Notification } from '@/kernel/notifications';

export default function TopBar({
  studioName,
  notifications = [],
  unreadCount = 0,
  organizationId,
  contactId,
}: {
  studioName?: string;
  notifications?: Notification[];
  unreadCount?: number;
  organizationId?: string;
  contactId?: string | null;
}) {
  return (
    <header style={{
      height: '52px',
      borderBottom: '1px solid var(--q-color-ink-100)',
      background: 'var(--q-color-paper)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      padding: '0 24px',
      gap: '16px',
      position: 'sticky',
      top: 0,
      zIndex: 30,
    }}>
      <div style={{
        padding: '6px 14px',
        background: 'var(--q-color-paper-subtle)',
        border: '1px solid var(--q-color-ink-100)',
        borderRadius: '20px',
        fontSize: '0.8rem',
        color: 'var(--q-color-ink-400)',
        width: '220px',
        cursor: 'text',
      }}>
        Search ⌘K
      </div>
      <NotificationBell
        items={notifications}
        unreadCount={unreadCount}
        organizationId={organizationId}
        contactId={contactId}
      />
      <ThemeToggle />
      <div style={{
        width: '30px',
        height: '30px',
        background: 'var(--q-color-ink-900)',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.7rem',
        color: 'var(--q-color-paper-base)',
        fontWeight: 600,
        flexShrink: 0,
      }}>
        {studioName?.charAt(0)?.toUpperCase() || 'S'}
      </div>
    </header>
  );
}
