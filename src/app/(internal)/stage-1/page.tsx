'use client';

import React, { useState, useEffect } from 'react';
import { resolveEntityForAudience } from '@/lib/domains/presentation/resolver';
import { AudienceContext, FacingConfig } from '@/lib/domains/presentation/types';
import { globalSchemaRegistry } from '@/lib/domains/presentation/registry';
import { AttributeRenderer } from '@/components/presentation/AttributeRenderer';
import { FacingConfigurator } from '@/components/presentation/FacingConfigurator';
import { getFacingConfig, saveFacingConfig } from '@/app/actions/presentation';

// Hardcoded Organization for testing purposes
const DEMO_ORG_ID = '11111111-2222-3333-4444-555555555555';

// Mock service entity for testing the Presentation Engine
const mockServiceEntity = {
  id: 'srv-999',
  name: 'Drone Photography',
  pricingRules: {
    basePrice: 150000,
    depositRequired: true
  },
  description: 'Aerial shots covering up to 4 hours of event time.',
  status: 'active'
};

export default function Stage1ConfigurationEngine() {
  const [audienceRole, setAudienceRole] = useState<'staff' | 'public'>('staff');
  const [serviceData, setServiceData] = useState(mockServiceEntity);
  const [facingConfig, setFacingConfig] = useState<FacingConfig>({});
  const [resolvedData, setResolvedData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch the Studio's persisted configuration from the DB (The Sentences)
  useEffect(() => {
    async function loadConfig() {
      try {
        const config = await getFacingConfig(DEMO_ORG_ID);
        setFacingConfig(config);
      } catch (e) {
        console.error("Failed to load config, using defaults");
      } finally {
        setIsLoading(false);
      }
    }
    loadConfig();
  }, []);

  // 2. Resolve the payload anytime data, audience, or config changes
  useEffect(() => {


    const context: AudienceContext = audienceRole === 'staff' 
      ? { role: 'staff', id: 'staff-1' } 
      : { role: 'public', id: null };

    // The Resolver enforces the grammar and applies the studio's sentences
    const safeData = resolveEntityForAudience(serviceData, 'Service', context, facingConfig);
    setResolvedData(safeData);
  }, [serviceData, audienceRole, facingConfig]);

  const handleConfigChange = async (newConfig: FacingConfig) => {
    setFacingConfig(newConfig);
    setIsSaving(true);
    try {
      await saveFacingConfig(DEMO_ORG_ID, newConfig);
    } catch (e) {
      console.error("Failed to save", e);
      alert("Failed to save configuration to DB");
    } finally {
      setIsSaving(false);
    }
  };

  const updateServiceData = (path: string, value: any) => {
    const newData = JSON.parse(JSON.stringify(serviceData));
    const parts = path.split('.');
    let current = newData;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
    setServiceData(newData);
  };

  const schemas = globalSchemaRegistry.getEntitySchema('Service')?.attributes || {};

  if (isLoading) return <div className="p-8 text-white">Loading OS Kernel...</div>;

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-12 border-b border-zinc-800 pb-8">
          <h1 className="text-3xl font-bold mb-4">Stage 1: The Arrangement Engine</h1>
          <p className="text-zinc-400">
            Proving <strong className="text-indigo-400">Configuration Surface #12 (Presentation)</strong>.
            The developer owns the grammar (Ontology/Tiers), the studio owns the sentences (FacingConfig stored in DB).
          </p>
        </div>

        <div className="grid grid-cols-12 gap-8">
          
          {/* LEFT SIDE: The Configuration Engine (Studio's Control Panel) */}
          <div className="col-span-5 flex flex-col gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="font-semibold text-lg mb-2">Studio Settings (surface_configurations)</h2>
              <p className="text-sm text-zinc-500 mb-6">These settings are persisted to the database and govern how this studio projects its reality to the world.</p>
              
              <FacingConfigurator 
                config={facingConfig} 
                onChange={handleConfigChange} 
              />
              {isSaving && <div className="text-xs text-amber-500 mt-2">Saving to database...</div>}
            </div>
            
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="font-semibold text-lg mb-4">Audience Context Lens</h2>
              <div className="flex bg-black rounded p-1 border border-zinc-800">
                <button 
                  className={`flex-1 px-4 py-2 text-sm rounded transition-colors ${audienceRole === 'staff' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                  onClick={() => setAudienceRole('staff')}
                >
                  Staff (Internal)
                </button>
                <button 
                  className={`flex-1 px-4 py-2 text-sm rounded transition-colors ${audienceRole === 'public' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                  onClick={() => setAudienceRole('public')}
                >
                  Public (Website)
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE: The Resulting Projection */}
          <div className="col-span-7 flex flex-col gap-6">
            
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="bg-zinc-900 px-6 py-4 border-b border-zinc-800 flex justify-between items-center">
                <h2 className="font-semibold text-lg">Live Interface Projection</h2>
                <span className="text-xs px-2 py-1 bg-zinc-800 rounded text-zinc-400">
                  {audienceRole === 'staff' ? 'Builder Mode' : 'View Mode'}
                </span>
              </div>
              <div className="p-6">
                {Object.values(schemas).map(schema => {
                  const isEditMode = audienceRole === 'staff';
                  // Get nested value safely
                  const resolvedValue = schema.key.split('.').reduce((acc: any, part: string) => acc && acc[part], resolvedData);

                  // If the value was scrubbed by the resolver, don't render the attribute at all for public
                  if (resolvedValue === undefined && !isEditMode) return null;

                  return (
                    <AttributeRenderer 
                      key={schema.key}
                      schema={schema}
                      value={resolvedValue}
                      isEditMode={isEditMode}
                      onUpdate={updateServiceData}
                    />
                  );
                })}
              </div>
            </div>

            <div className="bg-black border border-zinc-800 rounded-xl overflow-hidden font-mono text-xs">
              <div className="bg-zinc-900 px-6 py-4 border-b border-zinc-800 flex justify-between">
                <span className="text-emerald-500">Kernel Output Payload</span>
                <span className="text-zinc-500">What hits the browser memory</span>
              </div>
              <div className="p-6 overflow-auto bg-zinc-950">
                <pre className="text-zinc-300">
                  {JSON.stringify(resolvedData, null, 2)}
                </pre>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
