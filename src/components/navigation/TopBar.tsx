'use client';

import React from 'react';

export default function TopBar({ studioName }: { studioName?: string }) {
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
      <div style={{
        width: '30px',
        height: '30px',
        background: 'var(--q-color-ink-900)',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.7rem',
        color: 'white',
        fontWeight: 600,
        flexShrink: 0,
      }}>
        {studioName?.charAt(0)?.toUpperCase() || 'S'}
      </div>
    </header>
  );
}
