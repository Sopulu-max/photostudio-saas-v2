import React from 'react';

export default function InternalLoading() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      width: '100%',
      padding: '40px',
      color: 'var(--color-text-secondary)',
      fontFamily: 'var(--font-family-sans)'
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid var(--color-border-subtle)',
        borderTopColor: 'var(--color-primary)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '16px'
      }} />
      <p style={{ margin: 0, fontWeight: 500 }}>Connecting to Kernel...</p>
      <p style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '8px' }}>
        If this takes more than a few seconds, the database might be waking up from a paused state.
      </p>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
