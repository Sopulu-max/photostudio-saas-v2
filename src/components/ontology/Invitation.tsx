import React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';

interface InvitationProps {
  label: string;
  /** If provided, wraps the invitation in a Link. Mutually exclusive with onClick. */
  href?: string;
  actionLabel?: string;
  onClick?: () => void;
}

/**
 * Invitation Empty State.
 * The reverse loop rule: Absence always renders as a door into a structure edit.
 * Accepts either an href (navigation) or an onClick (inline action).
 */
export function Invitation({ label, href, actionLabel, onClick }: InvitationProps) {
  const inner = (
    <div style={{
      width: '100%',
      padding: '48px 24px',
      background: 'transparent',
      border: '1px dashed var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      color: 'var(--color-text-secondary)',
      textAlign: 'center',
      transition: 'border-color var(--transition-fast), color var(--transition-fast)',
      cursor: 'pointer',
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        border: '1px dashed var(--color-border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Plus size={18} />
      </div>
      <div>
        <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
          {label}
        </div>
        {actionLabel && (
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>
            {actionLabel} →
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', display: 'block', width: '100%' }}>
        {inner}
      </Link>
    );
  }

  return (
    <button
      onClick={onClick}
      style={{ background: 'none', border: 'none', padding: 0, width: '100%', cursor: 'pointer' }}
    >
      {inner}
    </button>
  );
}
