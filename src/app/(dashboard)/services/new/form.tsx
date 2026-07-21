'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createServiceTemplate } from '@/lib/actions/services';

export function NewServiceForm({ workflowTemplates }: { workflowTemplates: any[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [basePrice, setBasePrice] = useState(0);
  const [currency, setCurrency] = useState('USD');
  const [depositPercentage, setDepositPercentage] = useState(50);
  
  // Intake Form Schema State
  const [formSchema, setFormSchema] = useState<any[]>([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addField = () => {
    setFormSchema([
      ...formSchema,
      { id: crypto.randomUUID(), type: 'text', label: '', required: false }
    ]);
  };

  const updateField = (id: string, updates: any) => {
    setFormSchema(formSchema.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const removeField = (id: string) => {
    setFormSchema(formSchema.filter(f => f.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setIsSubmitting(true);
    try {
      const pricing = {
        base_price: basePrice,
        currency,
        deposit_percentage: depositPercentage,
      };
      // Pass the form schema to the server action
      await createServiceTemplate(name, workflowId || null, pricing, formSchema);
      router.push('/services');
    } catch (error) {
      console.error(error);
      alert('Failed to create service template.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '64px' }}>
      <header className="q-page-header">
        <h1 className="q-page-title">New Service Template</h1>
        <p className="q-page-subtitle">Define what you sell and link it to your production pipeline.</p>
      </header>

      <form onSubmit={handleSubmit} className="q-card" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Service Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Premium Wedding Package"
            style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--q-color-ink-200)', fontSize: '1rem' }}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Workflow Pipeline (Optional)</label>
          <p style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', margin: '0 0 12px 0' }}>
            When a client books this service, which workflow should the system automatically spawn?
          </p>
          <select
            value={workflowId}
            onChange={(e) => setWorkflowId(e.target.value)}
            style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--q-color-ink-200)', fontSize: '1rem', background: 'white' }}
          >
            <option value="">No standard workflow</option>
            {workflowTemplates.map((wf) => (
              <option key={wf.id} value={wf.id}>{wf.name}</option>
            ))}
          </select>
        </div>

        <div>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>Pricing & Deposit</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>Base Price</label>
              <input
                type="number"
                value={basePrice}
                onChange={(e) => setBasePrice(parseFloat(e.target.value) || 0)}
                min="0"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)', background: 'white' }}
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>Deposit Required (%)</label>
              <input
                type="number"
                value={depositPercentage}
                onChange={(e) => setDepositPercentage(parseInt(e.target.value) || 0)}
                min="0"
                max="100"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
              />
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '24px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem' }}>Intake Form Builder</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', margin: '0 0 16px 0' }}>
            Define the custom information you need to collect from the client when they book this service. (Name, Email, and Phone are always collected).
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
            {formSchema.map((field, index) => (
              <div key={field.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'var(--q-color-ink-50)', padding: '12px', borderRadius: '8px', border: '1px solid var(--q-color-ink-100)' }}>
                <input
                  type="text"
                  value={field.label}
                  onChange={(e) => updateField(field.id, { label: e.target.value })}
                  placeholder="Question Label (e.g. Event Date)"
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--q-color-ink-200)' }}
                  required
                />
                <select
                  value={field.type}
                  onChange={(e) => updateField(field.id, { type: e.target.value })}
                  style={{ width: '150px', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--q-color-ink-200)', background: 'white' }}
                >
                  <option value="text">Short Text</option>
                  <option value="textarea">Long Text</option>
                  <option value="date">Date</option>
                  <option value="number">Number</option>
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => updateField(field.id, { required: e.target.checked })}
                  />
                  Required
                </label>
                <button type="button" onClick={() => removeField(field.id)} style={{ padding: '6px 10px', color: 'red', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 500 }}>
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={addField} className="q-btn q-btn-secondary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
            + Add Question
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '24px' }}>
          <button type="submit" disabled={isSubmitting} className="q-btn q-btn-primary" style={{ minWidth: '150px' }}>
            {isSubmitting ? 'Creating...' : 'Create Service'}
          </button>
        </div>
      </form>
    </div>
  );
}
