import React from 'react';
import Link from 'next/link';
import { 
  Layers, 
  Briefcase, 
  User, 
  ArrowRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Activity
} from 'lucide-react';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { StateBadge, KernelState } from '@/components/ontology/StateBadge';
import { Invitation } from '@/components/ontology/Invitation';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { ServiceInstanceDTO, AgreementDTO } from '@/lib/domains/kernel/types';
import { MockScenarios } from '@/lib/domains/kernel/mock-scenarios';

const ORG_ID = '11111111-2222-3333-4444-555555555555';

// Ensure this page is server-rendered on each request (not statically pre-rendered)
export const dynamic = 'force-dynamic';

async function getDashboardData() {
  let instances: ServiceInstanceDTO[] = [];
  let agreements: AgreementDTO[] = [];

  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const repo = new KernelRepository(supabase);
    
    const [dbInstances, dbAgreements] = await Promise.all([
      repo.getInstancesByOrganization(ORG_ID),
      repo.getAgreementsByOrganization(ORG_ID),
    ]);
    
    if (dbInstances.length > 0) instances = dbInstances;
    if (dbAgreements.length > 0) agreements = dbAgreements;
  } catch {
    // Database unavailable — fall through to mock data
  }

  // Graceful degradation
  if (instances.length === 0) {
    const { passport, wedding } = MockScenarios;
    instances = [passport.instance, ...wedding.instances];
    agreements = [passport.agreement, wedding.agreement];
  }

  return { instances, agreements };
}

