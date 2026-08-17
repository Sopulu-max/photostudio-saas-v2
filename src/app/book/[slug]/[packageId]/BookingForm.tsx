'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { fieldType } from '@/modules/services/fieldTypes';
import { formatMoney } from '@/kernel/currency';
import { VariableField } from '@/components/VariableField';
import { parseVariableValue } from '@/modules/services/variableTypes';
import { submitBookingForm } from './actions';
import { createPortal } from 'react-dom';

/**
 * A question this studio asks about its own work — whatever its domains
 * classify by, not a fixed five. The studio names these; the form renders
 * whatever it finds.
 */
type IntakeDimension = {
  id: string;
  name: string;
  question: string | null;
  domainName: string | null;
  values: { id: string; name: string }[];
};

type PackageWithDimensions = {
  id: string;
  name: string;
  description: string | null;
  pricing: any;
  duration_minutes: number | null;
  price_unit: string | null;
  pricing_variant: any;
  services: { id: string; name: string }[];
  dimensionValueIds: string[];
};

/**
 * How well a package answers what the client described.
 *
 * Plain co-occurrence over values: how many of the things they chose does this
 * package already carry. Which dimension each value came from never enters the
 * arithmetic — a value already knows which question it answers.
 */
function scorePackage(pkg: PackageWithDimensions, selections: Record<string, string>): number {
  return Object.values(selections).reduce((score, valueId) => {
    if (!valueId) return score;
    return pkg.dimensionValueIds.includes(valueId) ? score + 1 : score;
  }, 0);
}

interface BookingFormProps {
  orgId: string;
  packageId: string | 'custom';
  packageName: string;
  formSchema: any[];
  /**
   * What the package deliberately did not fix — outfits, coverage hours. These
   * are not free-text questions: each one is a variable the service declared,
   * so the answer comes back structured and lands on the booking line rather
   * than in a bag of form responses.
   */
  openVariables?: any[];
  variant?: { axis_label: string; tiers: { label: string; price: number }[] } | null;
  currencyCode?: string;
  triggerLabel?: string;
  dimensionConfig?: IntakeDimension[];
  availablePackages?: PackageWithDimensions[];
}

