import React from 'react';
import { FacingConfig } from '@/lib/domains/presentation/types';
import { SchemaRegistry } from '@/lib/domains/presentation/schema-registry';

interface FacingConfiguratorProps {
  config: FacingConfig;
  onChange: (newConfig: FacingConfig) => void;
}

export function FacingConfigurator({ config, onChange }: FacingConfiguratorProps) {
  // Extract all attributes that are configurable from the registry
  const configurableKeys = Object.keys(SchemaRegistry).filter(
    (key) => 
      SchemaRegistry[key] === 'configurable_closed' || 
      SchemaRegistry[key] === 'configurable_open'
  );

  const handleToggle = (key: string, defaultOpen: boolean) => {
    const currentValue = config[key] !== undefined ? config[key] : defaultOpen;
    onChange({
      ...config,
      [key]: !currentValue
    });
  };

  return (
    <div style={{
      border: '1px solid var(--color-border-subtle)',
      padding: '16px',
      borderRadius: '8px',
      background: 'var(--color-surface-elevated)'
    }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Presentation Config: Facing Exposure
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {configurableKeys.map((key) => {
          const tier = SchemaRegistry[key];
          const defaultOpen = tier === 'configurable_open';
          const isExposed = config[key] !== undefined ? config[key] : defaultOpen;

          return (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{key}</span>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  Default: {defaultOpen ? 'Open (Visible)' : 'Closed (Hidden)'}
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isExposed}
                  onChange={() => handleToggle(key, defaultOpen)}
                  style={{ marginRight: '8px', width: '16px', height: '16px' }}
                />
                <span style={{ fontSize: '0.85rem', fontWeight: 500, color: isExposed ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                  {isExposed ? 'EXPOSED' : 'HIDDEN'}
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
