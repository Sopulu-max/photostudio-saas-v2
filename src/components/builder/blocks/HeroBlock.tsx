'use client';

import React from 'react';

interface HeroBlockProps {
  name: string;
  description: string;
  onChange: (name: string, description: string) => void;
}

export default function HeroBlock({ name, description, onChange }: HeroBlockProps) {
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        position: 'absolute',
        top: '-10px',
        left: '-16px',
        background: 'var(--color-surface-elevated)',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.7rem',
        color: 'var(--color-primary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        border: '1px solid var(--color-border-subtle)',
        opacity: 0.8
      }}>
        Hero Renderer
      </div>
      
      <input
        type="text"
        placeholder="Service Name (e.g. Luxury Portrait)"
        value={name}
        onChange={e => onChange(e.target.value, description)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid transparent',
          fontSize: '2.5rem',
          fontFamily: 'var(--font-family-serif)',
          color: 'var(--color-text)',
          padding: '8px 0',
          margin: '0 0 8px 0',
          outline: 'none',
          transition: 'border-color 0.2s',
          lineHeight: 1.2
        }}
        autoFocus
        className="builder-input-title"
      />

      <textarea
        placeholder="Describe the experience to the client..."
        value={description}
        onChange={e => onChange(name, e.target.value)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid transparent',
          fontSize: '1.1rem',
          color: 'var(--color-text-secondary)',
          padding: '8px 0',
          outline: 'none',
          minHeight: '60px',
          resize: 'none',
          lineHeight: 1.6,
          transition: 'border-color 0.2s'
        }}
        className="builder-input-desc"
      />
      
      <style dangerouslySetInnerHTML={{__html: `
        .builder-input-title:hover, .builder-input-desc:hover {
          border-bottom-color: var(--color-border-subtle) !important;
        }
        .builder-input-title:focus, .builder-input-desc:focus {
          border-bottom-color: var(--color-primary) !important;
        }
      `}} />
    </div>
  );
}