export function BookingForm({
  orgId,
  packageId,
  packageName,
  formSchema,
  openVariables = [],
  variant,
  currencyCode = 'USD',
  triggerLabel = 'Book this package',
  dimensionConfig,
  availablePackages,
}: BookingFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, any>>({});
  // Kept apart from customFields: these are answers to declared variables, not
  // free-form form fields, and they are stored somewhere different.
  const [variableAnswers, setVariableAnswers] = useState<Record<string, string>>({});
  const [tierIndex, setTierIndex] = useState<number | null>(variant ? 0 : null);
  const [dimensionSelections, setDimensionSelections] = useState<Record<string, string>>({});
  /*
   * Which domain they are booking into.
   *
   * The domain has to be asked first here for the same reason it is asked first
   * in the service form: a dimension belongs to a domain, so Photography and
   * Videography can both ask "What occasion is it for?" and mean their own
   * vocabulary. Without this the client is asked the same question twice with
   * no way to tell the two apart.
   *
   * A studio operating in one domain never sees the question — there is nothing
   * to disambiguate, so nothing is asked.
   */
  const [intakeDomain, setIntakeDomain] = useState('');
  const [resolvedPackageId, setResolvedPackageId] = useState<string | null>(null);
  const [resolvedPackageName, setResolvedPackageName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  const isCustom = packageId === 'custom';
  const hasFormSchema = formSchema && formSchema.length > 0;
  const hasVariant = variant && variant.tiers.length > 0;
  const intakeDomains = useMemo(
    () => [...new Set((dimensionConfig || []).map(d => d.domainName).filter(Boolean))] as string[],
    [dimensionConfig]
  );
  const singleDomain = intakeDomains.length === 1 ? intakeDomains[0] : '';
  const activeDomain = intakeDomain || singleDomain;
  const askedDimensions = useMemo(
    () => (dimensionConfig || []).filter(d => !activeDomain || d.domainName === activeDomain),
    [dimensionConfig, activeDomain]
  );
  const hasDimensions = isCustom && !!dimensionConfig && dimensionConfig.length > 0;
  const hasMatchStep = isCustom && !!availablePackages && availablePackages.length > 0;

  const scoredPackages = useMemo(() => {
    if (!availablePackages || !availablePackages.length) return [];
    return [...availablePackages]
      .map(pkg => ({ ...pkg, score: scorePackage(pkg, dimensionSelections) }))
      .sort((a, b) => b.score - a.score);
  }, [availablePackages, dimensionSelections]);

  const hasSelections = Object.values(dimensionSelections).some(v => v);
  const hasMatches = scoredPackages.some(p => p.score > 0);

  const hasOpenVariables = !isCustom && openVariables.length > 0;
  const steps: { title: string; id: string }[] = [{ title: 'You', id: 'personal' }];
  if (hasFormSchema || hasOpenVariables || isCustom) steps.push({ title: 'Details', id: 'details' });
  if (hasMatchStep) steps.push({ title: 'Packages', id: 'match' });
  if (hasVariant && !isCustom) steps.push({ title: 'Options', id: 'tiers' });
  steps.push({ title: 'Review', id: 'review' });

  const totalSteps = steps.length;
  const activeStep = steps[currentStep];

  const canGoNext = (): boolean => {
    if (activeStep.id === 'personal') {
      return firstName.trim() !== '' && lastName.trim() !== '' && email.trim() !== '' && phone.trim() !== '';
    }
    if (activeStep.id === 'details') {
      if (isCustom) {
        if (hasDimensions) {
          return hasSelections || (customFields['message']?.trim() || '') !== '';
        }
        return (customFields['message']?.trim() || '') !== '';
      }
      for (const field of formSchema) {
        if (field.required) {
          const val = customFields[field.id];
          if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) return false;
        }
      }
      return true;
    }
    if (activeStep.id === 'match') return true;
    if (activeStep.id === 'tiers') return tierIndex !== null;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep < totalSteps - 1) {
      setCurrentStep(s => s + 1);
      return;
    }

    setIsSubmitting(true);
    try {
      const effectivePackageId = resolvedPackageId ?? packageId;
      const effectiveCustomFields = {
        ...customFields,
        ...(isCustom ? { dimensions: dimensionSelections } : {}),
      };
      await submitBookingForm(orgId, effectivePackageId, {
        firstName,
        lastName,
        email,
        phone,
        customFields: effectiveCustomFields,
        // Structured, unlike customFields: each answers a variable the service
        // declared, so it lands on the line rather than in form_responses.
        variableAnswers: openVariables
          .filter((v) => (variableAnswers[v.id] ?? '') !== '')
          .map((v) => ({
            serviceVariableId: v.id,
            value:
              // One parser everywhere — see parseVariableValue.
              parseVariableValue(v.kind, variableAnswers[v.id]),
          })),
        tierIndex: tierIndex ?? undefined,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
        fromCustomPath: isCustom,
      });
      setIsSuccess(true);
    } catch (error) {
      console.error(error);
      alert('Failed to submit booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayPackageName = resolvedPackageName ?? (isCustom ? 'Custom booking' : packageName);

  const formContent = (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'var(--q-color-paper)',
      zIndex: 9999, display: 'flex', flexDirection: 'column',
      animation: 'q-fade-in 0.3s ease',
    }}>
      {/* Header */}
      <header className="q-row" style={{ padding: '24px 32px', justifyContent: 'space-between', borderBottom: '1px solid var(--q-color-ink-100)' }}>
        <div>
          <h2 className="q-section-title" style={{ margin: 0 }}>{displayPackageName}</h2>
          <p className="q-meta" style={{ margin: 0 }}>Request to book</p>
        </div>
        <button onClick={() => setIsOpen(false)} className="q-btn q-btn-secondary q-btn-sm" style={{ borderRadius: '24px' }}>Close</button>
      </header>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '40px 24px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>

          {isSuccess ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ width: '64px', height: '64px', margin: '0 auto 24px', background: 'var(--q-color-success)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>✓</div>
              <h2 className="q-page-title" style={{ marginBottom: '12px' }}>Request received</h2>
              <p className="q-page-subtitle" style={{ margin: '0 auto 24px' }}>
                We&rsquo;ve got your request for <strong className="q-doc-strong">{displayPackageName}</strong>. We&rsquo;ll review the details and reach out to confirm everything.
              </p>
              <div className="q-card" style={{ display: 'inline-block', backgroundColor: 'var(--q-color-ink-50)' }}>
                <p className="q-meta" style={{ margin: 0, color: 'var(--q-color-ink-600)' }}>Keep an eye on <strong>{email}</strong> for next steps.</p>
              </div>
              <div style={{ marginTop: '40px' }}>
                <button onClick={() => setIsOpen(false)} className="q-btn q-btn-secondary">Done</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} id="booking-form">
              {/* Progress */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '48px' }}>
                {steps.map((s, idx) => (
                  <div key={s.id} style={{ flex: 1, height: '4px', borderRadius: '2px', background: idx <= currentStep ? 'var(--q-color-accent)' : 'var(--q-color-ink-100)', transition: 'background 0.3s' }} />
                ))}
              </div>

              {/* Step: Personal */}
              {activeStep.id === 'personal' && (
                <div style={{ animation: 'q-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <h3 className="q-page-title" style={{ marginBottom: '8px' }}>Let&rsquo;s start with you.</h3>
                  <p className="q-page-subtitle" style={{ marginBottom: '40px' }}>What should we call you and how can we reach you?</p>
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
                      <label className="q-label">Phone Number</label>
                      <input className="q-input q-input-lg" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
                    </div>
                  </div>
                </div>
              )}

              {/* Step: Details */}
              {activeStep.id === 'details' && (
                <div style={{ animation: 'q-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <h3 className="q-page-title" style={{ marginBottom: '8px' }}>The details.</h3>
                  <p className="q-page-subtitle" style={{ marginBottom: '40px' }}>Tell us a bit more about what you&rsquo;re looking for.</p>
                  <div className="q-stack q-stack-xl">
                    {isCustom ? (
                      <>
                        {hasDimensions && (
                          <div className="q-stack q-stack-lg">
                            {intakeDomains.length > 1 && (
                              <div>
                                <label className="q-label" style={{ fontSize: '1rem', marginBottom: '8px' }}>
                                  What are you booking?
                                  <span style={{ marginLeft: '6px', color: 'var(--q-color-ink-400)', fontWeight: 400 }}>(Optional)</span>
                                </label>
                                <select
                                  className="q-select q-input-lg"
                                  value={intakeDomain}
                                  onChange={(e) => {
                                    // Answers belong to the domain that asked them.
                                    setIntakeDomain(e.target.value);
                                    setDimensionSelections({});
                                  }}
                                >
                                  <option value="">Not sure yet</option>
                                  {intakeDomains.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </div>
                            )}
                            {askedDimensions.map(dim => (
                              <div key={dim.id}>
                                <label className="q-label" style={{ fontSize: '1rem', marginBottom: '8px' }}>
                                  {dim.question || dim.name}
                                  {!activeDomain && dim.domainName && (
                                    <span style={{ marginLeft: '6px', color: 'var(--q-color-ink-400)', fontWeight: 400 }}>
                                      ({dim.domainName})
                                    </span>
                                  )}
                                  <span style={{ marginLeft: '6px', color: 'var(--q-color-ink-400)', fontWeight: 400 }}>(Optional)</span>
                                </label>
                                <select
                                  className="q-select q-input-lg"
                                  value={dimensionSelections[dim.id] || ''}
                                  onChange={(e) => setDimensionSelections(prev => ({ ...prev, [dim.id]: e.target.value }))}
                                >
                                  <option value="">Any</option>
                                  {dim.values.map(opt => (
                                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="q-field">
                          <label className="q-label" style={{ fontSize: '1rem', marginBottom: '8px' }}>
                            {hasDimensions ? 'Anything else to add?' : 'What are you looking for?'}
                            {!hasDimensions && <span className="q-danger" style={{ marginLeft: '4px' }}>*</span>}
                            {hasDimensions && <span style={{ marginLeft: '6px', color: 'var(--q-color-ink-400)', fontWeight: 400 }}>(Optional)</span>}
                          </label>
                          <textarea
                            className="q-textarea q-input-lg"
                            rows={5}
                            placeholder="Tell us about the shoot, event, or project you have in mind — the more detail the better."
                            value={customFields['message'] || ''}
                            onChange={(e) => setCustomFields({ ...customFields, message: e.target.value })}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="q-stack q-stack-lg">
                        {/* What the package left open. Asked first because these
                            decide the shape of the job, not just its context. */}
                        {(() => {
                          if (!openVariables || openVariables.length === 0) return null;
                          
                          const byService = new Map<string, any[]>();
                          for (const v of openVariables) {
                            const svcName = v.serviceName || 'Details';
                            const list = byService.get(svcName) || [];
                            list.push(v);
                            byService.set(svcName, list);
                          }
                          
                          return Array.from(byService.entries()).map(([serviceName, vars]) => (
                            <div key={serviceName} className="q-card q-stack q-stack-sm">
                              <h3 className="q-section-title" style={{ margin: '0 0 16px' }}>{serviceName}</h3>
                              <div className="q-stack q-stack-md">
                                {vars.map((v: any) => {
                                  const val = variableAnswers[v.id] ?? '';
                                  const set = (raw: string) => setVariableAnswers({ ...variableAnswers, [v.id]: raw });
                                  return (
                                    <div className="q-field" key={v.id}>
                                      <label className="q-label" style={{ fontSize: '0.95rem' }}>
                                        {v.label}
                                        {v.unit && <span style={{ marginLeft: '6px', color: 'var(--q-color-ink-400)', fontWeight: 400 }}>({v.unit}s)</span>}
                                      </label>
                                      <VariableField
                                        kind={v.kind}
                                        value={val}
                                        onChange={(next) => set(Array.isArray(next) ? next.join(', ') : next)}
                                        options={v.options || []}
                                        unit={v.unit}
                                        min={v.min}
                                        max={v.max}
                                        emptyLabel="Choose…"
                                        width="100%"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ));
                        })()}

                        {formSchema.length > 0 && (
                          <div className="q-card q-stack q-stack-md">
                            <h3 className="q-section-title" style={{ margin: '0 0 16px' }}>General Questions</h3>
                            {formSchema.map((field: any) => {
                              const def = fieldType(field.type);
                              const value = customFields[field.id];
                              const set = (v: any) => setCustomFields({ ...customFields, [field.id]: v });
                              return (
                                <div className="q-field" key={field.id}>
                                  <label className="q-label" style={{ fontSize: '0.95rem', marginBottom: '8px' }}>
                                    {field.label} {field.required && <span className="q-danger">*</span>}
                                  </label>
                                  {field.type === 'textarea' ? (
                                    <textarea className="q-textarea q-input-lg" required={field.required} rows={4} value={value || ''} onChange={(e) => set(e.target.value)} />
                                  ) : field.type === 'boolean' ? (
                                    <label className="q-row q-meta-plain" style={{ gap: '12px', padding: '16px', background: 'var(--q-color-ink-50)', borderRadius: '12px', fontSize: '1rem' }}>
                                      <input type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} style={{ accentColor: 'var(--q-color-accent)', width: '20px', height: '20px' }} />
                                      Yes
                                    </label>
                                  ) : field.type === 'choice' ? (
                                    <select className="q-select q-input-lg" required={field.required} value={value || ''} onChange={(e) => set(e.target.value)}>
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
                      </div>
                    )}

                    <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '32px' }}>
                      <label className="q-label" style={{ fontSize: '1rem', marginBottom: '8px' }}>
                        When were you thinking?
                        <span style={{ marginLeft: '6px', color: 'var(--q-color-ink-400)', fontWeight: 400 }}>(Optional)</span>
                      </label>
                      <p className="q-meta" style={{ marginBottom: '16px' }}>Let us know your preferred date and time.</p>
                      <input type="datetime-local" className="q-input q-input-lg" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Step: Match */}
              {activeStep.id === 'match' && (
                <div style={{ animation: 'q-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <h3 className="q-page-title" style={{ marginBottom: '8px' }}>What fits?</h3>
                  <p className="q-page-subtitle" style={{ marginBottom: '40px' }}>
                    {hasSelections && hasMatches
                      ? 'Based on what you described, these packages match — best fit first. Pick one or skip to continue with your request.'
                      : hasSelections && !hasMatches
                        ? "No exact matches yet. Here's everything we offer — pick one or skip to let us put something together."
                        : "Here's what we offer. Pick one that fits, or skip and describe what you need."}
                  </p>

                  <div className="q-stack q-stack-md">
                    {scoredPackages.map(pkg => {
                      const isSelected = resolvedPackageId === pkg.id;
                      const isDimmed = hasSelections && hasMatches && pkg.score === 0;
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setResolvedPackageId(null);
                              setResolvedPackageName(null);
                            } else {
                              setResolvedPackageId(pkg.id);
                              setResolvedPackageName(pkg.name);
                            }
                          }}
                          style={{
                            width: '100%', textAlign: 'left', padding: '20px 24px',
                            border: isSelected ? '2px solid var(--q-color-accent)' : '1px solid var(--q-color-ink-200)',
                            borderRadius: '12px', cursor: 'pointer',
                            background: isSelected ? 'color-mix(in srgb, var(--q-color-accent) 5%, var(--q-color-paper))' : 'var(--q-color-paper)',
                            transition: 'all 0.2s ease',
                            opacity: isDimmed ? 0.45 : 1,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--q-color-ink-900)', marginBottom: pkg.description ? '4px' : 0 }}>
                                {pkg.name}
                              </div>
                              {pkg.description && (
                                <div style={{ color: 'var(--q-color-ink-500)', fontSize: '0.9rem', lineHeight: 1.5 }}>{pkg.description}</div>
                              )}
                            </div>
                            {pkg.pricing?.base_price != null && (
                              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--q-color-ink-700)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                {formatMoney(pkg.pricing.base_price, currencyCode)}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--q-color-accent)', fontSize: '0.85rem', fontWeight: 600 }}>
                              <span>✓</span> Selected
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {resolvedPackageId && (
                    <div style={{ marginTop: '20px' }}>
                      <button
                        type="button"
                        className="q-btn q-btn-outline"
                        onClick={() => { setResolvedPackageId(null); setResolvedPackageName(null); }}
                        style={{ borderRadius: '24px', fontSize: '0.9rem' }}
                      >
                        Clear — continue as custom request
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Step: Tiers */}
              {activeStep.id === 'tiers' && variant && (
                <div style={{ animation: 'q-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <h3 className="q-page-title" style={{ marginBottom: '8px' }}>{variant.axis_label}</h3>
                  <p className="q-page-subtitle" style={{ marginBottom: '40px' }}>Select the option that best fits your needs.</p>
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

              {/* Step: Review */}
              {activeStep.id === 'review' && (
                <div style={{ animation: 'q-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <h3 className="q-page-title" style={{ marginBottom: '8px' }}>Review & Submit</h3>
                  <p className="q-page-subtitle" style={{ marginBottom: '40px' }}>Just to make sure we got everything right.</p>
                  <div className="q-card" style={{ backgroundColor: 'var(--q-color-ink-50)', marginBottom: '32px' }}>

                    <div style={{ marginBottom: '24px' }}>
                      <div className="q-meta" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '8px' }}>Your Details</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>{firstName} {lastName}</div>
                      <div style={{ color: 'var(--q-color-ink-600)' }}>{email}{phone ? ` • ${phone}` : ''}</div>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <div className="q-meta" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '8px' }}>Booking</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 500 }}>{displayPackageName}</div>
                      {isCustom && !resolvedPackageName && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--q-color-ink-400)', marginTop: '2px' }}>We&rsquo;ll match you to the right package.</div>
                      )}
                    </div>

                    {isCustom && hasSelections && (
                      <div style={{ marginBottom: '24px' }}>
                        <div className="q-meta" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '8px' }}>What you described</div>
                        <div className="q-stack q-stack-xs">
                          {Object.entries(dimensionSelections)
                            .filter(([, v]) => v)
                            .map(([dimId, valueId]) => {
                              const dim = dimensionConfig?.find(d => d.id === dimId);
                              const opt = dim?.values.find(o => o.id === valueId);
                              return opt ? (
                                <div key={dimId} style={{ fontSize: '0.95rem', color: 'var(--q-color-ink-700)' }}>
                                  <span style={{ color: 'var(--q-color-ink-400)' }}>{dim!.name}: </span>
                                  {opt.name}
                                </div>
                              ) : null;
                            })}
                        </div>
                      </div>
                    )}

                    {scheduledFor && (
                      <div style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--q-color-ink-400)', fontWeight: 600, marginBottom: '8px' }}>Requested Time</div>
                        <div style={{ fontSize: '1.05rem' }}>{new Date(scheduledFor).toLocaleString()}</div>
                      </div>
                    )}

                    {hasVariant && tierIndex !== null && !isCustom && (
                      <div>
                        <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--q-color-ink-400)', fontWeight: 600, marginBottom: '8px' }}>{variant!.axis_label}</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 500 }}>{variant!.tiers[tierIndex].label} — {formatMoney(variant!.tiers[tierIndex].price, currencyCode)}</div>
                      </div>
                    )}

                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      {!isSuccess && (
        <footer style={{ padding: '24px 32px', borderTop: '1px solid var(--q-color-ink-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--q-color-paper)' }}>
          <div>
            {currentStep > 0 ? (
              <button onClick={() => setCurrentStep(s => s - 1)} className="q-btn q-btn-outline q-btn-lg" style={{ borderRadius: '24px' }}>Back</button>
            ) : (
              <div />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {activeStep.id === 'match' && (
              <button
                type="button"
                className="q-btn q-btn-outline"
                onClick={() => setCurrentStep(s => s + 1)}
                style={{ borderRadius: '24px' }}
              >
                Skip
              </button>
            )}
            <button
              form="booking-form"
              type="submit"
              className="q-btn q-btn-primary q-btn-lg"
              disabled={!canGoNext() || isSubmitting}
              style={{ borderRadius: '24px', padding: '12px 32px' }}
            >
              {currentStep === totalSteps - 1
                ? (isSubmitting ? 'Submitting…' : 'Submit Request')
                : activeStep.id === 'match' && resolvedPackageId
                  ? 'Book this package'
                  : 'Continue'}
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
