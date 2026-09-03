'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { fieldType } from '@/modules/services/fieldTypes';
import { formatMoney } from '@/kernel/currency';
import { VariableField } from '@/components/VariableField';
import { parseVariableValue } from '@/modules/services/variableTypes';
import { submitBookingForm, getPackageIntakePublic } from './actions';
// The studio's own published hours for a chosen day. Says nothing about
// anyone else's booking.
import { studioDayPublic } from '@/modules/bookings/interface';
import { createPortal } from 'react-dom';
import { toast } from '@/components/Toast';

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
    duration_minutes: number | null;
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
  /**
   * Classifications the package narrowed to more than one answer.
   *
   * Narrowing IS answering, partially: one value left means the studio settled
   * it and there is nothing to ask; several means it is still a question, with
   * a shorter list. So this needs no flag of its own — the shape of the
   * narrowing carries it.
   */
  openClassifications?: { dimensionId: string; name: string; question: string | null; values: { id: string; name: string }[] }[];
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
  openClassifications = [],
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
  /*
   * SAID WHERE THE DAY IS CHOSEN, NOT AT THE END OF THE FORM.
   *
   * createBookingFromIntake already refuses a closed day and an out-of-hours
   * time — resolveScheduledFor throws — and that stays exactly where it is,
   * because a rule enforced only in a browser is not enforced.
   *
   * But it threw at SUBMIT, after the client had filled in everything else, so
   * a studio that is shut on Sundays let somebody choose Sunday, answer every
   * question, and only then be told. The same shape as the contract that could
   * not be raised being discovered once the booking had already been saved.
   */
  const [dayHours, setDayHours] = useState<{ opensAt: string | null; closesAt: string | null; closed: boolean; label: string | null } | null>(null);

  useEffect(() => {
    const date = scheduledFor.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setDayHours(null); return; }
    // Cleared before asking: the previous day's hours must not stand under a
    // new date while the answer for it is still in flight.
    setDayHours(null);
    let live = true;
    studioDayPublic(orgId, date)
      .then((h) => { if (live) setDayHours(h as any); })
      .catch(() => { if (live) setDayHours(null); });
    return () => { live = false; };
  }, [scheduledFor, orgId]);
  const [customFields, setCustomFields] = useState<Record<string, any>>({});
  // Kept apart from customFields: these are answers to declared variables, not
  // free-form form fields, and they are stored somewhere different.
  const [variableAnswers, setVariableAnswers] = useState<Record<string, string>>({});
  const [tierIndex, setTierIndex] = useState<number | null>(variant ? 0 : null);
  const [dimensionSelections, setDimensionSelections] = useState<Record<string, string>>({});
  /*
   * Which one of the several this package offers. Kept apart from
   * dimensionSelections, which is the custom path describing what a visitor
   * wants in order to find a package — this is answering a package that has
   * already been chosen, and its answer narrows the booking's own copy of it.
   */
  const [chosenClassifications, setChosenClassifications] = useState<Record<string, string>>({});
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
  /*
   * What the package they matched asks of them.
   *
   * The package page has this before it renders; the custom path cannot, since
   * which package it is only becomes known when the client picks one. So it is
   * fetched at that moment, and until it arrives the step that asks it is not
   * offered — a step that renders nothing would be a dead page in the middle of
   * the form.
   */
  const [matchedIntake, setMatchedIntake] = useState<{
    formSchema: any[];
    openVariables: any[];
    openClassifications: { dimensionId: string; name: string; question: string | null; values: { id: string; name: string }[] }[];
  } | null>(null);
  const [loadingIntake, setLoadingIntake] = useState(false);
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
  /**
   * How many domains offer each dimension.
   *
   * A dimension can be shared: Glamour's Photography and Videography both ask
   * Occasion, and it is the same dimension with the same values, not two that
   * happen to share a name. Which matters twice below.
   */
  const domainsPerDimension = useMemo(() => {
    const counts = new Map<string, Set<string>>();
    for (const d of dimensionConfig || []) {
      const set = counts.get(d.id) || new Set<string>();
      set.add(d.domainName || '');
      counts.set(d.id, set);
    }
    return counts;
  }, [dimensionConfig]);

  const askedDimensions = useMemo(() => {
    const rows = (dimensionConfig || []).filter(d => !activeDomain || d.domainName === activeDomain);
    /*
     * ASKED ONCE, however many domains ask it.
     *
     * The config carries one row per (domain, dimension), which is right — a
     * question Photography asks and Videography does not must be offered under
     * Photography alone. But with no domain chosen, every row was rendered, so
     * a studio working in two domains asked the client "What occasion is it
     * for?" twice, with identical options. The two shared one entry in
     * dimensionSelections — they are keyed by dimension id — so answering
     * either silently answered both, and React saw two children with the same
     * key and warned that it may drop one.
     */
    const seen = new Set<string>();
    return rows.filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
  }, [dimensionConfig, activeDomain]);
  const hasDimensions = isCustom && !!dimensionConfig && dimensionConfig.length > 0;
  const hasMatchStep = isCustom && !!availablePackages && availablePackages.length > 0;

  /*
   * Load what the matched package asks, and forget the previous one's answers.
   *
   * Clearing matters as much as loading. A client who picks Wedding Coverage,
   * answers its questions, goes back and picks Portrait Session instead would
   * otherwise submit the first package's answers against the second — and they
   * are keyed by question and variable id, so they would not simply be ignored:
   * storeAnswers drops what the new package did not ask, but the variable
   * answers would land on its line as settings it never declared.
   */
  useEffect(() => {
    if (!isCustom) return;
    setChosenClassifications({});
    setVariableAnswers({});

    if (!resolvedPackageId) { setMatchedIntake(null); return; }

    let live = true;
    setLoadingIntake(true);
    getPackageIntakePublic(orgId, resolvedPackageId)
      .then((intake) => { if (live) setMatchedIntake(intake); })
      // A failure here must not strand the client: the step is simply not
      // offered, and submit still refuses a package whose required questions
      // went unanswered rather than booking something half-known.
      .catch(() => { if (live) setMatchedIntake(null); })
      .finally(() => { if (live) setLoadingIntake(false); });
    return () => { live = false; };
  }, [isCustom, orgId, resolvedPackageId]);

  /*
   * WHAT IS ACTUALLY BEING BOOKED, which is not the same as which page they
   * started on. `isCustom` says they arrived by describing what they wanted; a
   * match made further down means a real package is being booked, and it asks
   * its own questions from that point on.
   */
  const effectiveFormSchema: any[] = isCustom ? (matchedIntake?.formSchema ?? []) : formSchema;
  const effectiveOpenVariables: any[] = isCustom ? (matchedIntake?.openVariables ?? []) : openVariables;
  const effectiveOpenClassifications = isCustom
    ? (matchedIntake?.openClassifications ?? [])
    : openClassifications;

  /** Whether the matched package has anything of its own to ask. */
  const hasPackageStep = isCustom && !!resolvedPackageId && !loadingIntake && (
    effectiveFormSchema.length > 0
    || effectiveOpenVariables.length > 0
    || effectiveOpenClassifications.length > 0
  );

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
  // After the match, never before it: these are the chosen package's own
  // questions, and there is no package to ask them of until one is chosen.
  if (hasPackageStep) steps.push({ title: 'Your package', id: 'package-details' });
  if (hasVariant && !isCustom) steps.push({ title: 'Options', id: 'tiers' });
  steps.push({ title: 'Review', id: 'review' });

  const totalSteps = steps.length;
  const activeStep = steps[currentStep] ?? steps[steps.length - 1];

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
    /*
     * Not while the chosen package's questions are still being fetched. The
     * step that asks them only joins the wizard once they arrive, so advancing
     * a moment too early would walk straight past it — and book the package
     * having asked nothing, which is the bug this whole step exists to fix.
     */
    if (activeStep.id === 'match') return !loadingIntake;
    if (activeStep.id === 'package-details') {
      /*
       * Checked here rather than left to the server. The server does refuse a
       * required question that went unanswered — but it refuses the whole
       * submission, at the end, with a message the client cannot act on. This
       * is the same rule applied where it can still be fixed.
       */
      for (const c of effectiveOpenClassifications) {
        if (!chosenClassifications[c.dimensionId]) return false;
      }
      for (const field of effectiveFormSchema) {
        if (field.required) {
          const val = customFields[field.id];
          if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) return false;
        }
      }
      return true;
    }
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
        variableAnswers: effectiveOpenVariables
          .filter((v) => (variableAnswers[v.id] ?? '') !== '')
          .map((v) => ({
            serviceVariableId: v.id,
            value:
              // One parser everywhere — see parseVariableValue.
              parseVariableValue(v.kind, variableAnswers[v.id]),
          })),
        // One value per question the package left open. They narrow the
        // booking's own instance of the package rather than being stored beside
        // it, because "this booking is for a birthday" is a fact about what was
        // booked, not an annotation on it.
        chosenClassifications: Object.values(chosenClassifications).filter(Boolean),
        tierIndex: tierIndex ?? undefined,
        // Sent exactly as typed — "2026-08-29T10:00", no zone. new Date() here
        // read it in the BROWSER's zone, so a client booking from London for a
        // Lagos studio picked 10:00 and the studio recorded 11:00. The server
        // resolves it against the studio's own timezone instead.
        scheduledFor: scheduledFor || undefined,
        fromCustomPath: isCustom,
      });
      setIsSuccess(true);
    } catch (error) {
      console.error(error);
      toast.bad('Failed to submit booking. Please try again.');
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
              <div style={{ width: '64px', height: '64px', margin: '0 auto 24px', background: 'var(--q-color-success)', color: 'var(--q-color-accent-text)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>✓</div>
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
                            <div className="q-grid-2">
                              {askedDimensions.map(dim => (
                                <div key={dim.id}>
                                  <label className="q-label" style={{ fontSize: '1rem', marginBottom: '8px' }}>
                                    {dim.question || dim.name}
                                    {/* Named only when the domain actually
                                        distinguishes it. A dimension both
                                        domains ask is one question, and
                                        labelling it with whichever domain
                                        happened to come first would say
                                        something untrue about the other. */}
                                    {!activeDomain && dim.domainName && (domainsPerDimension.get(dim.id)?.size ?? 1) === 1 && (
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
                          </div>
                        )}
                        <div className="q-field">
                          <label className="q-label" style={{ fontSize: '1rem', marginBottom: '8px' }}>
                            {hasDimensions ? 'Additional details' : 'What are you looking for?'}
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
                      <PackageQuestions
                        openClassifications={effectiveOpenClassifications}
                        chosenClassifications={chosenClassifications}
                        setChosenClassifications={setChosenClassifications}
                        openVariables={effectiveOpenVariables}
                        variableAnswers={variableAnswers}
                        setVariableAnswers={setVariableAnswers}
                        formSchema={effectiveFormSchema}
                        customFields={customFields}
                        setCustomFields={setCustomFields}
                      />
                    )}

                    <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '32px' }}>
                      <label className="q-label" style={{ fontSize: '1rem', marginBottom: '8px' }}>
                        When would you like it?
                        <span style={{ marginLeft: '6px', color: 'var(--q-color-ink-400)', fontWeight: 400 }}>(Optional)</span>
                      </label>
                      {/* This writes to the same column the studio's own
                          calendar reads, because a client choosing a date and
                          time IS the booking getting its date. What is not yet
                          settled is whether the studio has agreed to it, and
                          that is what the booking's stage says — not a second
                          column holding a wish. So it asks plainly, and says
                          who confirms. */}
                      <p className="q-meta" style={{ marginBottom: '16px' }}>
                        Choose the date and time you want the session to happen. The studio will confirm it.
                      </p>
                      <input type="datetime-local" className="q-input q-input-lg" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
                      {dayHours && (dayHours.closed || dayHours.opensAt || dayHours.closesAt) && (() => {
                        const t = scheduledFor.slice(11, 16);
                        const early = dayHours.opensAt && t && t < dayHours.opensAt;
                        const late = dayHours.closesAt && t && t >= dayHours.closesAt;
                        const off = dayHours.closed || early || late;
                        return (
                          <p className={off ? 'q-note q-note-warn q-meta q-appear' : 'q-meta q-appear'} style={{ marginTop: '12px' }}>
                            {dayHours.closed
                              ? `We are closed that day${dayHours.label ? ` (${dayHours.label})` : ''}. Please choose another.`
                              : early
                                ? `We open at ${dayHours.opensAt} that day.`
                                : late
                                  ? `We close at ${dayHours.closesAt} that day.`
                                  : `We are open ${dayHours.opensAt ?? '—'} to ${dayHours.closesAt ?? '—'} that day.`}
                          </p>
                        );
                      })()}
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
                          className={`q-tile q-card-interactive ${isSelected ? 'q-selected' : ''}`}
                          style={{
                            textAlign: 'left',
                            width: '100%',
                            border: `2px solid ${isSelected ? 'var(--q-color-accent)' : 'var(--q-color-ink-200)'}`,
                            background: isSelected ? 'var(--q-color-accent-subtle)' : 'var(--q-color-paper)',
                            padding: '20px 24px',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            opacity: isDimmed ? 0.45 : 1,
                          }}
                          onClick={() => {
                            if (isSelected) {
                              setResolvedPackageId(null);
                              setResolvedPackageName(null);
                            } else {
                              setResolvedPackageId(pkg.id);
                              setResolvedPackageName(pkg.name);
                            }
                          }}
                        >
                          <div className="q-row q-row-between" style={{ alignItems: 'flex-start' }}>
                            <div>
                              <div className="q-strong" style={{ fontSize: '1.1rem' }}>{pkg.name}</div>
                              {pkg.description && (
                                <div className="q-meta" style={{ marginTop: '6px' }}>{pkg.description}</div>
                              )}
                              <div className="q-meta-sm" style={{ marginTop: '12px', display: 'flex', gap: '12px', color: 'var(--q-color-ink-500)', flexWrap: 'wrap' }}>
                                {pkg.duration_minutes ? <span>⏱ {pkg.duration_minutes} minutes</span> : null}
                                {(pkg as any).deliverablesCount ? (
                                  <span>📦 {(pkg as any).deliverablesCount} deliverable{(pkg as any).deliverablesCount === 1 ? '' : 's'}</span>
                                ) : null}
                                {pkg.services && pkg.services.length > 0 ? (
                                  <span>🛠 {pkg.services.length} service{pkg.services.length === 1 ? '' : 's'}</span>
                                ) : null}
                              </div>
                            </div>
                            <div style={{ marginLeft: '16px' }}>
                              <div className={`q-radio ${isSelected ? 'checked' : ''}`} />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/*
                * Step: the matched package's own questions.
                *
                * The same component the package page renders in its Details
                * step. Reached only from the custom path, and only once a match
                * has been picked — which is the whole point: booking a package
                * this way used to skip everything it asks.
                */}
              {activeStep.id === 'package-details' && (
                <div style={{ animation: 'q-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <h3 className="q-page-title" style={{ marginBottom: '8px' }}>About {resolvedPackageName}.</h3>
                  <p className="q-page-subtitle" style={{ marginBottom: '40px' }}>
                    A few things this package needs to know.
                  </p>
                  <PackageQuestions
                    openClassifications={effectiveOpenClassifications}
                    chosenClassifications={chosenClassifications}
                    setChosenClassifications={setChosenClassifications}
                    openVariables={effectiveOpenVariables}
                    variableAnswers={variableAnswers}
                    setVariableAnswers={setVariableAnswers}
                    formSchema={effectiveFormSchema}
                    customFields={customFields}
                    setCustomFields={setCustomFields}
                  />
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

                    {/*
                      * What was answered ABOUT the package, as opposed to what
                      * was described in order to find one.
                      *
                      * "Just to make sure we got everything right" has to include
                      * the things actually asked, and this showed none of them —
                      * not the classification the client settled, not the
                      * variables they set. Harmless while the custom path asked
                      * nothing; not once it asks a step's worth.
                      */}
                    {(() => {
                      const answered: { label: string; value: string }[] = [];
                      for (const c of effectiveOpenClassifications) {
                        const chosen = c.values.find((v) => v.id === chosenClassifications[c.dimensionId]);
                        if (chosen) answered.push({ label: c.name, value: chosen.name });
                      }
                      for (const v of effectiveOpenVariables) {
                        const raw = variableAnswers[v.id];
                        if (raw != null && raw !== '') {
                          answered.push({ label: v.label, value: v.unit ? `${raw} ${v.unit}${String(raw) === '1' ? '' : 's'}` : String(raw) });
                        }
                      }
                      for (const field of effectiveFormSchema) {
                        const val = customFields[field.id];
                        if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) continue;
                        answered.push({ label: field.label, value: fieldType(field.type).display(val) });
                      }
                      if (answered.length === 0) return null;

                      return (
                        <div style={{ marginBottom: '24px' }}>
                          <div className="q-meta" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '8px' }}>About your package</div>
                          <div className="q-stack q-stack-xs">
                            {answered.map((a, i) => (
                              <div key={`${a.label}-${i}`} style={{ fontSize: '0.95rem', color: 'var(--q-color-ink-700)' }}>
                                <span style={{ color: 'var(--q-color-ink-400)' }}>{a.label}: </span>
                                {a.value}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

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
                disabled={loadingIntake}
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
                : activeStep.id === 'match' && loadingIntake
                  ? 'Loading…'
                  /* Only when the next thing really is the review. With
                     questions still to answer this said "Book this package"
                     over a button that opened another step. */
                  : activeStep.id === 'match' && resolvedPackageId && !hasPackageStep
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


/**
 * The questions a package asks of whoever books it.
 *
 * ONE DEFINITION, used by both ways in. The package page knows which package
 * it is before it renders and asks these in the Details step. The custom path
 * does not know until the client picks a match, so it asks them in a step of
 * its own after the match — the same questions, rendered by the same code,
 * because two copies of this is exactly how the custom path came to ask none
 * of them.
 */
function PackageQuestions({
  openClassifications,
  chosenClassifications,
  setChosenClassifications,
  openVariables,
  variableAnswers,
  setVariableAnswers,
  formSchema,
  customFields,
  setCustomFields,
}: {
  openClassifications: { dimensionId: string; name: string; question: string | null; values: { id: string; name: string }[] }[];
  chosenClassifications: Record<string, string>;
  setChosenClassifications: (v: Record<string, string>) => void;
  openVariables: any[];
  variableAnswers: Record<string, string>;
  setVariableAnswers: (v: Record<string, string>) => void;
  formSchema: any[];
  customFields: Record<string, any>;
  setCustomFields: (v: Record<string, any>) => void;
}) {
  return (
                      <div className="q-stack q-stack-lg">
                        {/*
                          * WHICH ONE, asked before anything that follows from it.
                          *
                          * A package offering Birthday, Anniversary and
                          * Convocation is offering a choice; a booking of it is
                          * for exactly one. Nothing asked this before, so every
                          * booking carried all three.
                          *
                          * It comes first because the rest of the form may be
                          * about the answer — the date of the occasion means
                          * nothing until the occasion is settled.
                          */}
                        {openClassifications.length > 0 && (
                          <div className="q-stack q-stack-md">
                            {openClassifications.map((c) => (
                              <div key={c.dimensionId} className="q-field">
                                <label className="q-label">{c.question || c.name}</label>
                                <select
                                  className="q-select q-input-lg"
                                  value={chosenClassifications[c.dimensionId] || ''}
                                  onChange={(e) => setChosenClassifications({
                                    ...chosenClassifications, [c.dimensionId]: e.target.value,
                                  })}
                                  required
                                >
                                  <option value="">Choose one</option>
                                  {c.values.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* What the package left open. Asked after which one it
                            is, because some of it follows from that. */}
                        {(() => {
                          if (!openVariables || openVariables.length === 0) return null;
                          
                          const byService = new Map<string, any[]>();
                          for (const v of openVariables) {
                            /* Grouped by what the question actually belongs
                               to. A classification's variable has no service —
                               it is asked because of how the work is
                               classified — and grouping it under one of the
                               services would tell the client it came from
                               there. */
                            const svcName = v.dimensionName || v.serviceName || 'Details';
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
  );
}