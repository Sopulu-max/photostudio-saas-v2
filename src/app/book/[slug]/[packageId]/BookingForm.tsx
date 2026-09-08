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
// One rule for "does this cover what they asked?", shared with the studio's own
// screens so the two cannot answer differently.
import { admits, specificity, narrowingFrom, labelledByAnswer } from '@/kernel/classification';

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

/**
 * Answers a client already gave, turned into this form's own state.
 *
 * They narrowed the public catalogue by dimension values and then asked for
 * something it did not have. Those values answer the questions step one asks,
 * so the form opens with them filled in.
 *
 * EVERY ID IS CHECKED AGAINST THE STUDIO'S OWN VOCABULARY. They arrive in a
 * query string, which means they are whatever the visitor typed; one that
 * names no declared value is dropped rather than seeded. There is no way to
 * put a value into this form that the studio has not declared.
 *
 * THE DOMAIN FOLLOWS, BUT ONLY WHEN IT IS UNAMBIGUOUS. Choosing a Photography
 * occasion says the client is booking photography, so the domain question has
 * been answered too and asking it again would be asking twice. But a dimension
 * can be shared — Glamour's Photography and Videography both ask Occasion, with
 * the same values — and there the value says nothing about which, so the
 * question stands and the client answers it.
 */
function seedFromCarried(
  dimensionConfig: IntakeDimension[] | undefined,
  carriedValueIds: string[],
): { selections: Record<string, string>; domains: string[] } {
  const selections: Record<string, string> = {};
  const domains = new Set<string>();
  if (!dimensionConfig || carriedValueIds.length === 0) return { selections, domains: [] };

  for (const valueId of carriedValueIds) {
    const rows = dimensionConfig.filter((d) => d.values.some((v) => v.id === valueId));
    if (rows.length === 0) continue;              // not this studio's — dropped

    // One answer per question: a second value for a dimension already settled
    // is a contradiction, and the first one wins rather than the last.
    if (selections[rows[0].id]) continue;
    selections[rows[0].id] = valueId;

    const offeredBy = new Set(rows.map((d) => d.domainName).filter(Boolean) as string[]);
    if (offeredBy.size === 1) domains.add([...offeredBy][0]);
  }

  return { selections, domains: [...domains] };
}

type PackageWithDimensions = {
  id: string;
  name: string;
  description: string | null;
    duration_minutes: number | null;
      services: { id: string; name: string }[];
  dimensionValueIds: string[];
  /** Each narrowed value with the question it answers — what the rule needs. */
  dimensions?: { valueId: string; dimensionId: string }[];
  /** The studio's own picture for it, shown on the card. */
  cover_url?: string | null;
  cover_position?: string | null;
  /** What it promises, by name — what the client is actually buying. */
  deliverables?: { id: string; name: string; quantity: number | null }[];
  /** One line for the card. Falls back to the full description, trimmed. */
  short_description?: string | null;
};

/**
 * How a package answers what the client described.
 *
 * THE SAME RULE THE STUDIO'S OWN SCREENS USE, which it was not. This counted
 * how many chosen values a package carried and stopped there — it ranked, but
 * it never RULED ANYTHING OUT. So a package that had narrowed Occasion to
 * Wedding was still offered to somebody asking for a maternity shoot, merely
 * scored zero and greyed a little, and could be picked. Meanwhile resolution on
 * the studio's side excluded exactly those. Two answers to one question, and
 * the client got the looser one.
 *
 * admits decides whether it can cover this at all — including that a dimension
 * the package never narrowed accepts any value of it — and specificity decides
 * what to show first. Both live in the kernel, so neither side can drift.
 */
