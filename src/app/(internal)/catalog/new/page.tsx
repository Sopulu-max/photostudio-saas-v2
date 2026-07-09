'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { defineServiceAction } from '@/app/actions/kernel';
import BuilderCanvas from '@/components/builder/BuilderCanvas';

export default function ComposeServicePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCommit = async (data: any) => {
    setIsSubmitting(true);
    
    const pricingRules = data.basePrice ? { basePrice: Number(data.basePrice) } : undefined;
    
    // Creation as Composition: the builder's state translates directly into kernel operations
    const res = await defineServiceAction({
      name: data.name,
      description: data.description,
      pricingRules
    });
    
    if (res.success) {
      router.push('/catalog');
    } else {
      alert(res.error);
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '40px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ marginBottom: '60px', maxWidth: '800px', margin: '0 auto 60px auto', width: '100%' }}>
        <button onClick={() => router.back()} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: 0, fontSize: '0.9rem' }}>
          ← Back to Catalog
        </button>
      </header>

      <BuilderCanvas 
        context="service:new" 
        onCommit={handleCommit} 
        isSubmitting={isSubmitting} 
      />
    </div>
  );
}
