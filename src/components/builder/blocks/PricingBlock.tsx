import React from 'react';
import { DollarSign } from 'lucide-react';
import { BlockDefinition } from '../types';

export const PricingBlockDefinition: BlockDefinition = {
  type: 'Pricing',
  label: 'Pricing Details',
  icon: <DollarSign size={18} />,
  allowedContexts: ['service:new', 'service:edit'],
  defaultData: {
    basePrice: '',
    currency: 'USD',
  },
  fields: [
    {
      name: 'basePrice',
      label: 'Base Price',
      type: 'number',
      defaultValue: '',
    },
    {
      name: 'currency',
      label: 'Currency',
      type: 'select',
      options: [
        { label: 'USD ($)', value: 'USD' },
        { label: 'EUR (€)', value: 'EUR' },
        { label: 'GBP (£)', value: 'GBP' },
        { label: 'NGN (₦)', value: 'NGN' },
      ],
      defaultValue: 'USD',
    },
  ],
  renderCanvas: ({ data }) => (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px 20px',
      background: 'var(--color-surface-elevated)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border-subtle)',
    }}>
      <DollarSign size={20} color="var(--color-text-secondary)" />
      <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
        {data.basePrice ? `${data.currency} ${data.basePrice}` : 'Free / Custom Pricing'}
      </div>
    </div>
  ),
};
