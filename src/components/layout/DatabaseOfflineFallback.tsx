import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export function DatabaseOfflineFallback({ 
  retryAction 
}: { 
  retryAction?: () => void 
}) {
  return (
    <div style={{
      background: '#fee2e2',
      color: '#991b1b',
      padding: '16px 24px',
      borderRadius: '8px',
      marginBottom: '24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <AlertTriangle className="w-5 h-5 text-red-600" />
        <div>
          <h3 style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem' }}>Database Offline (Read-Only Mode)</h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', opacity: 0.8 }}>
            The operational memory is unreachable. You are viewing cached or empty data.
          </p>
        </div>
      </div>
      <button 
        onClick={retryAction || (() => window.location.reload())}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'rgba(153, 27, 27, 0.1)', color: '#991b1b',
          border: 'none', padding: '6px 12px', borderRadius: '4px',
          fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer'
        }}
      >
        <RefreshCw className="w-4 h-4" />
        {retryAction ? 'Try Again' : 'Refresh'}
      </button>
    </div>
  );
}
