'use client';

import React from 'react';

export function PrintButton() {
  return (
    <button 
      onClick={() => window.print()} 
      className="q-btn q-btn-secondary q-btn-block hide-on-print"
      style={{ marginTop: '16px' }}
    >
      Print / Save as PDF
    </button>
  );
}
