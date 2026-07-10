'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { defineServiceAction } from '@/app/actions/kernel';
import BuilderLayout from '@/components/builder/BuilderLayout';

export default function ComposeServicePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCommit = async (instances: any[]) => {
    setIsSubmitting(true);
    
    // Quick hack for demo purposes to extract data from instances
    const heroBlock = instances.find(i => i.type === 'Hero');
    const pricingBlock = instances.find(i => i.type === 'Pricing');
    
    const data = {
      name: heroBlock?.data?.title || 'New Service',
      description: heroBlock?.data?.subtitle || '',
      basePrice: pricingBlock?.data?.basePrice || 0
    };

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
    <BuilderLayout 
      context="service:new" 
      title="Create New Service"
      backHref="/catalog"
      onCommit={handleCommit} 
      isSubmitting={isSubmitting} 
    />
  );
}