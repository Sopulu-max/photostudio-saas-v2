'use client';

import React, { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

export function ContractForm({ contract, orgSlug }: { contract: any; orgSlug: string }) {
  const [basePrice, setBasePrice] = useState(contract.terms?.base_price || 0);
  const [depositPercent, setDepositPercent] = useState(contract.terms?.deposit_percentage || 50);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const portalUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/portal/${orgSlug}/contract/${contract.id}`
    : `/portal/${orgSlug}/contract/${contract.id}`;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaved(false);

    try {
      const res = await fetch(`/api/contracts/${contract.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terms: {
            ...contract.terms,
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
      alert('Failed to save contract terms.');
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
    proposed: 'var(--q-color-warm)',
    active: 'var(--q-color-success)',
    modified: 'var(--q-color-accent)',
    completed: 'var(--q-color-success)',
    cancelled: 'var(--q-color-danger)',
  };

  return (
    <div className="q-page-narrow">
      <header className="q-page-header q-row q-row-between">
        <div>
          <h1 className="q-page-title">Contract</h1>
          <p className="q-page-subtitle">For {contract.person?.display_name} — {contract.intent?.template?.name || 'Custom Service'}</p>
        </div>
        <span style={{
          padding: '6px 14px',
          borderRadius: '20px',
          fontSize: '0.8rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          border: '1px solid',
          borderColor: statusColors[contract.status] || 'var(--q-color-ink-400)',
          color: statusColors[contract.status] || 'var(--q-color-ink-400)',
        }}>
          {contract.status}
        </span>
      </header>

      <div className="q-stack q-stack-lg">

        {/* Pricing Terms */}
        <form onSubmit={handleSave} className="q-card q-stack q-stack-lg">
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Pricing Terms</h3>
          <div className="q-grid-2">
            <div>
              <label className="q-label">
                Total Price ({contract.terms?.currency || 'USD'})
              </label>
              <input
                type="number"
                value={basePrice}
                onChange={(e) => setBasePrice(parseFloat(e.target.value) || 0)}
                disabled={contract.status === 'active' || contract.status === 'completed'}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label className="q-label">
                Required Deposit (%)
              </label>
              <input
                type="number"
                value={depositPercent}
                onChange={(e) => setDepositPercent(parseInt(e.target.value) || 0)}
                disabled={contract.status === 'active' || contract.status === 'completed'}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div className="q-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.875rem' }}>
              <span className="q-muted">Total Value</span>
              <span className="q-strong">{contract.terms?.currency || 'USD'} {basePrice.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span className="q-muted">Deposit Required</span>
              <span className="q-strong">{contract.terms?.currency || 'USD'} {(basePrice * depositPercent / 100).toFixed(2)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            {saved && <span style={{ color: 'var(--q-color-success)', fontWeight: 500, alignSelf: 'center', fontSize: '0.875rem' }}>✓ Saved</span>}
            {contract.status !== 'active' && contract.status !== 'completed' && (
              <button type="submit" disabled={isSaving} className="q-btn q-btn-primary">
                {isSaving ? 'Saving...' : 'Save Terms'}
              </button>
            )}
          </div>
        </form>

        {/* Client Portal Links */}
        <div className="q-card q-stack q-stack-md">
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Client Portal Links</h3>
          <p className="q-meta">
            Share these links with the client at the appropriate stage of the project.
          </p>

          {/* Contract Signing Link */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--q-color-ink-600)', marginBottom: '6px' }}>Contract Signing</div>
            <div className="q-row">
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

