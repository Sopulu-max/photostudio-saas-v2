import React from 'react';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { StateBadge } from '@/components/ontology/StateBadge';
import { StateTransitionControl } from '@/components/ontology/StateTransitionControl';
import { Invitation } from '@/components/ontology/Invitation';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { ServiceInstanceDTO, InstanceState } from '@/lib/domains/kernel/types';
import { getOrgId } from '@/lib/auth';
import { DatabaseOfflineFallback } from '@/components/layout/DatabaseOfflineFallback';

async function getInstancesData(orgId: string | null) {
  let instances: ServiceInstanceDTO[] = [];
  let dbOffline = false;

  if (orgId) {
    try {
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();
      const repo = new KernelRepository(supabase);
      const dbInstances = await repo.getInstancesByOrganization(orgId);
      if (dbInstances.length > 0) instances = dbInstances;
    } catch (error) {
      console.error("Database connection failed", error);
      dbOffline = true;
    }
  }
  
  return { instances, dbOffline };
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

export default async function PipelinePage() {
  const orgId = await getOrgId();
  const { instances, dbOffline } = await getInstancesData(orgId);

  if (dbOffline) {
    return <DatabaseOfflineFallback />;
  }

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
      <div 
        style={{ 
          display: 'flex', 
          overflowX: 'auto',
          gap: '24px',
          paddingBottom: '24px',
          alignItems: 'start',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
        className="pipeline-container"
      >
        {activeColumns.map(state => (
          <div 
            key={state} 
            style={{
              background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              minWidth: 'min(300px, 85vw)',
              flex: '1 0 auto',
              scrollSnapAlign: 'start',
              minHeight: '200px',
            }}
          >
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
                  background: inst.status === 'waiting' ? 'var(--color-surface-elevated)' : 'var(--color-surface-base)',
                  border: inst.status === 'waiting' 
                    ? '1px solid rgba(232, 93, 4, 0.4)' 
                    : '1px solid var(--color-border-subtle)',
                  boxShadow: inst.status === 'waiting' ? '0 0 12px rgba(232, 93, 4, 0.1)' : 'none',
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
