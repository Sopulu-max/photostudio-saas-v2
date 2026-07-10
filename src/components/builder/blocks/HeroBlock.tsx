import React from 'react';
import { Type } from 'lucide-react';
import { BlockDefinition } from '../types';

export const HeroBlockDefinition: BlockDefinition = {
  type: 'Hero',
  label: 'Hero Header',
  icon: <Type size={18} />,
  allowedContexts: 'all',
  defaultData: {
    title: 'Service Name',
    description: 'Describe the experience...',
  },
  fields: [
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      defaultValue: 'Service Name',
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      defaultValue: 'Describe the experience...',
    },
  ],
  renderCanvas: ({ data }) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <h1 style={{
        fontSize: '2.5rem',
        fontFamily: 'var(--font-family-serif)',
        color: 'var(--color-text-primary)',
        margin: '0 0 8px 0',
        lineHeight: 1.2
      }}>
        {data.title || 'Service Name'}
      </h1>
      <p style={{
        fontSize: '1.1rem',
        color: 'var(--color-text-secondary)',
        margin: 0,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap'
      }}>
        {data.description || 'Describe the experience...'}
      </p>
    </div>
  ),
};
