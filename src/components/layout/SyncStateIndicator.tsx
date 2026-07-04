"use client";

import React, { useEffect, useState } from 'react';

export function SyncStateIndicator() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Initial check
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      background: 'var(--color-state-waiting)',
      color: 'white',
      padding: '12px 24px',
      borderRadius: '24px',
      fontSize: '0.85rem',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 9999,
      animation: 'pulse 2s infinite'
    }}>
      <span style={{ 
        width: '8px', 
        height: '8px', 
        borderRadius: '50%', 
        background: 'white',
        display: 'inline-block' 
      }} />
      Operating Offline. Sync paused.
    </div>
  );
}
