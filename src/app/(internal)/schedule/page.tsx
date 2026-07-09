'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SchedulePage() {
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSchedule() {
      const supabase = createClient();
      // Fetch instances that have scheduling metadata in fulfillment_data
      const { data, error } = await supabase
        .from('service_instances')
        .select(`
          id,
          agreement_id,
          service_id,
          status,
          fulfillment_data
        `);

      if (!error && data) {
        // Filter those that have a scheduledAt timestamp and are not cancelled
        const scheduled = data.filter((inst: any) => 
          inst.fulfillment_data?.scheduledAt && 
          inst.status !== 'cancelled'
        );
        
        // Sort chronologically
        scheduled.sort((a: any, b: any) => {
          return new Date(a.fulfillment_data.scheduledAt).getTime() - new Date(b.fulfillment_data.scheduledAt).getTime();
        });
        
        setInstances(scheduled);
      }
      setLoading(false);
    }
    loadSchedule();
  }, []);

  if (loading) {
    return <div style={{ padding: '40px' }}>Loading Schedule Projection...</div>;
  }

  return (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontFamily: 'var(--font-family-serif)', marginBottom: '8px' }}>
            Schedule
          </h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            A time-based projection of Active Service Instances. 
          </p>
        </div>
      </header>

      {instances.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', background: 'var(--color-surface-elevated)', borderRadius: '16px', border: '1px solid var(--color-border-subtle)' }}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem' }}>No upcoming sessions scheduled.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {instances.map(instance => {
            const date = new Date(instance.fulfillment_data.scheduledAt);
            const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateString = date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
            
            return (
              <div key={instance.id} style={{ 
                display: 'flex', 
                background: 'var(--color-surface-elevated)', 
                borderRadius: '12px',
                border: '1px solid var(--color-border-subtle)',
                overflow: 'hidden'
              }}>
                {/* Time Gutter */}
                <div style={{ 
                  padding: '24px', 
                  background: 'var(--color-background)', 
                  borderRight: '1px solid var(--color-border-subtle)',
                  minWidth: '150px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}>
                  <div style={{ fontWeight: 600, fontSize: '1.2rem' }}>{timeString}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{dateString}</div>
                </div>
                
                {/* Content */}
                <div style={{ padding: '24px', flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-primary)', marginBottom: '8px' }}>
                    {instance.status}
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 500, marginBottom: '4px' }}>
                    {instance.fulfillment_data.title || 'Untitled Session'}
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                    Instance: {instance.id.split('-')[0]}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
