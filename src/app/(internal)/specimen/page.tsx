"use client";

import React from 'react';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { useState } from 'react';
import { MockScenarios } from '@/lib/domains/kernel/mock-scenarios';
import { KernelState } from '@/components/ontology/StateBadge';
import { Invitation } from '@/components/ontology/Invitation';
import { LineageEdge } from '@/components/ontology/LineageEdge';
import { MemoryDrawer } from '@/components/ontology/MemoryDrawer';
import { resolveForAudience } from '@/lib/domains/presentation/resolver';
import { AudienceContext, FacingConfig } from '@/lib/domains/presentation/types';
import { FacingConfigurator } from '@/components/presentation/FacingConfigurator';


export default function SpecimenPage() {
  const { passport, wedding } = MockScenarios;
  
  // Resolver Demo State
  const [audienceLens, setAudienceLens] = useState<AudienceContext>({ role: 'staff', id: 'staff-1' });
  const [facingConfig, setFacingConfig] = useState<FacingConfig>({});

  // Let's create an artificial organization and asset for the full 9-signature spread
  const mockOrg: any = { name: "Sopulu's Studio", status: 'active', id: 'org-1' };
  const mockService: any = { id: 'svc-1', name: 'Wedding Photography Base' };
  const mockAsset: any = { id: 'ast-1', name: 'DSC001.ARW', url: '...' };

  const allStates: KernelState[] = ['created', 'scheduled', 'in_progress', 'waiting', 'halted', 'completed', 'delivered', 'archived', 'proposed', 'active', 'modified', 'cancelled'];

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      
      <div style={{ marginBottom: '60px' }}>
        <h1 style={{ fontSize: '2.5rem', fontFamily: 'var(--font-family-serif)', marginBottom: '8px' }}>
          Ontology Specimen
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Testing the 9 entity signatures at all three scales.
        </p>
      </div>

      {/* SCALE: CARD */}
      <section style={{ marginBottom: '60px' }}>
        <h2 style={{ fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '24px', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '12px' }}>
          Scale: Card
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
          <EntitySignature type="organization" data={mockOrg} scale="card" />
          <EntitySignature type="customer" data={wedding.customer} scale="card" />
          <EntitySignature type="request" data={passport.request} scale="card" />
          <EntitySignature type="agreement" data={wedding.agreement} scale="card" />
          <EntitySignature type="service" data={mockService} scale="card" />
          
          {/* We show the three wedding instances showing state differences */}
          <EntitySignature type="service_instance" data={wedding.instances[0]} scale="card" />
          <EntitySignature type="service_instance" data={wedding.instances[1]} scale="card" />
          <EntitySignature type="service_instance" data={wedding.instances[2]} scale="card" />
          
          <EntitySignature type="asset" data={mockAsset} scale="card" />
        </div>
      </section>

      {/* SCALE: ROW */}
      <section style={{ marginBottom: '60px' }}>
        <h2 style={{ fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '24px', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '12px' }}>
          Scale: Row
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '600px' }}>
          <EntitySignature type="request" data={wedding.request} scale="row" />
          <EntitySignature type="agreement" data={wedding.agreement} scale="row" />
          <EntitySignature type="service_instance" data={wedding.instances[1]} scale="row" />
          <EntitySignature type="service_instance" data={passport.instance} scale="row" />
        </div>
      </section>

      {/* SCALE: CHIP */}
      <section style={{ marginBottom: '60px' }}>
        <h2 style={{ fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '24px', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '12px' }}>
          Scale: Chip (16px readability test)
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <EntitySignature type="organization" data={mockOrg} scale="chip" />
          <EntitySignature type="customer" data={wedding.customer} scale="chip" />
          <EntitySignature type="request" data={wedding.request} scale="chip" />
          <EntitySignature type="agreement" data={wedding.agreement} scale="chip" />
          <EntitySignature type="service_instance" data={wedding.instances[1]} scale="chip" />
        </div>
      </section>

      {/* STATE GRAMMAR EXHAUSTIVE */}
      <section style={{ marginBottom: '60px' }}>
        <h2 style={{ fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '24px', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '12px' }}>
          Universal State Grammar
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {allStates.map(st => (
            <EntitySignature 
              key={st}
              type="service_instance" 
              data={{ ...wedding.instances[0], status: st } as any} 
              scale="card" 
            />
          ))}
        </div>
      </section>

      {/* INVITATION EXHAUSTIVE */}
      <section style={{ marginBottom: '60px' }}>
        <h2 style={{ fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '24px', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '12px' }}>
          Invitation (Empty State as Edit Door)
        </h2>
        <div style={{ maxWidth: '400px' }}>
          <Invitation label="Create New Service Instance" />
        </div>
      </section>

      {/* ONTOLOGY LINEAGE (EDGES & MEMORY) */}
      <section style={{ marginBottom: '60px' }}>
        <h2 style={{ fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '24px', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '12px' }}>
          Ontological Lineage (Memory & Edges)
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '600px' }}>
          {/* Active instance at the front */}
          <EntitySignature type="service_instance" data={wedding.instances[1]} scale="row" />
          
          <MemoryDrawer label="View Origin Lineage">
            <LineageEdge status={wedding.instances[1].status as KernelState} length={32} />
            <EntitySignature type="agreement" data={wedding.agreement} scale="row" />
            <LineageEdge status={wedding.agreement.status as KernelState} length={32} />
            <EntitySignature type="request" data={wedding.request} scale="row" />
          </MemoryDrawer>
        </div>
      </section>

      {/* AUDIENCE-CONTEXT RESOLVER DEMO */}
      <section style={{ marginBottom: '60px' }}>
        <h2 style={{ fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '24px', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '12px' }}>
          Presentation Engine: Audience-Context Resolver
        </h2>
        <p style={{ marginBottom: '24px', color: 'var(--color-text-secondary)' }}>
          This proves the F1 (Never External) and F2 (Counterparty Guaranteed) laws. Data is scrubbed BEFORE it ever reaches the UI components based on the active lens.
        </p>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
          
          {/* Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ background: 'var(--color-surface-elevated)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border-subtle)' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Audience Lens</h3>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => setAudienceLens({ role: 'staff', id: 'staff-1' })}
                  style={{ padding: '8px 16px', background: audienceLens.role === 'staff' ? 'var(--color-primary)' : 'var(--color-surface)', color: audienceLens.role === 'staff' ? 'white' : 'var(--color-text)', border: '1px solid var(--color-border-subtle)', borderRadius: '4px', cursor: 'pointer' }}
                >Staff (Full View)</button>
                <button 
                  onClick={() => setAudienceLens({ role: 'customer', id: wedding.customer.id })}
                  style={{ padding: '8px 16px', background: audienceLens.role === 'customer' ? 'var(--color-primary)' : 'var(--color-surface)', color: audienceLens.role === 'customer' ? 'white' : 'var(--color-text)', border: '1px solid var(--color-border-subtle)', borderRadius: '4px', cursor: 'pointer' }}
                >Customer (Counterparty)</button>
                <button 
                  onClick={() => setAudienceLens({ role: 'public', id: null })}
                  style={{ padding: '8px 16px', background: audienceLens.role === 'public' ? 'var(--color-primary)' : 'var(--color-surface)', color: audienceLens.role === 'public' ? 'white' : 'var(--color-text)', border: '1px solid var(--color-border-subtle)', borderRadius: '4px', cursor: 'pointer' }}
                >Public (Anonymous)</button>
              </div>
            </div>

            <FacingConfigurator config={facingConfig} onChange={setFacingConfig} />
          </div>

          {/* Output */}
          <div style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '16px', borderRadius: '8px', overflow: 'auto', maxHeight: '600px', fontSize: '0.85rem', fontFamily: 'monospace' }}>
            <div style={{ color: '#569cd6', marginBottom: '12px', fontWeight: 'bold' }}>// Raw Resolved Payload (AgreementDTO + Instances)</div>
            <pre style={{ margin: 0 }}>
              {JSON.stringify(resolveForAudience(wedding.agreement, 'AgreementDTO', audienceLens, facingConfig), null, 2)}
            </pre>
          </div>

        </div>
      </section>

    </div>
  );
}
