'use client';

import React, { useState } from 'react';
import { fieldType } from '@/modules/services/fieldTypes';
import { formatMoney } from '@/kernel/currency';
import { submitBookingForm } from './actions';

interface BookingFormProps {
  orgId: string;
  serviceId: string;
  serviceName: string;
  formSchema: any[];
  extras?: { id: string; name: string; price: number; unit: string | null }[];
  currencyCode?: string;
}

export function BookingForm({ orgId, serviceId, serviceName, formSchema, extras = [], currencyCode = 'USD' }: BookingFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, any>>({});
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const toggleExtra = (id: string) =>
    setExtraIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await submitBookingForm(orgId, serviceId, {
        firstName,
        lastName,
        email,
        phone,
        customFields,
        extraIds,
      });
      setIsSuccess(true);
    } catch (error) {
      console.error(error);
      alert('Failed to submit booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="q-card" style={{ textAlign: 'center', padding: '64px 32px' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '16px' }}>Request Submitted</h2>
        <p className="q-muted">
          Thank you. We have received your booking request for <strong>{serviceName}</strong>. 
          We will be in touch shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="q-card q-stack q-stack-xl">
      <div>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>Your Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label className="q-label">First Name</label>
            <input className="q-input"
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div>
            <label className="q-label">Last Name</label>
            <input className="q-input"
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        <div className="q-grid-2">
          <div>
            <label className="q-label">Email Address</label>
            <input className="q-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="q-label">Phone Number (Optional)</label>
            <input className="q-input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
      </div>

      {formSchema && formSchema.length > 0 && (
        <div className="q-divider">
          <h3 className="q-section-title">A few details</h3>
          <div className="q-stack q-stack-md">
            {formSchema.map((field: any) => {
              const def = fieldType(field.type);
              const value = customFields[field.id];
              const set = (v: any) => setCustomFields({ ...customFields, [field.id]: v });

              return (
                <div className="q-field" key={field.id}>
                  <label className="q-label">
                    {field.label} {field.required && <span className="q-danger">*</span>}
                  </label>

                  {field.type === 'textarea' ? (
                    <textarea className="q-textarea" required={field.required}
                      value={value || ''} onChange={(e) => set(e.target.value)} />

                  ) : field.type === 'boolean' ? (
                    <label className="q-row q-meta-plain" style={{ gap: '8px' }}>
                      <input type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} />
                      Yes
                    </label>

                  ) : field.type === 'choice' ? (
                    <select className="q-select" required={field.required}
                      value={value || ''} onChange={(e) => set(e.target.value)}>
                      <option value="">Choose…</option>
                      {(field.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
                    </select>

                  ) : field.type === 'multichoice' ? (
                    <div className="q-stack q-stack-sm">
                      {(field.options || []).map((o: string) => {
                        const picked: string[] = Array.isArray(value) ? value : [];
                        return (
                          <label key={o} className="q-row q-meta-plain" style={{ gap: '8px' }}>
                            <input
                              type="checkbox"
                              checked={picked.includes(o)}
                              onChange={(e) => set(e.target.checked ? [...picked, o] : picked.filter((x) => x !== o))}
                            />
                            {o}
                          </label>
                        );
                      })}
                    </div>

                  ) : (
                    <input className="q-input"
                      type={def.inputType || 'text'}
                      required={field.required}
                      value={value ?? ''}
                      onChange={(e) => set(e.target.value)}
                    />
                  )}

                  {field.help && <span className="q-meta-sm">{field.help}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {extras.length > 0 && (
        <div className="q-divider">
          <h3 className="q-section-title">Add-ons</h3>
          <div className="q-stack q-stack-sm">
            {extras.map((extra) => (
              <label key={extra.id} className="q-row q-meta-plain" style={{ gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={extraIds.includes(extra.id)}
                  onChange={() => toggleExtra(extra.id)}
                />
                {extra.name} — {formatMoney(extra.price, currencyCode)}{extra.unit ? `/${extra.unit}` : ''}
              </label>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '24px' }}>
        <button type="submit" disabled={isSubmitting} className="q-btn q-btn-primary" style={{ width: '100%', padding: '16px' }}>
          {isSubmitting ? 'Submitting Request...' : 'Submit Booking Request'}
        </button>
      </div>
    </form>
  );
}
