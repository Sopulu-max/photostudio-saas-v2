import React from 'react';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { MockScenarios } from '@/lib/domains/kernel/mock-scenarios';
import { KernelState } from '@/components/ontology/StateBadge';
import { Invitation } from '@/components/ontology/Invitation';
import { LineageEdge } from '@/components/ontology/LineageEdge';
import { MemoryDrawer } from '@/components/ontology/MemoryDrawer';

export default function SpecimenPage() {
  const { passport, wedding } = MockScenarios;

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

    </div>
  );
}
