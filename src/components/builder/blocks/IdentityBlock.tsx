import React from 'react';
import { Palette } from 'lucide-react';
import { BlockDefinition } from '../types';

export const IdentityBlockDefinition: BlockDefinition = {
  type: 'Identity',
  label: 'Brand Configuration',
  icon: <Palette size={18} />,
  allowedContexts: ['identity'],
  defaultData: {
    name: 'Studio Name',
    logoUrl: '',
    primaryColor: '#000000',
    headingFont: 'serif',
    email: '',
  },
  fields: [
    {
      name: 'name',
      label: 'Studio Name',
      type: 'text',
      defaultValue: '',
    },
    {
      name: 'logoUrl',
      label: 'Logo URL',
      type: 'text',
      defaultValue: '',
    },
    {
      name: 'primaryColor',
      label: 'Primary Brand Color',
      type: 'color',
      defaultValue: '#000000',
    },
    {
      name: 'headingFont',
      label: 'Heading Font',
      type: 'select',
      options: [
        { label: 'Serif', value: 'serif' },
        { label: 'Sans-Serif', value: 'sans-serif' },
        { label: 'Monospace', value: 'monospace' },
      ],
      defaultValue: 'serif',
    },
    {
      name: 'email',
      label: 'Public Email',
      type: 'text',
      defaultValue: '',
    },
  ],
  renderCanvas: ({ data }) => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '16px',
      padding: '40px',
      background: 'var(--color-surface-elevated)',
      borderRadius: 'var(--radius-xl)',
      border: `2px solid ${data.primaryColor || 'var(--color-border-subtle)'}`,
    }}>
      {data.logoUrl ? (
        <img src={data.logoUrl} alt={data.name} style={{ maxWidth: '120px', maxHeight: '120px', borderRadius: '8px' }} />
      ) : (
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: data.primaryColor || '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '2rem', fontWeight: 'bold' }}>
          {(data.name || 'S')[0].toUpperCase()}
        </div>
      )}
      <h1 style={{
        fontFamily: data.headingFont === 'serif' ? 'var(--font-family-serif)' : 'var(--font-family-sans)',
        fontSize: '2rem',
        margin: 0,
        color: 'var(--color-text-primary)'
      }}>
        {data.name || 'Studio Name'}
      </h1>
      {data.email && (
        <div style={{ color: 'var(--color-text-secondary)', fontSize: '1rem' }}>
          {data.email}
        </div>
      )}
    </div>
  ),
};
