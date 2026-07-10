"use client";

import React, { useState } from 'react';
import { createStaffMember, createCapability, assignCapability } from '@/app/actions/staff';

export function AddStaffForm() {
  const [loading, setLoading] = useState(false);

  async function action(formData: FormData) {
    setLoading(true);
    try {
      await createStaffMember(formData);
    } catch (e) {
      console.error(e);
      alert('Failed to add staff');
    }
    setLoading(false);
  }

  return (
    <form action={action} style={{ background: 'var(--color-surface-base)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border-subtle)', marginBottom: '16px' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>Add Team Member</h3>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <input name="name" placeholder="Name" required style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)' }} />
        <input name="email" type="email" placeholder="Email" required style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <select name="role" style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)' }}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
          <option value="contractor">Contractor</option>
        </select>
        <button type="submit" disabled={loading} style={{ background: 'var(--color-state-active)', color: 'white', padding: '8px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          {loading ? 'Adding...' : 'Add Staff'}
        </button>
      </div>
    </form>
  );
}

export function AddCapabilityForm() {
  const [loading, setLoading] = useState(false);

  async function action(formData: FormData) {
    setLoading(true);
    try {
      await createCapability(formData);
    } catch (e) {
      console.error(e);
      alert('Failed to add capability');
    }
    setLoading(false);
  }

  return (
    <form action={action} style={{ background: 'var(--color-surface-base)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border-subtle)', marginBottom: '16px' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>New Capability</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <input name="name" placeholder="Capability Name (e.g. Studio Lighting)" required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)' }} />
        <input name="description" placeholder="Description (Optional)" style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)' }} />
        <button type="submit" disabled={loading} style={{ background: 'var(--color-state-active)', color: 'white', padding: '8px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 600, alignSelf: 'flex-start' }}>
          {loading ? 'Adding...' : 'Create'}
        </button>
      </div>
    </form>
  );
}

export function AssignCapabilityControl({ staffId, capabilities }: { staffId: string, capabilities: any[] }) {
  const [loading, setLoading] = useState(false);

  async function handleAssign(e: React.ChangeEvent<HTMLSelectElement>) {
    if (!e.target.value) return;
    setLoading(true);
    try {
      await assignCapability(staffId, e.target.value);
    } catch (err) {
      console.error(err);
      alert('Failed to assign capability');
    }
    e.target.value = '';
    setLoading(false);
  }

  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '12px' }}>
      <select 
        onChange={handleAssign} 
        disabled={loading}
        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-base)', color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}
      >
        <option value="">{loading ? 'Assigning...' : '+ Assign Capability'}</option>
        {capabilities.map(cap => (
          <option key={cap.id} value={cap.id}>{cap.name}</option>
        ))}
      </select>
    </div>
  );
}
