import React from 'react';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { StateBadge } from '@/components/ontology/StateBadge';
import { StateTransitionControl } from '@/components/ontology/StateTransitionControl';
import { Invitation } from '@/components/ontology/Invitation';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { ServiceInstanceDTO, InstanceState } from '@/lib/domains/kernel/types';
import { MockScenarios } from '@/lib/domains/kernel/mock-scenarios';

// The hardcoded org ID — will be replaced with auth context later.
const ORG_ID = '11111111-2222-3333-4444-555555555555';

async function getInstances(): Promise<ServiceInstanceDTO[]> {
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const repo = new KernelRepository(supabase);
    const instances = await repo.getInstancesByOrganization(ORG_ID);
    if (instances.length > 0) return instances;
  } catch {
    // Database unavailable — fall through to mock data
  }
  
  // Graceful degradation: use mock fixtures
  const { passport, wedding } = MockScenarios;
  return [passport.instance, ...wedding.instances];
}

// Group instances by state for the pipeline columns
function groupByState(instances: ServiceInstanceDTO[]) {
  const groups: Record<string, ServiceInstanceDTO[]> = {};
  for (const inst of instances) {
    const state = inst.status;
    if (!groups[state]) groups[state] = [];
    groups[state].push(inst);
  }
  return groups;
}

// Define the pipeline column order — active work first, terminal states last
const PIPELINE_ORDER: InstanceState[] = [
  'created', 'scheduled', 'in_progress', 'waiting',
  'halted', 'completed', 'delivered', 'archived',
];

const STATE_LABELS: Record<string, string> = {
  created: 'Created',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  halted: 'Halted',
  completed: 'Completed',
  delivered: 'Delivered',
  archived: 'Archived',
};

export default async function InstancesPage() {
  const instances = await getInstances();
  const grouped = groupByState(instances);

  // Only show columns that have instances in them (plus always show in_progress)
  const activeColumns = PIPELINE_ORDER.filter(
    state => state === 'in_progress' || (grouped[state] && grouped[state].length > 0)
  );

  return (
    <div style={{ padding: '40px' }}>
      
      {/* Page Header */}
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ 
          fontFamily: 'var(--font-family-serif)', 
          fontSize: '2rem', 
          marginBottom: '8px' 
        }}>
          Active Instances
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
          The operational pipeline. Every service instance your studio is working on, grouped by state.
        </p>
      </div>

      {/* Pipeline Columns */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: `repeat(${Math.min(activeColumns.length, 4)}, 1fr)`,
        gap: '24px',
        alignItems: 'start'
      }}>
        {activeColumns.map(state => (
          <div key={state} style={{
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '8px',
            padding: '20px',
            minHeight: '200px',
          }}>
            {/* Column Header */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '20px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--color-border-subtle)',
            }}>
              <StateBadge state={state} label={STATE_LABELS[state]} />
              <span style={{ 
                fontSize: '0.8rem', 
                color: 'var(--color-text-secondary)',
                fontWeight: 600 
              }}>
                {(grouped[state] || []).length}
              </span>
            </div>

            {/* Instance Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(grouped[state] || []).map(inst => (
                <div key={inst.id} style={{
                  background: 'var(--color-surface-base)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: '6px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}>
                  <EntitySignature type="service_instance" data={inst} scale="row" />
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    paddingTop: '4px',
                    borderTop: '1px solid var(--color-border-subtle)'
                  }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      Move to:
                    </span>
                    <StateTransitionControl 
                      instanceId={inst.id} 
                      currentState={inst.status} 
                    />
                  </div>
                </div>
              ))}

              {/* Empty column: Invitation */}
              {(!grouped[state] || grouped[state].length === 0) && (
                <Invitation label={`No ${STATE_LABELS[state]} instances`} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
