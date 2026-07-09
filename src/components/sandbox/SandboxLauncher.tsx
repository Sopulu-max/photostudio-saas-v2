"use client";

import React, { useState } from 'react';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { launchSandboxAction } from '@/app/actions/sandbox';

export function SandboxLauncher() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLaunch() {
    setLoading(true);
    const result = await launchSandboxAction();
    if (result.success) {
      // Force hard refresh to pick up new session cookies
      window.location.href = '/';
    } else {
      setLoading(false);
      alert('Failed to launch sandbox: ' + result.error);
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100vw',
      backgroundColor: 'var(--color-surface-base)',
      backgroundImage: `
        radial-gradient(at 100% 0%, rgba(212, 175, 55, 0.08) 0px, transparent 50%),
        radial-gradient(at 0% 100%, rgba(212, 175, 55, 0.05) 0px, transparent 50%)
      `,
      fontFamily: 'var(--font-family-sans)',
    }}>
      <div style={{
        maxWidth: '500px',
        width: '100%',
        padding: '3rem',
        backgroundColor: 'var(--color-surface-glass)',
        backdropFilter: 'var(--glass-blur)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-surface-glass-border)',
        boxShadow: 'var(--shadow-xl)',
        textAlign: 'center',
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, #d4af37 0%, #b8962b 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 2rem auto',
          boxShadow: '0 0 30px rgba(212, 175, 55, 0.3)'
        }}>
          <Sparkles size={32} />
        </div>
        
        <h1 style={{ 
          fontSize: '2rem', 
          fontFamily: 'var(--font-family-serif)', 
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          marginBottom: '1rem'
        }}>
          Welcome to Studio OS
        </h1>
        
        <p style={{
          color: 'var(--color-text-secondary)',
          lineHeight: 1.6,
          marginBottom: '2.5rem'
        }}>
          The database is empty or paused. Launch the sandbox environment to instantly generate a demo studio and explore the Golden Path.
        </p>

        <button 
          onClick={handleLaunch}
          disabled={loading}
          style={{
            width: '100%',
            padding: '1rem',
            backgroundColor: '#1c1a18',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            transition: 'all var(--transition-fast)',
            opacity: loading ? 0.8 : 1,
            boxShadow: 'var(--shadow-md)'
          }}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="spin" /> Bootstrapping Sandbox...
            </>
          ) : (
            <>
              Launch Sandbox <ArrowRight size={18} />
            </>
          )}
        </button>

        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin { 100% { transform: rotate(360deg); } }
          .spin { animation: spin 1s linear infinite; }
        `}} />
      </div>
    </div>
  );
}
