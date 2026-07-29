import Link from 'next/link';
import { signup } from './actions';

export default function SignupPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="q-centered">
      <div className="q-card q-card-narrow">
        <h1 className="q-page-title" style={{ fontSize: '1.5rem', marginBottom: '8px', textAlign: 'center' }}>
          Create an account
        </h1>
        <p className="q-page-subtitle" style={{ fontSize: '0.875rem', marginBottom: '24px', textAlign: 'center' }}>
          Start running your studio with Weave
        </p>

        {searchParams.error && (
          <div className="q-note q-note-bad" style={{ marginBottom: '24px' }}>
            {searchParams.error}
          </div>
        )}

        <form className="q-stack q-stack-md" action={signup}>
          <div className="q-stack q-stack-sm">
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

          <div className="q-stack q-stack-sm">
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
            Sign Up
          </button>
        </form>

        <div className="q-meta q-center-text">
          Already have an account?{' '}
          <Link className="q-accent q-strong" href="/login">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
