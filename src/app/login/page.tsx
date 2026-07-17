import Link from 'next/link';
import { login } from './actions';

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
      <div className="q-card" style={{ width: '100%', maxWidth: '400px' }}>
        <h1 className="q-page-title" style={{ fontSize: '1.5rem', marginBottom: '8px', textAlign: 'center' }}>
          Welcome back
        </h1>
        <p className="q-page-subtitle" style={{ fontSize: '0.875rem', marginBottom: '24px', textAlign: 'center' }}>
          Log in to your Weave account
        </p>

        {searchParams.error && (
          <div style={{ padding: '12px', marginBottom: '24px', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#991b1b', fontSize: '0.875rem', border: '1px solid #fecaca' }}>
            {searchParams.error}
          </div>
        )}

        <form action={login} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="email" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Email Address</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@studio.com"
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--q-color-ink-300)',
                fontSize: '1rem',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="password" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--q-color-ink-300)',
                fontSize: '1rem',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <button type="submit" className="q-btn q-btn-primary" style={{ marginTop: '16px', padding: '12px', fontSize: '1rem' }}>
            Log In
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>
          Don't have an account?{' '}
          <Link href="/signup" style={{ color: 'var(--q-color-accent)', fontWeight: 500, textDecoration: 'none' }}>
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
