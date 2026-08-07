'use client';

import React, { useState, useEffect } from 'react';
import { fieldType } from '@/modules/services/fieldTypes';
import { formatMoney } from '@/kernel/currency';
import { submitBookingForm } from './actions';
import { createPortal } from 'react-dom';

interface BookingFormProps {
  orgId: string;
  packageId: string | 'custom';
  packageName: string;
  formSchema: any[];
  variant?: { axis_label: string; tiers: { label: string; price: number }[] } | null;
  currencyCode?: string;
  triggerLabel?: string;
}

export function BookingForm({ orgId, packageId, packageName, formSchema, variant, currencyCode = 'USD', triggerLabel = 'Book this package' }: BookingFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const [currentStep, setCurrentStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, any>>({});
  const [tierIndex, setTierIndex] = useState<number | null>(variant ? 0 : null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep < totalSteps - 1) {
      setCurrentStep(s => s + 1);
      return;
    }

    setIsSubmitting(true);
    try {
      await submitBookingForm(orgId, packageId, {
        firstName,
        lastName,
        email,
        phone,
        customFields,
        tierIndex: tierIndex ?? undefined,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
      });
      setIsSuccess(true);
    } catch (error) {
      console.error(error);
      alert('Failed to submit booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasFormSchema = formSchema && formSchema.length > 0;
  const hasVariant = variant && variant.tiers.length > 0;

  // Step 0: Personal Info
  // Step 1: Details (form + date)
  // Step 2: Tiers (if hasVariant)
  // Step 3: Review (Total steps is 2, 3, or 4 depending on existence of formSchema and variant)
  
  const steps: { title: string; id: string }[] = [];
  steps.push({ title: 'You', id: 'personal' });
  if (hasFormSchema || packageId === 'custom') {
    steps.push({ title: 'Details', id: 'details' });
  }
  if (hasVariant) {
    steps.push({ title: 'Options', id: 'tiers' });
  }
  steps.push({ title: 'Review', id: 'review' });

  const totalSteps = steps.length;
  const activeStep = steps[currentStep];

  const canGoNext = () => {
    if (activeStep.id === 'personal') {
      return firstName.trim() !== '' && lastName.trim() !== '' && email.trim() !== '';
    }
    if (activeStep.id === 'details') {
      if (packageId === 'custom') {
        return customFields['message']?.trim() !== '';
      }
      // Check required fields
      for (const field of formSchema) {
        if (field.required) {
          const val = customFields[field.id];
          if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) return false;
        }
      }
      return true;
    }
    if (activeStep.id === 'tiers') {
      return tierIndex !== null;
    }
    return true; // Review step
  };

  const formContent = (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'var(--q-color-paper)',
      zIndex: 9999, display: 'flex', flexDirection: 'column',
      animation: 'q-fade-in 0.3s ease'
    }}>
      {/* Header */}
      <header style={{ padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--q-color-ink-100)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--q-color-ink-900)' }}>{packageName}</h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--q-color-ink-500)' }}>Request to book</p>
        </div>
        <button onClick={() => setIsOpen(false)} className="q-btn q-btn-secondary q-btn-sm" style={{ padding: '8px 16px', borderRadius: '24px' }}>Close</button>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '40px 24px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          
          {isSuccess ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ width: '64px', height: '64px', margin: '0 auto 24px', background: 'var(--q-color-success)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>✓</div>
              <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '12px', color: 'var(--q-color-ink-900)', letterSpacing: '-0.02em' }}>Request received</h2>
              <p style={{ color: 'var(--q-color-ink-500)', fontSize: '1.1rem', margin: '0 auto 24px', lineHeight: 1.6 }}>
                We&rsquo;ve got your request for <strong style={{ color: 'var(--q-color-ink-900)' }}>{packageName}</strong>. We&rsquo;ll review the details and reach out to confirm everything.
              </p>
              <div style={{ padding: '16px', background: 'var(--q-color-ink-50)', borderRadius: '12px', display: 'inline-block' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--q-color-ink-600)', margin: 0 }}>Keep an eye on <strong>{email}</strong> for next steps.</p>
              </div>
              <div style={{ marginTop: '40px' }}>
                <button onClick={() => setIsOpen(false)} className="q-btn q-btn-secondary">Done</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} id="booking-form">
              {/* Progress Bar */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '48px' }}>
                {steps.map((s, idx) => (
                  <div key={s.id} style={{ flex: 1, height: '4px', borderRadius: '2px', background: idx <= currentStep ? 'var(--q-color-accent)' : 'var(--q-color-ink-100)', transition: 'background 0.3s' }} />
                ))}
              </div>

              {/* Step 1: Personal */}
              {activeStep.id === 'personal' && (
                <div style={{ animation: 'q-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <h3 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: '8px', color: 'var(--q-color-ink-900)' }}>Let&rsquo;s start with you.</h3>
                  <p style={{ color: 'var(--q-color-ink-500)', fontSize: '1.1rem', marginBottom: '40px' }}>What should we call you and how can we reach you?</p>
                  
                  <div className="q-stack q-stack-lg">
                    <div className="q-grid-2">
                      <div>
                        <label className="q-label">First Name</label>
                        <input className="q-input q-input-lg" type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" autoFocus />
                      </div>
                      <div>
                        <label className="q-label">Last Name</label>
                        <input className="q-input q-input-lg" type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
                      </div>
                    </div>
                    <div>
                      <label className="q-label">Email Address</label>
                      <input className="q-input q-input-lg" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
                    </div>
                    <div>
                      <label className="q-label">Phone Number (Optional)</label>
                      <input className="q-input q-input-lg" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Details */}
              {activeStep.id === 'details' && (
                <div style={{ animation: 'q-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <h3 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: '8px', color: 'var(--q-color-ink-900)' }}>The details.</h3>
                  <p style={{ color: 'var(--q-color-ink-500)', fontSize: '1.1rem', marginBottom: '40px' }}>Tell us a bit more about what you&rsquo;re looking for.</p>
                  
                  <div className="q-stack q-stack-xl">
                    {packageId === 'custom' ? (
                      <div className="q-field">
                        <label className="q-label" style={{ fontSize: '1rem', marginBottom: '12px' }}>What are you looking for? <span className="q-danger">*</span></label>
                        <textarea className="q-textarea q-input-lg" required rows={5} placeholder="Describe the project, scope, or idea you have in mind..." value={customFields['message'] || ''} onChange={(e) => setCustomFields({ ...customFields, message: e.target.value })} />
                      </div>
                    ) : (
                      <div className="q-stack q-stack-lg">
                        {formSchema.map((field: any) => {
                          const def = fieldType(field.type);
                          const value = customFields[field.id];
                          const set = (v: any) => setCustomFields({ ...customFields, [field.id]: v });

                          return (
                            <div className="q-field" key={field.id}>
                              <label className="q-label" style={{ fontSize: '1rem', marginBottom: '12px' }}>
                                {field.label} {field.required && <span className="q-danger">*</span>}
                              </label>

                              {field.type === 'textarea' ? (
                                <textarea className="q-textarea q-input-lg" required={field.required} rows={4}
                                  value={value || ''} onChange={(e) => set(e.target.value)} />
                              ) : field.type === 'boolean' ? (
                                <label className="q-row q-meta-plain" style={{ gap: '12px', padding: '16px', background: 'var(--q-color-ink-50)', borderRadius: '12px', fontSize: '1rem' }}>
                                  <input type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} style={{ accentColor: 'var(--q-color-accent)', width: '20px', height: '20px' }} />
                                  Yes
                                </label>
                              ) : field.type === 'choice' ? (
                                <select className="q-select q-input-lg" required={field.required}
                                  value={value || ''} onChange={(e) => set(e.target.value)}>
                                  <option value="">Choose…</option>
                                  {(field.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : field.type === 'multichoice' ? (
                                <div className="q-stack q-stack-sm">
                                  {(field.options || []).map((o: string) => {
                                    const picked: string[] = Array.isArray(value) ? value : [];
                                    return (
                                      <label key={o} className="q-row q-meta-plain" style={{ gap: '12px', padding: '16px', background: 'var(--q-color-ink-50)', borderRadius: '12px', fontSize: '1rem' }}>
                                        <input type="checkbox" checked={picked.includes(o)} onChange={(e) => set(e.target.checked ? [...picked, o] : picked.filter((x) => x !== o))} style={{ accentColor: 'var(--q-color-accent)', width: '20px', height: '20px' }} />
                                        {o}
                                      </label>
                                    );
                                  })}
                                </div>
                              ) : (
                                <input className="q-input q-input-lg" type={def.inputType || 'text'} required={field.required} value={value ?? ''} onChange={(e) => set(e.target.value)} />
                              )}
                              {field.help && <span className="q-meta" style={{ marginTop: '8px' }}>{field.help}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="q-divider" style={{ paddingTop: '32px' }}>
                      <label className="q-label" style={{ fontSize: '1rem', marginBottom: '8px' }}>When were you thinking? (Optional)</label>
                      <p className="q-meta" style={{ marginBottom: '16px' }}>Let us know your preferred date and time.</p>
                      <input type="datetime-local" className="q-input q-input-lg" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Tiers */}
              {activeStep.id === 'tiers' && variant && (
                <div style={{ animation: 'q-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <h3 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: '8px', color: 'var(--q-color-ink-900)' }}>{variant.axis_label}</h3>
                  <p style={{ color: 'var(--q-color-ink-500)', fontSize: '1.1rem', marginBottom: '40px' }}>Select the option that best fits your needs.</p>
                  
                  <div className="q-stack q-stack-md">
                    {variant.tiers.map((t, i) => (
                      <label key={i} className="q-row q-meta-plain" style={{ gap: '16px', padding: '24px', border: tierIndex === i ? '2px solid var(--q-color-accent)' : '1px solid var(--q-color-ink-200)', borderRadius: '12px', cursor: 'pointer', background: tierIndex === i ? 'color-mix(in srgb, var(--q-color-accent) 4%, transparent)' : 'transparent', transition: 'all 0.2s ease', alignItems: 'center' }}>
                        <input type="radio" name="tier" checked={tierIndex === i} onChange={() => setTierIndex(i)} style={{ accentColor: 'var(--q-color-accent)', width: '24px', height: '24px' }} />
                        <span style={{ flex: 1, fontSize: '1.2rem', fontWeight: tierIndex === i ? 600 : 500, color: 'var(--q-color-ink-900)' }}>{t.label}</span>
                        <span style={{ fontSize: '1.2rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(t.price, currencyCode)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 4: Review */}
              {activeStep.id === 'review' && (
                <div style={{ animation: 'q-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <h3 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: '8px', color: 'var(--q-color-ink-900)' }}>Review & Submit</h3>
                  <p style={{ color: 'var(--q-color-ink-500)', fontSize: '1.1rem', marginBottom: '40px' }}>Just to make sure we got everything right.</p>
                  
                  <div style={{ background: 'var(--q-color-ink-50)', padding: '24px', borderRadius: '16px', marginBottom: '32px' }}>
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--q-color-ink-400)', fontWeight: 600, marginBottom: '8px' }}>Your Details</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>{firstName} {lastName}</div>
                      <div style={{ color: 'var(--q-color-ink-600)' }}>{email} {phone ? ` • ${phone}` : ''}</div>
                    </div>
                    {scheduledFor && (
                      <div style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--q-color-ink-400)', fontWeight: 600, marginBottom: '8px' }}>Requested Time</div>
                        <div style={{ fontSize: '1.1rem' }}>{new Date(scheduledFor).toLocaleString()}</div>
                      </div>
                    )}
                    {hasVariant && tierIndex !== null && (
                      <div>
                        <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--q-color-ink-400)', fontWeight: 600, marginBottom: '8px' }}>{variant.axis_label}</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>{variant.tiers[tierIndex].label} — {formatMoney(variant.tiers[tierIndex].price, currencyCode)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </form>
          )}

        </div>
      </main>

      {/* Footer Navigation */}
      {!isSuccess && (
        <footer style={{ padding: '24px 32px', borderTop: '1px solid var(--q-color-ink-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--q-color-paper)' }}>
          <div>
            {currentStep > 0 ? (
              <button onClick={() => setCurrentStep(s => s - 1)} className="q-btn q-btn-outline q-btn-lg" style={{ borderRadius: '24px' }}>Back</button>
            ) : (
              <div /> // Spacer
            )}
          </div>
          <div>
            <button 
              form="booking-form"
              type="submit" 
              className="q-btn q-btn-primary q-btn-lg" 
              disabled={!canGoNext() || isSubmitting}
              style={{ borderRadius: '24px', padding: '12px 32px' }}
            >
              {currentStep === totalSteps - 1 ? (isSubmitting ? 'Submitting...' : 'Submit Request') : 'Continue'}
            </button>
          </div>
        </footer>
      )}
    </div>
  );

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="q-btn q-btn-primary q-btn-lg" style={{ width: '100%', fontSize: '1.1rem', padding: '16px', borderRadius: '12px' }}>
        {triggerLabel}
      </button>
      
      {isOpen && typeof document !== 'undefined' && createPortal(formContent, document.body)}
    </>
  );
}