export default async function CommandCenterPage() {
  const { instances, agreements } = await getDashboardData();

  // Derive metrics from the kernel data
  const needsAttention = instances.filter(i => i.status === 'waiting' || i.status === 'halted');
  const inProgress = instances.filter(i => i.status === 'in_progress');
  const scheduled = instances.filter(i => i.status === 'scheduled' || i.status === 'created');
  const completed = instances.filter(i => 
    i.status === 'completed' || i.status === 'delivered' || i.status === 'archived'
  );
  const activeAgreements = agreements.filter(a => a.status === 'active');

  // Total revenue from active agreements
  const totalRevenue = activeAgreements.reduce((sum, a) => {
    const price = a.terms?.price;
    return sum + (typeof price === 'number' ? price : 0);
  }, 0);
  const currency = activeAgreements[0]?.terms?.currency || 'NGN';

  return (
    <div style={{ padding: '40px', maxWidth: '1100px' }}>

      {/* Greeting */}
      <div style={{ marginBottom: '48px' }}>
        <h1 style={{ 
          fontFamily: 'var(--font-family-serif)', 
          fontSize: '2.4rem', 
          fontWeight: 700,
          marginBottom: '6px',
          lineHeight: 1.2,
        }}>
          Command Center
        </h1>
        <p style={{ 
          color: 'var(--color-text-secondary)', 
          fontSize: '1rem',
          lineHeight: 1.5,
        }}>
          {instances.length} instance{instances.length !== 1 ? 's' : ''} across {agreements.length} agreement{agreements.length !== 1 ? 's' : ''}.
        </p>
      </div>

      {/* Metric Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '16px', 
        marginBottom: '48px' 
      }}>
        <MetricCard 
          icon={<AlertTriangle size={18} />}
          label="Needs Attention" 
          value={needsAttention.length}
          accent={needsAttention.length > 0 ? 'var(--color-state-waiting)' : undefined}
        />
        <MetricCard 
          icon={<Activity size={18} />}
          label="In Progress" 
          value={inProgress.length}
          accent={inProgress.length > 0 ? 'var(--color-state-active)' : undefined}
        />
        <MetricCard 
          icon={<Clock size={18} />}
          label="Scheduled" 
          value={scheduled.length}
        />
        <MetricCard 
          icon={<CheckCircle2 size={18} />}
          label="Completed" 
          value={completed.length}
          accent={completed.length > 0 ? 'var(--color-state-success)' : undefined}
        />
      </div>

      {/* Two-column layout: Attention Queue + Ledger Summary */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '24px',
        marginBottom: '48px',
      }}>

        {/* LEFT: Attention Queue */}
        <section style={{
          background: 'var(--color-surface-elevated)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '8px',
          padding: '24px',
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}>
            <h2 style={{ 
              fontSize: '0.85rem', 
              textTransform: 'uppercase', 
              letterSpacing: '0.08em',
              color: 'var(--color-text-secondary)',
              fontWeight: 600,
            }}>
              Attention Queue
            </h2>
            <Link href="/instances" style={{ 
              fontSize: '0.8rem', 
              color: 'var(--color-state-active)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              View Pipeline <ArrowRight size={14} />
            </Link>
          </div>

          {needsAttention.length === 0 ? (
            <div style={{ 
              padding: '24px', 
              textAlign: 'center', 
              color: 'var(--color-text-tertiary)',
              fontSize: '0.9rem',
            }}>
              All clear. Nothing waiting or halted.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {needsAttention.map(inst => (
                <div key={inst.id} style={{
                  padding: '12px',
                  background: 'var(--color-surface-base)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: '6px',
                }}>
                  <EntitySignature type="service_instance" data={inst} scale="row" />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* RIGHT: Ledger Summary */}
        <section style={{
          background: 'var(--color-surface-elevated)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '8px',
          padding: '24px',
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}>
            <h2 style={{ 
              fontSize: '0.85rem', 
              textTransform: 'uppercase', 
              letterSpacing: '0.08em',
              color: 'var(--color-text-secondary)',
              fontWeight: 600,
            }}>
              Active Agreements
            </h2>
            <Link href="/finance" style={{ 
              fontSize: '0.8rem', 
              color: 'var(--color-state-active)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              View Ledger <ArrowRight size={14} />
            </Link>
          </div>

          {/* Revenue headline */}
          {totalRevenue > 0 && (
            <div style={{ 
              marginBottom: '20px', 
              paddingBottom: '16px',
              borderBottom: '1px solid var(--color-border-subtle)',
            }}>
              <div style={{ 
                fontSize: '0.75rem', 
                textTransform: 'uppercase', 
                letterSpacing: '0.06em',
                color: 'var(--color-text-tertiary)',
                marginBottom: '4px',
              }}>
                Active Revenue
              </div>
              <div style={{ 
                fontSize: '1.8rem', 
                fontWeight: 700,
                fontFamily: 'var(--font-family-sans)',
                letterSpacing: '-0.02em',
              }}>
                {currency} {totalRevenue.toLocaleString()}
              </div>
            </div>
          )}

          {activeAgreements.length === 0 ? (
            <Invitation label="No active agreements" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activeAgreements.slice(0, 4).map(agr => (
                <div key={agr.id} style={{
                  padding: '12px',
                  background: 'var(--color-surface-base)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <EntitySignature type="agreement" data={agr} scale="chip" />
                  <span style={{ 
                    fontSize: '0.85rem', 
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                  }}>
                    {agr.terms?.price != null 
                      ? `${agr.terms.currency || ''} ${Number(agr.terms.price).toLocaleString()}`
                      : '—'
                    }
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* Pipeline Distribution — compact horizontal bar */}
      <section style={{
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '8px',
        padding: '24px',
      }}>
        <h2 style={{ 
          fontSize: '0.85rem', 
          textTransform: 'uppercase', 
          letterSpacing: '0.08em',
          color: 'var(--color-text-secondary)',
          fontWeight: 600,
          marginBottom: '16px',
        }}>
          Pipeline Distribution
        </h2>
        <PipelineBar instances={instances} />
      </section>

    </div>
  );
}

// --- Sub-components ---

function MetricCard({ 
  icon, label, value, accent 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: number; 
  accent?: string;
}) {
  return (
    <div style={{
      background: 'var(--color-surface-elevated)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: '8px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      <div style={{ 
        color: accent || 'var(--color-text-secondary)', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        fontSize: '0.8rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {icon}
        {label}
      </div>
      <div style={{ 
        fontSize: '2rem', 
        fontWeight: 700,
        fontFamily: 'var(--font-family-sans)',
        color: accent || 'var(--color-text-primary)',
        letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
    </div>
  );
}

const PIPELINE_STATES: { state: KernelState; label: string; color: string }[] = [
  { state: 'created',     label: 'Created',     color: 'var(--color-state-neutral)' },
  { state: 'scheduled',   label: 'Scheduled',   color: 'var(--color-state-neutral)' },
  { state: 'in_progress', label: 'In Progress', color: 'var(--color-state-active)' },
  { state: 'waiting',     label: 'Waiting',     color: 'var(--color-state-waiting)' },
  { state: 'halted',      label: 'Halted',      color: 'var(--color-state-halted)' },
  { state: 'completed',   label: 'Completed',   color: 'var(--color-state-success)' },
  { state: 'delivered',   label: 'Delivered',    color: 'var(--color-state-success)' },
  { state: 'archived',    label: 'Archived',    color: 'var(--color-state-neutral)' },
];

function PipelineBar({ instances }: { instances: ServiceInstanceDTO[] }) {
  const total = instances.length;
  if (total === 0) return <Invitation label="No instances in the pipeline" />;

  const counts = PIPELINE_STATES.map(ps => ({
    ...ps,
    count: instances.filter(i => i.status === ps.state).length,
  })).filter(ps => ps.count > 0);

  return (
    <div>
      {/* The bar */}
      <div style={{ 
        display: 'flex', 
        height: '12px', 
        borderRadius: '6px', 
        overflow: 'hidden',
        marginBottom: '16px',
      }}>
        {counts.map(ps => (
          <div 
            key={ps.state} 
            style={{
              width: `${(ps.count / total) * 100}%`,
              backgroundColor: ps.color,
              transition: 'width var(--transition-snappy)',
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
        {counts.map(ps => (
          <div key={ps.state} style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px',
            fontSize: '0.8rem',
            color: 'var(--color-text-secondary)',
          }}>
            <div style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '2px',
              backgroundColor: ps.color, 
            }} />
            <span>{ps.label}</span>
            <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {ps.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
