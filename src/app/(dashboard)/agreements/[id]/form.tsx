'use client';

import React, { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

export function AgreementForm({ agreement, orgSlug }: { agreement: any; orgSlug: string }) {
  const [basePrice, setBasePrice] = useState(agreement.terms?.base_price || 0);
  const [depositPercent, setDepositPercent] = useState(agreement.terms?.deposit_percentage || 50);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const portalUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/portal/${orgSlug}/agreement/${agreement.id}`
    : `/portal/${orgSlug}/agreement/${agreement.id}`;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaved(false);

    try {
      const res = await fetch(`/api/agreements/${agreement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terms: {
            ...agreement.terms,
            base_price: basePrice,
            deposit_percentage: depositPercent,
          },
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error(error);
      alert('Failed to save agreement terms.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusColors: Record<string, string> = {
    proposed: '#d97706',
    active: '#059669',
    modified: '#7c3aed',
    completed: '#059669',
    cancelled: '#dc2626',
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '64px' }}>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="q-page-title">Agreement</h1>
          <p className="q-page-subtitle">For {agreement.person?.display_name} — {agreement.intent?.template?.name || 'Custom Service'}</p>
        </div>
        <span style={{
          padding: '6px 14px',
          borderRadius: '20px',
          fontSize: '0.8rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          border: '1px solid',
          borderColor: statusColors[agreement.status] || '#94a3b8',
          color: statusColors[agreement.status] || '#94a3b8',
        }}>
          {agreement.status}
        </span>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Pricing Terms */}
        <form onSubmit={handleSave} className="q-card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Pricing Terms</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>
                Total Price ({agreement.terms?.currency || 'USD'})
              </label>
              <input
                type="number"
                value={basePrice}
                onChange={(e) => setBasePrice(parseFloat(e.target.value) || 0)}
                disabled={agreement.status === 'active' || agreement.status === 'completed'}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>
                Required Deposit (%)
              </label>
              <input
                type="number"
                value={depositPercent}
                onChange={(e) => setDepositPercent(parseInt(e.target.value) || 0)}
                disabled={agreement.status === 'active' || agreement.status === 'completed'}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ padding: '16px', background: 'var(--q-color-paper-subtle)', borderRadius: '8px', border: '1px solid var(--q-color-ink-100)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--q-color-ink-600)' }}>Total Value</span>
              <span style={{ fontWeight: 600 }}>{agreement.terms?.currency || 'USD'} {basePrice.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--q-color-ink-600)' }}>Deposit Required</span>
              <span style={{ fontWeight: 600 }}>{agreement.terms?.currency || 'USD'} {(basePrice * depositPercent / 100).toFixed(2)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            {saved && <span style={{ color: '#059669', fontWeight: 500, alignSelf: 'center', fontSize: '0.875rem' }}>✓ Saved</span>}
            {agreement.status !== 'active' && agreement.status !== 'completed' && (
              <button type="submit" disabled={isSaving} className="q-btn q-btn-primary">
                {isSaving ? 'Saving...' : 'Save Terms'}
              </button>
            )}
          </div>
        </form>

        {/* Client Portal Links */}
        <div className="q-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Client Portal Links</h3>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>
            Share these links with the client at the appropriate stage of the project.
          </p>

          {/* Agreement Signing Link */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--q-color-ink-600)', marginBottom: '6px' }}>Agreement Signing</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                readOnly
                value={portalUrl}
                style={{ flex: 1, padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)', backgroundColor: 'var(--q-color-ink-50)', color: 'var(--q-color-ink-700)', fontSize: '0.8rem', fontFamily: 'monospace' }}
              />
              <button type="button" className="q-btn q-btn-secondary" onClick={handleCopy} style={{ flexShrink: 0, padding: '9px 14px' }}>
                {copied ? <Check size={16} color="green" /> : <Copy size={16} />}
              </button>
              <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="q-btn q-btn-secondary" style={{ flexShrink: 0, padding: '9px 14px', display: 'flex', alignItems: 'center' }}>
                <ExternalLink size={16} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

