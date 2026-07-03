'use client';

import React, { useState, useEffect } from 'react';
import { resolveEntityForAudience } from '@/lib/domains/presentation/resolver';
import { AudienceContext } from '@/lib/domains/presentation/types';
import { globalSchemaRegistry } from '@/lib/domains/presentation/registry';
import { AttributeRenderer } from '@/components/presentation/AttributeRenderer';

// A mock customer entity (what we'd get from the Repository)
// This entity has both kernel-native fields (email) and studio-defined custom fields (internalRiskScore).
const mockCustomerEntity = {
  id: 'cust-12345',
  email: 'jane.doe@example.com',
  phone: '+15550198',
  profileData: {
    name: 'Jane Doe',
    internalRiskScore: 85, // Custom field that the studio added
  }
};

export default function Stage0SpecimenPage() {
  const [audienceRole, setAudienceRole] = useState<'staff' | 'customer'>('staff');
  const [customerData, setCustomerData] = useState(mockCustomerEntity);
  const [resolvedData, setResolvedData] = useState<any>({});

  // 1. Simulate the Studio registering a Custom Schema (Grammar)
  useEffect(() => {
    globalSchemaRegistry.registerCustomAttribute('Customer', {
      key: 'profileData.internalRiskScore',
      label: 'Internal Risk Score',
      type: 'number',
      facingTier: 'never_external', // F1 Law: The studio marks this as strictly internal
    });
  }, []);

  // 2. The Audience-Context Resolver runs every time the data or audience changes
  useEffect(() => {
    const context: AudienceContext = audienceRole === 'staff' 
      ? { role: 'staff', id: 'staff-1' } 
      : { role: 'customer', id: 'cust-12345' }; // Mock counterparty auth

    const safeData = resolveEntityForAudience(customerData, 'Customer', context);
    setResolvedData(safeData);
  }, [customerData, audienceRole]);

  // Helper to get nested value safely
  const getValue = (obj: any, path: string) => {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  };

  const updateCustomerData = (path: string, value: any) => {
    const newData = JSON.parse(JSON.stringify(customerData));
    const parts = path.split('.');
    let current = newData;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
    setCustomerData(newData);
  };

  // Get schema definitions for rendering
  const schemas = globalSchemaRegistry.getEntitySchema('Customer')?.attributes || {};

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-12">
          <h1 className="text-3xl font-bold mb-4">Stage 0 Specimen: Substrate</h1>
          <p className="text-zinc-400 mb-6">
            Proving the <strong className="text-indigo-400">Schema Registry</strong>, the <strong className="text-indigo-400">Audience-Context Resolver</strong>, and <strong className="text-indigo-400">Invitations</strong>.
          </p>

          <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-800 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Audience Context Lens</h3>
              <p className="text-sm text-zinc-500">How the Presentation Engine views the graph</p>
            </div>
            <div className="flex bg-black rounded p-1 border border-zinc-800">
              <button 
                className={`px-4 py-2 text-sm rounded ${audienceRole === 'staff' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                onClick={() => setAudienceRole('staff')}
              >
                Staff (Builder)
              </button>
              <button 
                className={`px-4 py-2 text-sm rounded ${audienceRole === 'customer' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                onClick={() => setAudienceRole('customer')}
              >
                Customer Portal
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8">
          {/* LEFT SIDE: The Fixed UI Projection */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="bg-zinc-900 px-6 py-4 border-b border-zinc-800">
              <h2 className="font-semibold text-lg">Customer Profile Surface</h2>
            </div>
            <div className="p-6">
              {Object.values(schemas).map(schema => {
                // If the user is staff, they see the Edit Lens (isEditMode = true)
                // If they are a customer, they see a fixed read-only projection
                const isEditMode = audienceRole === 'staff';
                const resolvedValue = getValue(resolvedData, schema.key);

                return (
                  <AttributeRenderer 
                    key={schema.key}
                    schema={schema}
                    value={resolvedValue}
                    isEditMode={isEditMode}
                    onUpdate={updateCustomerData}
                  />
                );
              })}
            </div>
          </div>

          {/* RIGHT SIDE: Technical Verification (The JSON Payload) */}
          <div className="bg-black border border-zinc-800 rounded-xl overflow-hidden font-mono text-xs">
            <div className="bg-zinc-900 px-6 py-4 border-b border-zinc-800 flex justify-between">
              <span className="text-emerald-500">Resolved Payload</span>
              <span className="text-zinc-500">Output of the Resolver</span>
            </div>
            <div className="p-6 overflow-auto">
              <pre className="text-zinc-300">
                {JSON.stringify(resolvedData, null, 2)}
              </pre>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
