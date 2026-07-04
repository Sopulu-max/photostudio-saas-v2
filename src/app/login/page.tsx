'use client';

import { useState, useTransition } from 'react';
import { signIn } from '@/app/actions/auth';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signIn(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-surface-base)',
      fontFamily: 'var(--font-family-sans)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        padding: '48px 40px',
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '12px',
      }}>

        {/* Wordmark */}
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <h1 style={{
            fontFamily: 'var(--font-family-serif)',
            fontSize: '2rem',
            fontWeight: 400,
            color: 'var(--color-text-primary)',
            margin: 0,
          }}>
            Studio
          </h1>
          <p style={{
            marginTop: '6px',
            fontSize: '0.85rem',
            color: 'var(--color-text-secondary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Internal Dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle} htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              style={inputStyle}
              placeholder="you@studio.com"
            />
          </div>

          <div style={{ marginBottom: '28px' }}>
            <label style={labelStyle} htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              style={inputStyle}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              marginBottom: '20px',
              padding: '12px 16px',
              background: 'rgba(180, 40, 40, 0.07)',
              border: '1px solid rgba(180, 40, 40, 0.2)',
              borderRadius: '6px',
              fontSize: '0.875rem',
              color: '#b42828',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            style={{
              width: '100%',
              padding: '12px',
              background: isPending ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
              color: 'var(--color-surface-elevated)',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.9rem',
              fontWeight: 500,
              fontFamily: 'var(--font-family-sans)',
              cursor: isPending ? 'not-allowed' : 'pointer',
              transition: 'opacity 150ms ease',
              letterSpacing: '0.02em',
            }}
          >
            {isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '0.8rem',
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--color-surface-base)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: '6px',
  fontSize: '0.95rem',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-family-sans)',
  outline: 'none',
  boxSizing: 'border-box',
};
