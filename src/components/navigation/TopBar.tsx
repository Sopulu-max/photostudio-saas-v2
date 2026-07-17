'use client';

import React from 'react';
import Link from 'next/link';

export default function TopBar({ studioName }: { studioName?: string }) {
  return (
    <>
      <header style={{ 
        height: '64px', 
        borderBottom: '1px solid var(--q-color-ink-100)', 
        background: 'var(--q-color-paper-elevated)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ fontWeight: 600, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>{studioName || 'Studio OS'}</div>
          <Link 
            href="/overview"
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: 'var(--q-color-ink-500)', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px',
              borderRadius: '6px',
              textDecoration: 'none'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'var(--q-color-ink-100)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"></rect>
              <rect x="14" y="3" width="7" height="7" rx="1"></rect>
              <rect x="14" y="14" width="7" height="7" rx="1"></rect>
              <rect x="3" y="14" width="7" height="7" rx="1"></rect>
            </svg>
            <span style={{ fontWeight: 500 }}>Dashboard</span>
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ 
            padding: '8px 16px', 
            background: 'var(--q-color-paper-subtle)', 
            border: '1px solid var(--q-color-ink-100)', 
            borderRadius: '20px',
            fontSize: '0.875rem',
            color: 'var(--q-color-ink-500)',
            width: '250px'
          }}>
            Search (Command Palette) ⌘K
          </div>
          <div style={{ width: '32px', height: '32px', background: 'var(--q-color-ink-100)', borderRadius: '50%' }}></div>
        </div>
      </header>

    </>
  );
}
