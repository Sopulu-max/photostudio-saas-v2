'use client';

import React, { useState } from 'react';
import { submitBookingForm } from './actions';

interface BookingFormProps {
  orgId: string;
  serviceId: string;
  serviceName: string;
  formSchema: any[];
}

export function BookingForm({ orgId, serviceId, serviceName, formSchema }: BookingFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await submitBookingForm(orgId, serviceId, {
        firstName,
        lastName,
        email,
        phone,
        customFields
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
        <p style={{ color: 'var(--q-color-ink-500)' }}>
          Thank you. We have received your booking request for <strong>{serviceName}</strong>. 
          We will be in touch shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="q-card" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>Your Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>First Name</label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>Last Name</label>
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
            />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>Phone Number (Optional)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
            />
          </div>
        </div>
      </div>

      {formSchema && formSchema.length > 0 && (
        <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>Additional Information</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {formSchema.map((field) => (
              <div key={field.id}>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>
                  {field.label} {field.required && <span style={{ color: 'red' }}>*</span>}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    required={field.required}
                    value={customFields[field.id] || ''}
                    onChange={(e) => setCustomFields({ ...customFields, [field.id]: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)', minHeight: '100px', resize: 'vertical' }}
                  />
                ) : (
                  <input
                    type={field.type}
                    required={field.required}
                    value={customFields[field.id] || ''}
                    onChange={(e) => setCustomFields({ ...customFields, [field.id]: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
                  />
                )}
              </div>
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
