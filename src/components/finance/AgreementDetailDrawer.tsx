'use client';

import React, { useState } from 'react';
import { X, Clock, FileText } from 'lucide-react';

export function AgreementDetailDrawer({ agreement, events = [] }: { agreement: any, events?: any[] }) {
  const [isOpen, setIsOpen] = useState(false);

  // Extract agreement events
  const history = events
    .filter(e => e.entity_id === agreement.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          padding: '6px 12px',
          fontSize: '0.8rem',
          background: 'var(--color-surface-muted)',
          color: 'var(--color-text-secondary)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        <FileText className="w-4 h-4" />
        View Ledger History
      </button>

      {isOpen && (
        <div style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: '100%',
          maxWidth: '500px',
          background: 'var(--color-surface)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--color-border)',
        }}>
          {/* Header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--color-surface-elevated)'
          }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-family-serif)', margin: 0 }}>
                Agreement Ledger
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                AGR-{agreement.id.slice(0,8).toUpperCase()}
              </p>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>Current Terms</h3>
            <div style={{ 
              background: 'var(--color-surface-muted)', 
              padding: '16px', 
              borderRadius: '6px',
              border: '1px solid var(--color-border-subtle)',
              marginBottom: '32px'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.9rem' }}>
                <div>
                  <span style={{ color: 'var(--color-text-tertiary)', display: 'block', fontSize: '0.75rem' }}>Price</span>
                  <span style={{ fontWeight: 600 }}>{agreement.terms?.price ? `${agreement.terms.price} ${agreement.terms.currency || 'NGN'}` : 'N/A'}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-tertiary)', display: 'block', fontSize: '0.75rem' }}>Deliverables</span>
                  <span>{agreement.terms?.deliverables || 'Standard'}</span>
                </div>
                {agreement.terms?.turnaroundDays && (
                  <div>
                    <span style={{ color: 'var(--color-text-tertiary)', display: 'block', fontSize: '0.75rem' }}>Turnaround</span>
                    <span>{agreement.terms.turnaroundDays} days</span>
                  </div>
                )}
              </div>
            </div>

            <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock className="w-4 h-4" /> Modification Timeline
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {history.length > 0 ? history.map(evt => (
                <div key={evt.id} style={{
                  padding: '12px',
                  borderLeft: '2px solid var(--color-border)',
                  background: 'var(--color-surface-base)',
                  position: 'relative'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '0.85rem' }}>{evt.event_type}</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                      {new Date(evt.created_at).toLocaleString()}
                    </span>
                  </div>
                  {evt.payload && Object.keys(evt.payload).length > 0 && (
                    <pre style={{ 
                      margin: '8px 0 0', 
                      fontSize: '0.75rem', 
                      color: 'var(--color-text-secondary)',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {JSON.stringify(evt.payload, null, 2)}
                    </pre>
                  )}
                </div>
              )) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-tertiary)' }}>No historical events recorded.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
