"use client";

import React from 'react';
import { Plus } from 'lucide-react';

interface InvitationProps {
  label: string;
  onClick?: () => void;
}

/**
 * Invitation Empty State.
 * The reverse loop rule: Absence always renders as a door into a structure edit.
 */
export function Invitation({ label, onClick }: InvitationProps) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '24px',
        background: 'transparent',
        border: '1px dashed var(--color-border-subtle)',
        borderRadius: '6px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        color: 'var(--color-text-secondary)',
        cursor: 'pointer',
        transition: 'border-color var(--transition-fast), color var(--transition-fast)'
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-focus)';
        e.currentTarget.style.color = 'var(--color-text-primary)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
        e.currentTarget.style.color = 'var(--color-text-secondary)';
      }}
    >
      <Plus size={20} />
      <span style={{ fontSize: '0.9rem', fontWeight: 500, letterSpacing: '0.02em' }}>{label}</span>
    </button>
  );
}