function fitOf(pkg: PackageWithDimensions, selections: Record<string, string>) {
  const narrowing = narrowingFrom(
    (pkg.dimensions || []).map((d) => ({ dimensionId: d.dimensionId, valueId: d.valueId })),
  );
  const answers = Object.entries(selections)
    .filter(([, valueId]) => Boolean(valueId))
    .map(([dimensionId, valueId]) => ({ dimensionId, valueId }));
  return { covers: admits(narrowing, answers), carried: specificity(narrowing, answers) };
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
  /**
   * The values this studio has said mean its own premises.
   *
   * Opening hours are a fact about a building. Telling somebody booking a
   * wedding at their own venue that "we are closed that day" is a statement
   * about the studio's office and nothing to do with their shoot.
   */
  premisesValueIds?: string[];
  /** What the package on this page narrows itself to, when there is one. */
  packageValueIds?: string[];
  /**
   * The studio's public handle, so a package can be opened on its own page.
   *
   * Only the custom path needs it: that is where packages are browsed. A
   * package page showing this form is already the detail page.
   */
  studioSlug?: string;
  /**
   * Dimension values the client already chose, before this form opened.
   *
   * They narrowed the catalogue by them and then asked for something it did
   * not have. Those are answers to the questions this form's first step asks,
   * so it starts from them rather than asking again.
   *
   * UNTRUSTED: they arrive in a query string. Each is looked up in the
   * studio's own dimensionConfig below and anything not found there is
   * dropped, so no value can be seeded that the studio did not declare.
   */
  carriedValueIds?: string[];
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
  premisesValueIds = [],
  packageValueIds = [],
  studioSlug,
  carriedValueIds = [],
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
  /* Resolved once, and only used as the opening state — a client who then
     changes an answer is not overruled by the URL they arrived on. */
  const carried = useMemo(
    () => seedFromCarried(dimensionConfig, carriedValueIds),
    [dimensionConfig, carriedValueIds.join('|')],
  );
  const [dimensionSelections, setDimensionSelections] = useState<Record<string, string>>(carried.selections);
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
  const [intakeDomainList, setIntakeDomainList] = useState<string[]>(carried.domains);
  const [resolvedPackageId, setResolvedPackageId] = useState<string | null>(null);
  const [resolvedPackageName, setResolvedPackageName] = useState<string | null>(null);

  /** Choosing a package, or unchoosing the one already chosen. */
  const choose = (id: string, name: string) => {
    setResolvedPackageId((current) => (current === id ? null : id));
    setResolvedPackageName((current) => (resolvedPackageId === id ? null : name));
  };
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

  /*
   * Whether what is being booked needs the studio's own building.
   *
   * From the package being booked, or from the values the visitor themselves
   * chose on the custom path — and from a match once they pick one. Null while
   * nothing is known, because silence is not "no building" and a client should
   * never be told the studio is shut for work that does not happen there.
   */
  const atPremises = useMemo(() => {
    if (premisesValueIds.length === 0) return null;
    const marked = new Set(premisesValueIds);
    const matched = (availablePackages || []).find((p) => p.id === resolvedPackageId);
    const ids = [
      ...packageValueIds,
      ...(matched?.dimensions || []).map((d) => d.valueId),
      ...Object.values(dimensionSelections).filter(Boolean),
    ];
    if (ids.length === 0) return null;
    return ids.some((id) => marked.has(id));
  }, [premisesValueIds, packageValueIds, availablePackages, resolvedPackageId, dimensionSelections]);

  const isCustom = packageId === 'custom';
  const hasFormSchema = formSchema && formSchema.length > 0;
  const hasVariant = variant && variant.tiers.length > 0;
  const intakeDomains = useMemo(
    () => [...new Set((dimensionConfig || []).map(d => d.domainName).filter(Boolean))] as string[],
    [dimensionConfig]
  );
  /*
   * A studio working in one domain never chooses — there is nothing to
   * disambiguate, so nothing is asked and its own domain is simply active.
   */
  const activeDomains = intakeDomainList.length > 0
    ? intakeDomainList
    : (intakeDomains.length === 1 ? [intakeDomains[0]] : []);
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
    const rows = (dimensionConfig || []).filter(
      (d) => activeDomains.length === 0 || (d.domainName ? activeDomains.includes(d.domainName) : true),
    );
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
  }, [dimensionConfig, activeDomains.join('|')]);
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

  /*
   * WHAT EACH QUESTION HAS BEEN ANSWERED AS, BY NAME.
   *
   * Gathered from both places an answer can come from, because a client
   * reaches the same field by two routes: on the custom path they say
   * Birthday at intake, before any package is chosen; on a package's own page
   * they say it here, among the choices that package left open.
   *
   * The server has already done this for anything the PACKAGE settled — a
   * package narrowed to Birthday arrives with its labels resolved — so this is
   * only for answers given on this form, and finds nothing for the rest.
   */
  const answeredAs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of effectiveOpenClassifications as any[]) {
      const name = (c.values || []).find((v: any) => v.id === chosenClassifications[c.dimensionId])?.name;
      if (name) out[c.dimensionId] = name;
    }
    for (const d of dimensionConfig || []) {
      const name = d.values.find((v) => v.id === dimensionSelections[d.id])?.name;
      if (name) out[d.id] = name;
    }
    return out;
  }, [effectiveOpenClassifications, chosenClassifications, dimensionConfig, dimensionSelections]);

  /** Whether the matched package has anything of its own to ask. */
  const hasPackageStep = isCustom && !!resolvedPackageId && !loadingIntake && (
    effectiveFormSchema.length > 0
    || effectiveOpenVariables.length > 0
    || effectiveOpenClassifications.length > 0
  );

  const scoredPackages = useMemo(() => {
    if (!availablePackages || !availablePackages.length) return [];
    return [...availablePackages]
      .map((pkg) => ({ ...pkg, ...fitOf(pkg, dimensionSelections) }))
      /*
       * What can cover this first, most specific of those first. What cannot
       * still appears — browsing the catalogue is a legitimate thing to do, and
       * refusing to show it would be worse than showing it honestly — but it is
       * never presented as a match.
       */
      .sort((a, b) => Number(b.covers) - Number(a.covers) || b.carried - a.carried);
  }, [availablePackages, dimensionSelections]);

  const hasSelections = Object.values(dimensionSelections).some(v => v);
  const hasMatches = scoredPackages.some((p) => p.covers && p.carried > 0);

  const hasOpenVariables = !isCustom && openVariables.length > 0;
  const steps: { title: string; id: string }[] = [{ title: 'You', id: 'personal' }];
  /*
   * ALWAYS, BECAUSE THE DATE LIVES HERE.
   *
   * This step was conditional on the package having questions to ask — and the
   * booking's date and time is inside it. So a package that fixes everything,
   * which is the commonest kind and exactly what a studio sends when they have
   * already agreed terms, gave the client no way to say WHEN. They filled in
   * their name, pressed submit, and the booking arrived with no date on it,
   * which keeps it off the calendar entirely.
   *
   * The mistake underneath: when a booking happens is a fact about the BOOKING,
   * and it was placed inside a section whose existence depends on what the
   * PACKAGE left open. Those are different things and only one of them is
   * optional.
   */
  steps.push({ title: 'Details', id: 'details' });
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
              {/*
                * WHAT ACTUALLY HAPPENED, AND NOTHING MORE.
                *
                * This screen used to say "keep an eye on {email} for next
                * steps", which told a client to watch an inbox nothing sends
                * to. The request lands in the studio's dashboard and a person
                * follows it up; there is no confirmation email in this system.
                *
                * So it states the fact — the request was submitted, and where
                * the studio will reach them — rather than making a promise on
                * the studio's behalf that the software does not keep.
                */}
              <h2 className="q-page-title" style={{ marginBottom: '12px' }}>Request submitted</h2>
              <p className="q-page-subtitle" style={{ margin: '0 auto 24px' }}>
                Your request for <strong className="q-doc-strong">{displayPackageName}</strong> has been sent to the studio.
              </p>
              <div className="q-card" style={{ display: 'inline-block', backgroundColor: 'var(--q-color-ink-50)' }}>
                <p className="q-meta" style={{ margin: 0, color: 'var(--q-color-ink-600)' }}>The studio will contact you at <strong>{email}</strong>.</p>
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
                  <h3 className="q-page-title" style={{ marginBottom: '8px' }}>Your details</h3>
                  {/* Was "What should we call you and how can we reach you?" —
                      the software speaking as the studio, to a stranger. The
                      fields are labelled; this says what the step is for. */}
                  <p className="q-page-subtitle" style={{ marginBottom: '40px' }}>Name and contact details.</p>
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
                  {/* Was "Requirements", which to somebody filling in a form
                      reads as a list of things THEY have to satisfy before the
                      studio will take the booking. It is the opposite: these
                      are the studio's questions, and every one is optional. */}
                  <h3 className="q-page-title" style={{ marginBottom: '8px' }}>Details</h3>
                  <p className="q-page-subtitle" style={{ marginBottom: '40px' }}>All optional. Anything you leave blank, the studio will ask about.</p>
                  <div className="q-stack q-stack-xl">
                    {isCustom ? (
                      <>
                        {hasDimensions && (
                          <div className="q-stack q-stack-lg">
                            {intakeDomains.length > 1 && (
                              <div>
                                <label className="q-label" style={{ fontSize: '1rem', marginBottom: '8px' }}>
                                  Service
                                  <span style={{ marginLeft: '6px', color: 'var(--q-color-ink-400)', fontWeight: 400 }}>(Optional)</span>
                                </label>
                                {/*
                                  * MORE THAN ONE, BECAUSE PEOPLE BOOK MORE THAN
                                  * ONE. This was a single select, so a client
                                  * wanting photography AND video for the same
                                  * wedding could not say so — the nearest thing
                                  * on offer was "Not sure yet", which is a
                                  * statement about their certainty rather than
                                  * about the job.
                                  */}
                                {/*
                                  * Pills, as the services cards state the same
                                  * vocabulary. A checkbox row reads as a form
                                  * field; these are the studio's own kinds of
                                  * work, and they look the same wherever they
                                  * appear.
                                  */}
                                <div className="q-fact-values">
                                  {intakeDomains.map((d) => {
                                    const on = intakeDomainList.includes(d);
                                    return (
                                      <button
                                        key={d}
                                        type="button"
                                        aria-pressed={on}
                                        className={`q-fact q-fact-pick${on ? ' q-fact-on' : ''}`}
                                        onClick={() => {
                                          // Answers belong to the domain that asked them.
                                          setIntakeDomainList((prev) =>
                                            prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
                                          setDimensionSelections({});
                                        }}
                                      >
                                        {d}
                                      </button>
                                    );
                                  })}
                                </div>
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
                                    {activeDomains.length !== 1 && dim.domainName && (domainsPerDimension.get(dim.id)?.size ?? 1) === 1 && (
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
                            placeholder="Anything the studio should know about the work."
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
                        answeredAs={answeredAs}
                        variableAnswers={variableAnswers}
                        setVariableAnswers={setVariableAnswers}
                        formSchema={effectiveFormSchema}
                        customFields={customFields}
                        setCustomFields={setCustomFields}
                      />
                    )}

                    <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '32px' }}>
                      <label className="q-label" style={{ fontSize: '1rem', marginBottom: '8px' }}>
                        {/*
                          * "Booking", because there is now more than one date
                          * on this form.
                          *
                          * A classification can carry a date of its own — an
                          * occasion has one — so a client booking a birthday
                          * shoot is asked for the Birthday Date and, just
                          * below, for this. Unqualified, "Date and time" does
                          * not say which of the two is the appointment, and
                          * the two are genuinely different: the shoot may be
                          * the week before the birthday.
                          */}
                        Booking date and time
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
                        The studio confirms this before it is fixed.
                      </p>
                      <input type="datetime-local" className="q-input q-input-lg" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
                      {atPremises === true && dayHours && (dayHours.closed || dayHours.opensAt || dayHours.closesAt) && (() => {
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
                  <h3 className="q-page-title" style={{ marginBottom: '8px' }}>Packages</h3>
                  <p className="q-page-subtitle" style={{ marginBottom: '40px' }}>
                    {hasSelections && hasMatches
                      ? 'Ranked by fit. Select one, or skip and the studio will put something together.'
                      : hasSelections && !hasMatches
                        ? 'No package matches exactly. Select the closest, or skip and the studio will put something together.'
                        : 'Select a package, or skip and the studio will put something together.'}
                  </p>

                  {/*
                    * A GRID OF POSTERS, NOT A STACK OF ROWS.
                    *
                    * These were full-width rows carrying the whole description,
                    * so three packages filled the page and ten would have been
                    * a scroll with no shape. And the studio's own picture — the
                    * thing a client recognises faster than they read a name —
                    * sat in a thumbnail beside the text.
                    *
                    * The picture is the card now. Everything else sits on it
                    * over a scrim, the description is trimmed to two lines
                    * because it is a hint rather than the sell, and what the
                    * package actually PROMISES is named rather than counted.
                    */}
                  <div className="q-poster-grid">
                    {scoredPackages.map(pkg => {
                      const isSelected = resolvedPackageId === pkg.id;
                      /*
                       * Dimmed only when something ELSE covers this and it does
                       * not. Dimming on `!covers` alone greyed out the entire
                       * list the moment nothing matched exactly — so a page
                       * whose whole purpose is "we still sell things, just not
                       * this exactly" rendered every option as unavailable.
                       */
                      const isDimmed = hasSelections && hasMatches && !pkg.covers;
                      const cover = pkg.cover_url || null;
                      const promises = pkg.deliverables || [];
                      return (
                        <div
                          key={pkg.id}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          className={[
                            'q-poster',
                            cover ? '' : 'q-poster-blank',
                            isSelected ? 'q-poster-on' : '',
                            isDimmed ? 'q-poster-dim' : '',
                          ].filter(Boolean).join(' ')}
                          style={cover
                            ? { backgroundImage: `url(${cover})`, backgroundPosition: pkg.cover_position || undefined }
                            : undefined}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(pkg.id, pkg.name); }
                          }}
                          onClick={() => choose(pkg.id, pkg.name)}
                        >
                          {isSelected && <span className="q-poster-check">&#10003;</span>}

                          {/*
                            * The package's own page, WITHOUT LOSING THE FORM.
                            *
                            * Everything typed so far — name, contact, what they
                            * described — is state in this dialog, so navigating
                            * away would throw it out and start the booking
                            * again. A new tab lets somebody read the full
                            * description and come back to a form still filled
                            * in. stopPropagation because the card behind this
                            * selects.
                            */}
                          {studioSlug && (
                            <a
                              className="q-poster-link"
                              href={`/book/${studioSlug}/${pkg.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`Open ${pkg.name} in a new tab`}
                            >
                              Details
                            </a>
                          )}

                          <span className="q-poster-title">{pkg.name}</span>

                          {/* The line written for a card, or the paragraph
                              trimmed to fit — which is what happened before
                              there was anywhere to write the line. */}
                          {(pkg.short_description || pkg.description) && (
                            <span className="q-poster-note q-clamp-2">
                              {pkg.short_description || pkg.description}
                            </span>
                          )}

                          {/*
                            * What they get, named. A count told a client "2
                            * deliverables" and left them to guess which two —
                            * and this is the thing they are buying.
                            */}
                          {promises.length > 0 && (
                            <span className="q-poster-tags">
                              {promises.slice(0, 3).map((d) => (
                                <span key={d.id} className="q-poster-tag">
                                  {d.quantity ? `${d.quantity} × ${d.name}` : d.name}
                                </span>
                              ))}
                              {promises.length > 3 && (
                                <span className="q-poster-tag">+{promises.length - 3}</span>
                              )}
                            </span>
                          )}

                          {promises.length === 0 && pkg.duration_minutes ? (
                            <span className="q-poster-tags">
                              <span className="q-poster-tag">{pkg.duration_minutes} minutes</span>
                            </span>
                          ) : null}

                          {/*
                            * WHAT IT ACTUALLY INCLUDES, once it is chosen.
                            *
                            * Selecting a package used to change nothing on
                            * screen except a radio and a button reading
                            * "Loading…", so the one moment a client wants to
                            * know more showed them less than before they
                            * clicked.
                            */}
                          {isSelected && pkg.services && pkg.services.length > 0 && (
                            <span className="q-poster-tags q-appear">
                              {pkg.services.map((sv) => (
                                <span key={sv.id} className="q-poster-tag">{sv.name}</span>
                              ))}
                              {loadingIntake && <span className="q-poster-tag">Checking&hellip;</span>}
                            </span>
                          )}
                        </div>
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
                  <h3 className="q-page-title" style={{ marginBottom: '8px' }}>{resolvedPackageName}</h3>
                  <p className="q-page-subtitle" style={{ marginBottom: '40px' }}>
                    Additional details for this package.
                  </p>
                  <PackageQuestions
                    openClassifications={effectiveOpenClassifications}
                    chosenClassifications={chosenClassifications}
                    setChosenClassifications={setChosenClassifications}
                    openVariables={effectiveOpenVariables}
                    answeredAs={answeredAs}
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
                  <h3 className="q-page-title" style={{ marginBottom: '8px' }}>Review</h3>
                  <p className="q-page-subtitle" style={{ marginBottom: '40px' }}>Check these before submitting.</p>
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
                  ? 'Checking\u2026'
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
  answeredAs,
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
  /** What each dimension has been answered as, by name — see the note above. */
  answeredAs: Record<string, string>;
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
                          
                          /*
                           * GROUPED BY THE SERVICE, AND NOT BY THE DIMENSION.
                           *
                           * This headed a classification's questions with the
                           * dimension's name, so a client booking an outdoor
                           * shoot read a section called "Context" — a word
                           * from this schema that means nothing to them — and
                           * then a section called "Occasion", directly below
                           * the question "What occasion is it for?" that they
                           * had just answered. The same idea twice, under two
                           * names, with an unrelated block in between.
                           *
                           * A dimension name is the studio's name for a
                           * QUESTION. It belongs on the studio's screens,
                           * where an operator knows their own vocabulary and
                           * needs to see where a question came from. To a
                           * client it is internal, and the field's own label
                           * already says what is being asked — "Birthday
                           * Date", "Location Address" — so the heading was
                           * adding a schema word and nothing else.
                           *
                           * A SERVICE NAME IS NOT THE SAME KIND OF THING.
                           * "Event Photography" is something the client is
                           * buying, so questions belonging to a service still
                           * group under it. Only the schema words go.
                           */
                          const byService = new Map<string, any[]>();
                          for (const v of openVariables) {
                            const list = byService.get(v.serviceName || '') || [];
                            list.push(v);
                            byService.set(v.serviceName || '', list);
                          }
                          
                          return Array.from(byService.entries()).map(([serviceName, vars]) => (
                            <div key={serviceName} className="q-card q-stack q-stack-sm">
                              {/* Headed only where the heading says something.
                                  A classification's questions have no service
                                  and now carry no heading at all. */}
                              {serviceName && (
                                <h3 className="q-section-title" style={{ margin: '0 0 16px' }}>{serviceName}</h3>
                              )}
                              <div className="q-stack q-stack-md">
                                {vars.map((v: any) => {
                                  const val = variableAnswers[v.id] ?? '';
                                  const set = (raw: string) => setVariableAnswers({ ...variableAnswers, [v.id]: raw });
                                  return (
                                    <div className="q-field" key={v.id}>
                                      <label className="q-label" style={{ fontSize: '0.95rem' }}>
                                        {/* "Occasion Date" becomes "Birthday
                                            Date" the moment they say Birthday.
                                            Asking about the occasion under a
                                            heading that still says Occasion
                                            reads as a second, different one. */}
                                        {labelledByAnswer(v.label, v.dimensionName, answeredAs[v.dimensionId])}
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