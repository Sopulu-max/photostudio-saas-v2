'use client';

import React, { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBooking, addBookingLine, setLineConfiguration, createContractForBooking,
  // What the studio's day is like, and what is already on it.
  studioDay, whatElseIsOn,
} from '@/modules/bookings/interface';
import {
  createInvoiceForBooking,
  // The same composition the server uses when it writes the lines, so what is
  // shown here and what is raised cannot describe the work differently.
  describeInvoiceLine, invoiceLineAmount, billingShare, taxOn,
} from '@/modules/finances/interface';
import { addBookingTask } from '@/modules/production/interface';
import { createClient, updateClient } from '@/modules/clients/interface';
import { ClientPicker, clientEdits, type ClientSelection } from '@/components/ClientPicker';
import {
  getPackage, createPackage,
  // What the package left for the client to answer, and the call that settles
  // a classification it narrowed to more than one.
  getOpenQuestionsForPackage, answerPackageClassifications,
} from '@/modules/packages/interface';
// The one widget for one variable, and the one parser that turns what was typed
// into what is meant. The storefront draws the same questions with the same two,
// so a shape that works for a client works here.
import { VariableField } from '@/components/VariableField';
import { useArrivals } from '@/components/useArrivals';
import { parseVariableValue, formatVariableValue } from '@/modules/services/variableTypes';
import { PackageFieldsEditor } from '../packages/[id]/PackageFieldsEditor';
import { CatalogFilter } from '@/components/CatalogFilter';
import { toStored, hasPrice } from '@/kernel/money';
// How money reads, from the one place that decides it.
import { formatMoney } from '@/kernel/currency';
import { toast, readableError } from '@/components/Toast';

type Option = { id: string; name: string; email?: string; phone?: string };

export type PackageOption = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number | null;
  services: string[];
  deliverables: string[];
  dimensions: { id: string, name: string, values: { id: string, name: string }[] }[];
};

export type ServiceOption = {
  id: string;
  name: string;
  domainName: string;
};

export function NewBookingForm({ 
  clients, 
  packages,
  services,
  dimensionsByDomain,
  allServices,
  allVariables,
  allDeliverables,
  
  
  roleOptions,
  // Defaulted: this is mapped over during render, so a missing prop would take
  // the whole page down rather than degrade.
  roleChoices = [],
  currencyCode,
  depositDefault,
  taxRate,
}: {
  clients: Option[]; 
  packages: PackageOption[];
  services: ServiceOption[];
  dimensionsByDomain: Record<string, any[]>;
  allServices: any[];
  allVariables: any[];
  allDeliverables: any[];
  roleOptions: string[];
  /** Roles with their ids, for setting one on a task the studio adds here. */
  roleChoices: { id: string; name: string }[];
  currencyCode: string;
  /** What the studio asks for up front, from Contracts settings. */
  depositDefault: number;
  /** What the studio charges on top, frozen onto the invoice as it is raised. */
  taxRate: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /** The studio's currency, for figures shown while the form is being filled in. */
  /*
   * How money reads is decided once, in kernel/currency, which calls itself
   * the shared formatting home and holds the studio's own symbol table.
   *
   * This form had its own Intl.NumberFormat instead, and the two disagreed: the
   * package cards in the rail said ₦200,000 while the figures at the foot of
   * the sections below them said NGN 200,000 — the same amount, twice, on one
   * screen, because a second formatter cannot help but drift from the first.
   */
  const formatAmount = (n: number) => formatMoney(n, currencyCode);

  const [client, setClient] = useState<ClientSelection | null>(null);
  const [when, setWhen] = useState('');
  /** What the client asked for, in their words. See the field below. */
  const [brief, setBrief] = useState('');
  /*
   * What else to draw up while booking.
   *
   * Off by default, and ticked deliberately: raising paper is an operator's
   * decision, not something a booking does to itself. Both can equally be done
   * later from the booking, and either can be edited or withdrawn there — this
   * only saves the trip for the common case where the studio already knows it
   * is sending a contract and an invoice.
   */
  /*
   * The invoice and the contract, as fields of the booking rather than as things
   * asked about beside it. Both are raised with it; both can be changed or
   * withdrawn on the booking afterwards, which is where "or not" is answered —
   * not by a checkbox on the way in.
   */
  /*
   * Work this booking involves beyond what its packages already cover.
   *
   * Held here and written once the booking exists, because a task belongs to
   * a booking and there is no booking to belong to yet.
   */
  const [extraTasks, setExtraTasks] = useState<{ name: string; roleId: string }[]>([]);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskRoleId, setNewTaskRoleId] = useState('');

  /*
   * How much of the booking this first invoice is for.
   *
   * The only thing that genuinely varies per invoice. Everything else about
   * it — what the lines are, what they cost — is already settled by the
   * packages above, so asking again would be asking twice.
   */
  const [invoicePortion, setInvoicePortion] = useState<'full' | 'deposit'>('full');
  const [invoiceDue, setInvoiceDue] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [deposit, setDeposit] = useState(String(depositDefault));
  
  type LineState = {
    id: string;
    packageId: string;
    customName?: string;
    selectedPackageDeep: any;
    isLoadingDeep: boolean;
    linePrice: string;
    selectedDimensionValues: Record<string, string>;
    /** What was typed while looking for a package — becomes its name if none exists. */
    /*
     * WHAT THIS PACKAGE LEAVES OPEN, AND WHAT THE CALLER SAID.
     *
     * The same two things the storefront asks a client, asked of whoever is
     * taking the booking. Kept per line because they are answers about one
     * package: two lines on a booking leave different things open.
     */
    openQuestions: { variables: any[]; classifications: any[] } | null;
    /** Raw as typed; parsed once, on submit, by the one parser. */
    variableAnswers: Record<string, string>;
    /** One value per classification the package narrowed to more than one. */
    chosenClassifications: Record<string, string>;
  };

  const freshLine = (): LineState => ({
    id: Math.random().toString(36).substr(2, 9),
    packageId: '',
    customName: '',
    selectedPackageDeep: null,
    isLoadingDeep: false,
    linePrice: '',
    selectedDimensionValues: {},
    openQuestions: null,
    variableAnswers: {},
    chosenClassifications: {},
  });

  /*
   * Empty, because a booking with no packages on it has no packages on it.
   *
   * It used to start with one blank line, since a blank line was the only way
   * to reach the catalogue. That is no longer what a line is for: a line is a
   * package this booking includes, and it comes into existence by choosing one.
   */
  const [lines, setLines] = useState<LineState[]>([]);
  /*
   * The catalogue's own narrowing, which belongs to the catalogue and not to
   * any line. Each line still keeps the values it was found under — that is
   * what a custom package built from a fruitless search is classified by — so
   * they are copied onto the line at the moment it is added.
   */
  /*
   * WHAT THE STUDIO'S DAY IS LIKE, AND WHO ELSE IS IN IT.
   *
   * resolveScheduledFor already refuses a closed day on the INTAKE path, and
   * that stays where it is — a rule enforced only in a browser is not enforced.
   * But the studio scheduling its own work is deliberately never refused
   * (enforceHours: false), which is right: a studio may open on a Sunday for
   * somebody. Right, and silent — so an operator could put a booking on a day
   * their own studio is closed and be told nothing at all.
   *
   * And nothing anywhere checked whether the slot was already taken. Two
   * bookings could hold the same Saturday at two o'clock, each unaware.
   *
   * Told, not refused. Whether this studio can run two shoots at once is a fact
   * about the studio that nothing here has been told, and a booking wrongly
   * refused is worse than one taken with open eyes.
   */
  const [dayHours, setDayHours] = useState<{ opensAt: string | null; closesAt: string | null; closed: boolean; label: string | null } | null>(null);
  const [alsoOn, setAlsoOn] = useState<{ bookingId: string; title: string; at: string; stage: string | null }[]>([]);

  React.useEffect(() => {
    const date = when.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setDayHours(null); setAlsoOn([]); return; }
    /*
     * Cleared before asking, not only when the date is unreadable.
     *
     * Without this the previous day's answer stayed on screen while the new one
     * was in flight, so a Wednesday could be told the studio opens at 13:00 —
     * which is true of Sunday and false of Wednesday. A stale true sentence
     * about the wrong day is worse than no sentence, because there is nothing
     * about it that looks wrong.
     */
    setDayHours(null); setAlsoOn([]);
    let live = true;
    Promise.all([studioDay(date), whatElseIsOn(date)])
      .then(([h, others]) => { if (!live) return; setDayHours(h as any); setAlsoOn(others as any); })
      .catch(() => { if (live) { setDayHours(null); setAlsoOn([]); } });
    return () => { live = false; };
  }, [when]);

  const [catalogueValues, setCatalogueValues] = useState<Record<string, string>>({});
  /** Which package lines arrived since the last render. See useArrivals. */
  const arrived = useArrivals(lines.map((l) => l.id));


  // For a given domain, which service ids belong to it?
  const serviceIdsForDomain = React.useCallback((domain: string) => {
    return services.filter(s => s.domainName === domain).map(s => s.id);
  }, [services]);

  // Filter packages: only those containing at least one service in the domain
  /*
   * Every classification this studio uses, deduplicated.
   *
   * It used to be dimensionsByDomain[the one domain the operator had picked],
   * which meant a package classified by both Photography's and Videography's
   * vocabulary could only ever be narrowed by half of it.
   */
  const allDimensions = React.useMemo(() => {
    const byId = new Map<string, any>();
    for (const list of Object.values(dimensionsByDomain || {})) {
      for (const d of (list as any[])) if (!byId.has(d.id)) byId.set(d.id, d);
    }
    return [...byId.values()];
  }, [dimensionsByDomain]);


  // Further filter packages by selected dimensions for a given line
  const filteredPackages = React.useMemo(() => {
    // Every package. Domain is a facet inside the filter below, not a gate in
    // front of it — see the note at the picker.
    const pkgs = packages;
    const selectedDims = Object.entries(catalogueValues).filter(([_, val]) => val !== '');
    if (selectedDims.length === 0) return pkgs;

    return pkgs.filter(pkg => {
      const narrowings = pkg.dimensions || [];
      for (const [dimId, reqValId] of selectedDims) {
        // Support both nested shape (values: []) and flat shape (dimensionId, valueId)
        const pd = narrowings.find((d: any) => d.id === dimId || d.dimensionId === dimId);
        
        // If the package narrowed this dimension, it MUST include the requested value.
        // If it didn't narrow it, it accepts any value (remains open).
        if (pd) {
          const hasValue = pd.values 
            ? pd.values.some((v: any) => v.id === reqValId)
            : (pd as any).valueId === reqValId;
          if (!hasValue) return false;
        }
      }
      return true;
    });
  }, [packages, catalogueValues]);

  const editorRefs = useRef<any[]>([]);

  /**
   * What a chosen package puts on screen.
   *
   * The editor takes catalogs — every service, every deliverable, every variable,
   * every classification the studio has — and ticks the ones the package uses.
   * That is right when you are building a package from nothing. It is wrong the
   * moment a package has been chosen: the operator picked "Golden Hour Portrait"
   * and was shown the studio's entire catalog with a few boxes ticked, which
   * reads as a form to fill in rather than as the thing they just selected.
   *
   * So when a package is chosen, the catalogs are narrowed to what that package
   * actually declares — the services it bundles, the outputs it promises, the
   * variables those services define, and only the classifications it narrowed
   * itself to. A custom line still gets everything, because there is nothing yet
   * to narrow to.
   */
  const scopedFor = (deep: any) => {
    if (!deep) return { services: allServices, variables: allVariables, deliverables: allDeliverables, dimensions: dimensionsByDomain };

    const bundled = (deep.services || []) as any[];
    const serviceIds = new Set(bundled.map((s) => s.id));

    // Only the outputs this package actually promises, across its bundle.
    const promisedIds = new Set(
      bundled.flatMap((s) => ((s.deliverables || []) as any[]).map((d) => d.id)),
    );

    // Only the classifications this package narrowed itself to. Kept per domain
    // so the editor's own grouping still works, and a dimension with none of its
    // values chosen drops out entirely rather than showing empty.
    const narrowedValueIds = new Set(
      bundled.flatMap((s) => ((s.narrowedTo || []) as { values: { id: string }[] }[])
        .flatMap((d) => d.values.map((v: { id: string }) => v.id))),
    );
    const dimensions: typeof dimensionsByDomain = {};
    for (const [domain, dims] of Object.entries(dimensionsByDomain)) {
      const kept = (dims as { id: string; name: string; values: { id: string; name: string }[] }[])
        .map((d) => ({ ...d, values: d.values.filter((v: { id: string }) => narrowedValueIds.has(v.id)) }))
        .filter((d) => d.values.length > 0);
      if (kept.length > 0) dimensions[domain] = kept;
    }

    return {
      services: allServices.filter((s) => serviceIds.has(s.id)),
      variables: allVariables.filter((v: any) => serviceIds.has(v.serviceId)),
      deliverables: promisedIds.size > 0
        ? allDeliverables.filter((d: any) => promisedIds.has(d.id))
        : allDeliverables,
      dimensions,
    };
  };

  /*
   * A PACKAGE IS ADDED BY CHOOSING IT.
   *
   * There is no slot to fill any more, so this makes the line rather than
   * finding one — which also means picking the same package twice puts it on
   * the booking twice, as a studio shooting two sessions would expect, without
   * anything having to allow for it.
   *
   * The line is matched back by its own id when the load returns, not by its
   * position: two of the same package added in quick succession are two
   * different lines, and an index would have filled whichever one the array
   * happened to hand back.
   */
  const addPackage = (id: string, customName?: string) => {
    const line = freshLine();
    line.packageId = id;
    line.customName = customName || '';
    // What it was found under travels with it. See catalogueValues.
    line.selectedDimensionValues = { ...catalogueValues };
    line.isLoadingDeep = Boolean(id) && id !== 'custom';
    setLines((prev) => [...prev, line]);
    if (!line.isLoadingDeep) return;

    Promise.all([
      getPackage(id),
      getOpenQuestionsForPackage(id).catch(() => ({ variables: [], classifications: [] })),
    ]).then(([deep, open]) => {
      setLines((prev) => prev.map((l) => l.id !== line.id ? l : {
        ...l,
        selectedPackageDeep: deep,
        isLoadingDeep: false,
        openQuestions: open,
        linePrice: l.linePrice || (deep.price?.amount != null ? String(deep.price.amount) : ''),
      }));
    }).catch((err) => {
      console.error(err);
      setLines((prev) => prev.map((l) => l.id !== line.id ? l : { ...l, isLoadingDeep: false }));
    });
  };




  /*
   * The work these packages bring, computed where more than one thing can ask.
   * It was built inside section 3's markup, so that section could list the
   * tasks and nothing else could so much as count them.
   */
  const tasksFromPackages = React.useMemo(() => lines.flatMap((line, i) => {
    const deep = line.selectedPackageDeep;
    if (!deep) return [] as { key: string; name: string; role: string | null; pkg: string }[];
    const pkgName = (deep.name as string) || line.customName || `Package ${i + 1}`;
    return ((deep.services || []) as any[]).flatMap((svc: any) =>
      ((svc.tasks || []) as any[])
        .filter((t) => t.is_active !== false)
        .map((t) => ({
          key: `${line.id}:${svc.id}:${t.id}`,
          name: t.name as string,
          role: (t.role?.name ?? null) as string | null,
          pkg: pkgName,
        })));
  }), [lines]);

  /*
   * WHAT THIS BOOKING COMES TO — computed once, for whichever section asks.
   *
   * It lived inside section 4's markup, so section 5 could say "uses the total
   * for these packages" and not name it, and could take a deposit percentage
   * without ever saying what that percentage was OF. An operator quoting on the
   * telephone had to do the arithmetic themselves, from a form that had already
   * done it and thrown it away.
   *
   * Priced at nothing and not priced at all stay different questions: a booking
   * whose boxes are all empty is unquoted, while one deliberately priced at zero
   * is a free job.
   */
  const pricedLines = lines.filter((l) => l.linePrice.trim() !== '');
  const bookingTotal = pricedLines.reduce((sum, l) => sum + (Number(l.linePrice) || 0), 0);
  const isQuoted = pricedLines.length > 0;
  const depositPct = Number(deposit) || 0;
  const depositAmount = Math.round(bookingTotal * (depositPct / 100) * 100) / 100;

  /*
   * THE DOCUMENT THIS FORM IS ABOUT TO RAISE.
   *
   * Section 4 was three settings — how much, when, what to say — and no invoice.
   * The operator configured a document they never saw, quoted the client from
   * the sum at the foot of section 2, and found out what the invoice actually
   * said after the booking was saved. An invoice is lines and a total; this is
   * those, before it exists.
   *
   * Built the way createInvoiceForBooking builds it, through the same helpers:
   * unpriced lines are left off (it refuses to write a 0 nobody quoted onto a
   * document that goes to a client), the share applies to the line total rather
   * than the unit price, and tax goes on the net at the studio's frozen rate.
   *
   * WHAT IT CANNOT SEE. The server describes each line with every value recorded
   * against it, the package's own fixed ones included. Those live inside the
   * package editor until it is asked for them on submit, so what is named here
   * is the package and the answers given on this form. Less specific than the
   * finished line, never contradicting it — describeInvoiceLine does the joining
   * on both sides, so the two can differ in what they know and not in how it
   * reads.
   */
  const invoiceShare = billingShare(invoicePortion === 'deposit' ? depositPct : null);
  const invoiceLabel = invoicePortion === 'deposit' && depositPct > 0 ? `${depositPct}% deposit` : null;

  const draftInvoice = (() => {
    const rows = lines
      .filter((l) => l.packageId && l.linePrice.trim() !== '')
      .map((line) => {
        const title = line.selectedPackageDeep?.name || line.customName?.trim() || 'Booking line';
        const details = (line.openQuestions?.variables || [])
          .filter((v: any) => (line.variableAnswers[v.id] ?? '') !== '')
          .map((v: any) => formatVariableValue({
            // Parsed before it is formatted, exactly as the value that reaches
            // the server is parsed on the way in — "2" formats as "2 outfits"
            // only once it is a number.
            value: parseVariableValue(v.kind, line.variableAnswers[v.id]),
            unit: v.unit ?? null,
          }));

        // Every line this form writes is one of a package, so nothing here
        // carries a quantity other than one.
        const quantity = 1;
        const { amount, unitPrice } = invoiceLineAmount({
          unitAmount: Number(line.linePrice) || 0, quantity, share: invoiceShare,
        });

        return {
          id: line.id,
          description: describeInvoiceLine({ title, details, label: invoiceLabel }),
          quantity, unitPrice, amount,
        };
      });

    const subtotal = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    const tax = taxOn(subtotal, taxRate);
    return { rows, subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
  })();

  /*
   * On the booking, off the invoice.
   *
   * createInvoiceForBooking drops these silently — right, because an unpriced
   * line has no honest amount to demand, and wrong to do without saying so. An
   * operator who priced three of four packages should see which one is missing
   * here, not discover it on the document.
   */
  const unpricedLines = lines
    .filter((l) => l.packageId && l.linePrice.trim() === '')
    .map((l) => l.selectedPackageDeep?.name || l.customName?.trim() || 'A package');

  const submitBooking = () => {
    startTransition(async () => {
      try {
        let finalContactId = client?.id || '';
        if (client && !finalContactId) {
          const name = client.name.trim();
          if (!name) throw new Error('Give the new client a name, or pick an existing one.');
          // Phone and email go on at creation, so a booking never exists with a
          // client nobody can contact.
          const { clientId } = await createClient({
            name,
            email: client.email.trim() || undefined,
            phone: client.phone.trim() || undefined,
          });
          finalContactId = clientId;
        } else {
          // The picker shows an existing client's details and lets them be
          // corrected in place. A wrong number is noticed while booking, and
          // sending the operator elsewhere to fix it is how it stays wrong.
          const edits = clientEdits(client, clients);
          if (edits) await updateClient(edits);
        }

        const submitLines = [];

        // Filled while the lines are built; reported after the booking exists.

        const classificationProblems: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.packageId) continue; // Skip empty slots

          let payload: any = null;
          if (editorRefs.current[i]) {
            payload = editorRefs.current[i].buildPayload();
          }

          if (!payload) {
            throw new Error(`Please configure what the client is getting in package #${i + 1}.`);
          }

          // A booking gets its own package, so later catalog edits cannot rewrite
          // what was agreed. What that instance is called and what status it
          // carries are Packages' decisions — this only says which catalog
          // package it came from, or that it was built from nothing.
          payload.instanceOf = line.packageId === 'custom' ? true : line.packageId;
          // The price the operator settled on goes onto the instance, because
          // the instance is what every later read — the invoice above all —
          // asks for the price.
          //
          // An empty box is not zero. `Number('') || 0` wrote a real 0 onto the
          // instance, and downstream that reads as "this shoot is free" rather
          // than "nobody has quoted it yet" — the collapse src/kernel/money.ts
          // was written to end. `{}` is the stored form for unpriced, and a 0
          // the operator actually typed still means free.
          const typed = line.linePrice.trim();
          const agreedPrice: Record<string, unknown> =
            typed === '' || !Number.isFinite(Number(typed))
              ? {}
              : toStored({ amount: Number(typed), currency: currencyCode });
          payload.price = agreedPrice;
          const { packageId: instanceId } = await createPackage(payload);

          /*
           * THE INSTANCE IS NARROWED TO WHAT THE CALLER SAID.
           *
           * The same step the storefront takes, through the same call: the
           * domain declares five occasions, the package narrows to three, and
           * this narrows to the one. Done on the instance rather than beside
           * the booking, because "this booking is for a birthday" is a fact
           * about what was booked and not an annotation on it — so every later
           * read sees a booking classified Birthday exactly as it would see a
           * package classified Birthday, which it now is.
           *
           * Not fatal. A classification that will not settle must not lose the
           * booking that has already been priced and agreed; it is said, and
           * the booking still lands.
           */
          const chosen = Object.values(line.chosenClassifications).filter(Boolean) as string[];
          if (chosen.length > 0) {
            try {
              await answerPackageClassifications({ packageId: instanceId, valueIds: chosen });
            } catch (e) {
              // Reported with everything else that could not be raised, once
              // the booking itself has landed.
              classificationProblems.push(payload.name || 'a package');
            }
          }

          /*
           * What the package fixed, plus what the caller answered of what it
           * left open. Parsed by the one parser, and only where something was
           * actually said — an untouched field is a question still unanswered,
           * which is not the same as an answer of empty.
           */
          const answered = (line.openQuestions?.variables || [])
            .filter((v: any) => (line.variableAnswers[v.id] ?? '') !== '')
            .map((v: any) => ({
              serviceVariableId: v.id as string,
              value: parseVariableValue(v.kind, line.variableAnswers[v.id]),
            }));

          submitLines.push({
            packageId: instanceId,
            linePrice: agreedPrice,
            variableAnswers: [...(payload.variableValues || []), ...answered],
          });
        }

        /*
         * A booking used to be refused here unless it had a package on it.
         *
         * Nothing in the schema or the domain ever wanted that — bookings.title
         * is the only required column, createBooking takes every other field as
         * optional, and the stage a new booking lands on is the one whose kind
         * means "interested, nothing committed". The form was the only thing
         * insisting a studio must know what it is selling before it can write
         * down that someone called. So an operator picked the nearest package,
         * and a guess entered the record as a fact.
         *
         * What is left is on the button: a booking has to say something, and a
         * client, a date, a brief or a package each count as something.
         */
        const { bookingId } = await createBooking({
          contactId: finalContactId || null,
          lines: submitLines,
          scheduledFor: when || null,
          brief: brief.trim() || null,
        });

        /*
         * Whatever the operator asked for on the way through.
         *
         * Only now, because both are built FROM the booking: the contract sums
         * its lines and the invoice bills them, so neither can exist a moment
         * earlier. An invoice does not wait on the contract though — it is
         * raised from the booking's own lines, and a studio that never sends
         * contracts still bills.
         *
         * Failures here do not lose the booking. It is already saved, and both
         * of these can be raised by hand on its page; throwing now would leave
         * an operator thinking nothing happened when a booking exists.
         */
        /*
         * Both raised now, invoice first, in the order they were filled in.
         *
         * Neither could exist any earlier — an invoice bills the booking's lines
         * and a contract sums them — and a failure in either must not lose the
         * booking, which is already saved. Whatever fails here can be raised by
         * hand on the booking; throwing would leave an operator thinking nothing
         * happened when a booking exists.
         */
        const failed: string[] = [];
        if (classificationProblems.length > 0) {
          failed.push(`the classification on ${classificationProblems.join(' and ')}`);
        }
        // Kept apart from failures: a thing not attempted because the booking
        // is not ready for it is not the same as a thing that broke, and an
        // operator reading one sentence deserves to know which they are looking
        // at.
        const skipped: string[] = [];

        // The studio's own tasks, now that there is a booking to attach them to.
        for (const t of extraTasks) {
          try {
            await addBookingTask({ bookingId, name: t.name, roleId: t.roleId || null });
          } catch (e: any) {
            failed.push(`task “${t.name}” (${e?.message || 'failed'})`);
          }
        }

        /*
         * Also not attempted when it cannot work.
         *
         * The form already noticed this and carried on anyway: it printed "the
         * packages above are not priced, so this invoice will have nothing on
         * it" and then raised that invoice, giving every new enquiry a document
         * demanding nothing. An unquoted booking is the normal state of an
         * enquiry, not a fault, so it is checked here rather than discovered by
         * a throw — and it is a skip, not a failure.
         */
        if (!submitLines.some((l) => hasPrice(l.linePrice))) {
          skipped.push('an invoice (nothing is priced yet)');
        } else if (invoicePortion === 'deposit' && depositPct <= 0) {
          /*
           * A DEPOSIT OF NOTHING IS NOT A DOCUMENT.
           *
           * billingShare(0) is 0, so this billed every line at zero and raised a
           * real invoice for nothing — lines, number, and all — which then has
           * to be withdrawn. The form said so beneath the select and submitted
           * it anyway, which is a warning doing the work of a decision.
           *
           * Skipped rather than refused, like the contract that has no client:
           * the booking is still worth taking, and the invoice can be raised
           * from it the moment a deposit is set.
           */
          skipped.push('an invoice (the deposit is 0%)');
        } else {
          try {
            const pct = invoicePortion === 'deposit' ? Number(deposit) || 0 : null;
            await createInvoiceForBooking({
              bookingId,
              dueAt: invoiceDue ? new Date(invoiceDue).toISOString() : null,
              notes: invoiceNotes.trim() || null,
              percentage: pct,
              label: pct ? `${pct}% deposit` : null,
            });
          } catch (e: any) { failed.push(`invoice (${e?.message || 'failed'})`); }
        }

        /*
         * NOT ATTEMPTED WHEN IT CANNOT WORK.
         *
         * createContractForBooking refuses a booking with no client, and says
         * so in plain words — but it is a server action, and Next redacts a
         * thrown message in production. What reached the operator was "An error
         * occurred in the Server Components render… the specific message is
         * omitted", pasted into a sentence that promised to explain what went
         * wrong. A deliberate, useful message replaced by a framework's apology
         * for not showing it.
         *
         * A missing client is an expected state here, not a fault, so it is
         * checked before the call rather than discovered by one.
         */
        const contractNeeds = !finalContactId
          ? 'no client yet'
          : submitLines.length === 0
            ? 'nothing on it yet'
            : !submitLines.every((l) => hasPrice(l.linePrice))
              ? 'not every package is priced'
              : null;
        if (contractNeeds) {
          skipped.push(`a contract (${contractNeeds})`);
        } else {
          try {
            await createContractForBooking(bookingId, {
              depositPercentage: deposit.trim() === '' ? null : Number(deposit),
            });
          } catch (e: any) { failed.push(`contract (${readableError(e, 'failed')})`); }
        }

        /*
         * THE GOOD NEWS AND THE CAVEAT ARE TWO DIFFERENT MESSAGES.
         *
         * This was one alert reading "The booking is saved. It does not yet
         * have a contract…" — a success and a shortfall in the same grey modal,
         * wearing the same face, and costing a click before the operator could
         * reach the booking they had just made.
         *
         * The booking landing is the answer to what was asked and is always
         * said. Anything outstanding is said separately and in its own tone: an
         * expected gap is information, a failure is not. They stack, so an
         * operator sees both at once and can tell which is which by colour
         * alone.
         *
         * Both survive the router.push below — the Toaster lives in the root
         * layout, so a message raised here is still on screen when the booking
         * page arrives. An alert could not do that; it had to be dismissed
         * before the navigation it was describing could even happen.
         */
        toast.ok('The booking is saved.');
        if (skipped.length > 0) {
          toast.info(`It does not yet have ${skipped.join(' or ')}. You can add that on the booking.`);
        }
        if (failed.length > 0) {
          toast.bad(`The ${failed.join(' and ')} could not be raised. You can do it on the booking.`);
        }

        router.push(`/bookings/${bookingId}`);
      } catch (err: any) {
        toast.bad(readableError(err, 'Failed to book'));
      }
    });
  };

  // One fact is enough. An empty record helps nobody, but which fact it is
  // belongs to whoever picked up the phone, not to this form.
  const hasSomethingToRecord =
    lines.some((l) => l.packageId) || Boolean(client) || Boolean(when) || brief.trim() !== '';

  return (
    <div className="q-stack q-stack-lg">
      {/*
        * The form assembles itself top to bottom.
        *
        * q-rise staggers by nth-child, so five sections arrive forty
        * milliseconds apart — which is the difference between a page that
        * appears and a page that leads. Lumen is described in this repo as
        * motion-first; this vocabulary existed and one screen in the whole app
        * used it.
        */}
      <div className="q-card q-section q-rise">
        <h2 className="q-section-title">1. Date, client and request</h2>
        <div className="q-stack q-stack-md">
          {/*
            * The date comes first because it is the first thing asked on the
            * phone. A studio takes a booking by finding out whether the day is
            * free, and only then whose it is — putting the client above it made
            * the form ask its questions in an order nobody works in.
            */}
          <div className="q-field">
            {/*
              * NAMED FOR THE ONE THING IT MEANS.
              *
              * "Date and time" never said WHICH date, on a record that has
              * three: the day it was written down (created_at), the day the
              * studio works, and the day of the occasion itself. This is the
              * second — it is the only thing listBookingsInRange filters on, so
              * it is the only thing that puts a booking on a calendar, and it
              * pairs with duration_minutes to make a block with a length.
              */}
            <label className="q-label">When the session happens (optional)</label>
            <input className="q-input" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
            <span className="q-meta-sm">
              This is what puts the booking on the calendar. Leave it empty while it is unsettled.
            </span>

            {dayHours && (dayHours.closed || dayHours.opensAt || dayHours.closesAt) && (() => {
              const t = when.slice(11, 16);
              const early = dayHours.opensAt && t && t < dayHours.opensAt;
              const late = dayHours.closesAt && t && t >= dayHours.closesAt;
              const off = dayHours.closed || early || late;
              return (
                <span className={off ? 'q-meta-sm q-text-danger q-appear' : 'q-meta-sm q-appear'}>
                  {dayHours.closed
                    ? `The studio is closed that day${dayHours.label ? ` (${dayHours.label})` : ''}. You can still book it.`
                    : early
                      ? `The studio opens at ${dayHours.opensAt} that day.`
                      : late
                        ? `The studio closes at ${dayHours.closesAt} that day.`
                        : `The studio is open ${dayHours.opensAt ?? '—'} to ${dayHours.closesAt ?? '—'} that day.`}
                </span>
              );
            })()}

            {alsoOn.length > 0 && (
              <span className="q-meta-sm q-appear">
                Already that day: {alsoOn.map((b) => {
                  const at = new Date(b.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                  return `${at} ${b.title}${b.stage ? ` (${b.stage})` : ''}`;
                }).join(' · ')}
              </span>
            )}
          </div>
          <ClientPicker clients={clients} value={client} onChange={setClient} />

          {/*
            * THE QUESTION, NOT THE ANSWER.
            *
            * Everything below this section is the studio's answer: which
            * package, at what price, on what paper. There was nowhere to put
            * what the client actually said, so an operator hearing "something
            * for my mum's 70th, maybe thirty people, thinking June" had two
            * options — force it into a package and a price nobody had agreed,
            * or lose it. The only free text on the whole form was the invoice's
            * notes, which are addressed to the client and printed on a
            * document.
            *
            * A guessed package is not a harmless placeholder. It instantiates,
            * cuts its services' tasks into real work someone gets assigned, and
            * carries a price the invoice then bills. Uncertainty with nowhere
            * to go does not stay uncertain; it gets written down as fact.
            *
            * Deliberately free text and staying that way. Occasion, headcount
            * and subject are dimensions and belong there once they are known;
            * this is for the moment before that, and for everything that never
            * becomes a dimension. Structuring it would rebuild the problem it
            * exists to solve.
            */}
          <div className="q-field">
            <label className="q-label">What they asked for (optional)</label>
            <textarea
              className="q-textarea"
              rows={3}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Something for my mum's 70th, maybe thirty people, thinking a Saturday in June."
            />
            <span className="q-meta-sm">
              Kept as written, on the booking. Use it when the packages below cannot say it yet.
            </span>
          </div>
        </div>
      </div>

      {/*
        * A CARD, LIKE ITS FOUR PEERS.
        *
        * Sections 1, 3, 4 and 5 are cards; this one was the only bare q-section,
        * so it sat on the page ground directly beneath section 1's card and read
        * as part of it — a heading inside the client section rather than the
        * second step of five. The numbering said one thing and the surfaces said
        * another, and the surfaces win.
        */}
      <div className="q-card q-section q-rise">
        <h2 className="q-section-title">2. Packages</h2>
        
        <div className="q-stack q-stack-lg">
        {/*
          * THE STUDIO'S CATALOGUE, ONCE.
          *
          * This lived inside a booking LINE, and an empty line was how you got
          * one. Which meant the catalogue was a property of a slot: three empty
          * lines drew three search boxes, three domain selects, three
          * classification folds, three rails and three "create a new package"
          * buttons — the whole catalogue three times over, with three
          * independent filter states, showing the same two packages. Measured
          * on the live page, not imagined.
          *
          * A catalogue is not a booking line. A booking line is a package the
          * client is buying; an empty line is a SEARCH IN PROGRESS, and a search
          * is not something a booking has. Modelling one as the other is what
          * put the filter two cards deep, what made "Add another package"
          * necessary — a button whose only job was to manufacture an empty slot
          * to browse from — and what let the same catalogue exist three times
          * at once.
          *
          * So: one catalogue, here, under the heading, for the whole section.
          * Below it, the packages actually on this booking. Choosing adds one.
          * There is no empty line to be in, so the state that produced all of
          * the above is now unreachable rather than merely unlikely.
          */}
                <div className="q-stack q-stack-sm">

                  {/*
                    * Narrowing, offered rather than demanded.
                    *
                    * This was a grid headed "Requirements", every classification
                    * the domain has, shown before the operator had seen a single
                    * package. It read as a form to complete on the way to
                    * booking — but none of it is required, and with a handful of
                    * packages none of it is needed. It is a filter, so it is
                    * folded away with a count of what is active, and the packages
                    * themselves lead.
                    */}
                  {/* Matching Packages Stack */}
                  <div className="q-stack q-stack-md">

                    {/*
                      * THE SEARCH IS CatalogFilter'S; THE DIMENSIONS ABOVE ARE NOT.
                      *
                      * Narrowing a list by typing, saying how many of how many
                      * are left, and offering a clear is one act, written here
                      * and in two catalogues and in the service picker. This one
                      * now goes through the same component as the rest.
                      *
                      * The dimension selects above deliberately stay outside it,
                      * and not for want of effort. They do two things a filter
                      * does not. They carry into the package that gets created,
                      * so a search that found nothing becomes a package already
                      * classified the way it was looked for. And they match by
                      * the open-narrowing rule — a package that never narrowed a
                      * dimension accepts any value of it — which is a statement
                      * about the ontology, not a set membership test. Folding
                      * either into a general filter would have meant teaching it
                      * this module's rules.
                      */}
                    <CatalogFilter
                      items={filteredPackages}
                      noun="package"
                      /*
                        * A CATALOGUE, NOW THAT IT IS ONE.
                        *
                        * It was a picker because it used to sit inside a booking
                        * line, where a recessed panel around one control would
                        * have read as a fieldset nobody asked for. It no longer
                        * sits inside anything: it is the studio catalogue, under
                        * the section heading, browsed. So it takes the panel the
                        * other catalogues take — which is what separates the
                        * instrument from the results, and what puts the filter in
                        * its own block with the rail as a block below it.
                        *
                        * Without the view switch: the results are a rail, which
                        * spends the same width on every card whatever Cards or
                        * List says, so the control would do nothing.
                        */
                      kind="catalogue"
                      views={false}
                      // Under a heading already reading "2. Packages", a line
                      // reading "3 packages" is two numbers about one subject,
                      // and they read as a sequence. It returns the moment
                      // something is narrowing, when the count is news and Clear
                      // needs somewhere to live.
                      count={false}
                      // Always drawn: this is the step, not an aid to it.
                      threshold={0}
                      // Every domain this package's services come from, so one
                      // spanning two is kept by either — the same shape the
                      // Packages catalogue reads.
                      facetLabel="domain"
                      /*
                        * Narrowing that belongs to this module, drawn inside
                        * the filter's panel rather than as a second fold
                        * stacked above it. See the note on CatalogFilter's
                        * extra prop for why it cannot simply become tags.
                        */
                      extra={allDimensions.length > 0 && (() => {
        const active = Object.values(catalogueValues).filter(Boolean).length;
        /*
         * No margin of its own. It carried marginBottom: 24px from when it was a
         * standalone block floating above the search bar, and inside the filter's
         * stack that doubled with the 24px the stack already puts between the
         * controls and the results — 48 measured pixels of nothing between the
         * last control and the first card.
         *
         * Spacing between blocks belongs to the stack that holds them, which is
         * also why it should never have been an inline style: a value hard-coded
         * onto an element cannot know what container it will end up in.
         */
        return (
        <details className="q-stack q-stack-md" open={active > 0}>
          <summary className="q-strong" style={{ cursor: 'pointer' }}>
            Filter by classification{active > 0 ? ` · ${active} applied` : ''}
          </summary>
          <div className="q-grid-2" style={{ marginTop: '12px' }}>
            {allDimensions.map((d: any) => (
              <div key={d.id} className="q-field">
                <label className="q-label">{d.name}</label>
                <select
                  className="q-select"
                  value={catalogueValues[d.id] || ''}
                  onChange={(e) => setCatalogueValues((prev) => ({ ...prev, [d.id]: e.target.value }))}
                >
                  <option value="">Any</option>
                  {d.values.map((v: any) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </details>
        );
      })()}
                      read={(p: any) => ({
                        name: p.name,
                        description: p.description,
                        facet: [...new Set(((p.services || []) as any[])
                          .map((sv: any) => sv.domain?.name || sv.domainName)
                          .filter(Boolean))] as string[],
                        tags: [],
                      })}
                    >
                      {(pkgs, { query }) => (
                        <div className="q-stack q-stack-sm">
                          {/*
                            * RECOGNISED, NOT READ.
                            *
                            * These were rows of text, stacked, so twenty
                            * packages became twenty lines that pushed Tasks,
                            * Invoice and Contract off the screen — and the
                            * operator picking one had to read names to tell
                            * them apart while somebody waited on the telephone.
                            *
                            * A picture says which package it is faster than a
                            * name does, and now that packages carry covers
                            * there is a picture to say it with. Sideways, so a
                            * catalogue of thirty cannot grow the form
                            * vertically without limit, and with the next card
                            * showing past the edge so it is plain there is more
                            * that way.
                            *
                            * IT DOES NOT STAND ALONE, and that is the point. A
                            * rail is good for browsing a dozen and bad for
                            * scanning forty — you cannot see them at once. The
                            * search, the domain and the classifications above
                            * are what narrow forty to a dozen; the rail is only
                            * ever showing what came back.
                            *
                            * The card is the ordinary q-card the Packages
                            * catalogue draws — same cover, same empty wash,
                            * same initial, same price — so an operator chooses
                            * from things they already recognise from that page,
                            * and none of it is defined twice.
                            *
                            * Nothing inside it links or clicks. The card IS the
                            * button; a second thing to aim at on a card that is
                            * already the subject is what came off the service
                            * cards, for this reason.
                            */}
                          <div className="q-rail-frame"><div className="q-rail">
                            {pkgs.map((p: any) => {
                              const domains = [...new Set(((p.services || []) as any[])
                                .map((sv: any) => sv.domain?.name || sv.domainName).filter(Boolean))];
                              const priced = hasPrice(p.price);
                              /*
                               * How many of this one are already on the booking.
                               *
                               * Adding the same package twice is legitimate — two
                               * portrait sessions, two shoots on a wedding — so
                               * the click adds rather than toggles. But it was
                               * adding SILENTLY: the card looked identical after,
                               * and the line it created landed below the fold. A
                               * click that appears not to have worked invites
                               * another, so three of a package was the natural
                               * result of doubting the first one.
                               *
                               * The answer is not to forbid the second. It is to
                               * make the first visible where the click happens.
                               */
                              const onBooking = lines.filter((l) => l.packageId === p.id).length;
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  className={`q-card q-card-interactive q-stack${onBooking > 0 ? ' q-card-chosen' : ''}`}
                                  style={{ textAlign: 'left', cursor: 'pointer' }}
                                  aria-label={onBooking > 0
                                    ? `${p.name} — ${onBooking} already on this booking. Add another.`
                                    : `Add ${p.name} to this booking`}
                                  onClick={() => addPackage(p.id)}
                                  title={p.description || p.name}
                                >
                                  <div
                                    className={p.coverUrl ? 'q-cover' : 'q-cover q-cover-empty'}
                                    style={p.coverUrl
                                      ? { backgroundImage: `url(${p.coverUrl})`, backgroundPosition: p.coverPosition || undefined }
                                      : undefined}
                                  >
                                    {!p.coverUrl && (
                                      <span className="q-cover-initial">
                                        {(p.name || '?').trim().charAt(0).toUpperCase()}
                                      </span>
                                    )}
                                  </div>

                                  <div>
                                    {/* Every domain it draws on, so a package
                                        bundling across two says so here too. */}
                                    {domains.length > 0 && (
                                      <span className="q-eyebrow">{domains.join(' + ')}</span>
                                    )}
                                    <h4 className="q-card-title">{p.name}</h4>
                                  </div>

                                  {/* What it is made of and what it promises —
                                      the counts that tell one package from
                                      another without reading a description. */}
                                  <p className="q-meta-sm" style={{ margin: 0 }}>
                                    {[
                                      p.services?.length ? `${p.services.length} service${p.services.length === 1 ? '' : 's'}` : null,
                                      p.deliverables?.length ? `${p.deliverables.length} deliverable${p.deliverables.length === 1 ? '' : 's'}` : null,
                                      p.durationMinutes ? `${p.durationMinutes} minutes` : null,
                                    ].filter(Boolean).join(' \u00b7 ')}
                                  </p>

                                  <div className="q-card-foot">
                                    <span className={priced ? 'q-price' : 'q-price q-absent'}>
                                      {priced
                                        ? formatMoney(Number((p.price as any).amount), String((p.price as any).currency || currencyCode))
                                        : 'No price set'}
                                    </span>
                                    {/* Said at the point of the click, which is
                                        where the answer to "did that land?" has
                                        to be. The flash on the new line below
                                        says where it went; this says that it
                                        went. */}
                                    {onBooking > 0 && (
                                      <span className="q-badge q-badge-success">
                                        {onBooking === 1 ? 'On this booking' : `${onBooking} on this booking`}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div></div>

                          {/*
                            * Creating is always offered, not only when the list
                            * comes back empty: an operator often knows before
                            * they look that this one is bespoke. The name they
                            * typed and the classifications they narrowed by both
                            * carry into the new package, which is why the query
                            * has to come back out of the filter.
                            */}
                          <button
                            type="button"
                            className="q-btn q-btn-secondary"
                            onClick={() => addPackage('custom', query)}
                          >
                            {query ? `Create package: “${query}”` : 'Create a new package'}
                          </button>
                        </div>
                      )}
                    </CatalogFilter>
                  </div>
                </div>

          {lines.map((line, index) => (
            /*
             * Keyed by the line's own id, so React animates the one that was
             * added rather than replaying every card each time the list
             * changes — an index key would restage the whole section on every
             * keystroke that adds or removes a line.
             */
            <div
              key={line.id}
              /*
               * Flashed on arrival, because a package chosen from the catalogue
               * ABOVE lands in the list BELOW, which is the one place in this
               * form where the thing you just did happens somewhere other than
               * where you did it. useArrivals answers exactly that question —
               * which of these is new — and it already draws the same flash on
               * a task added to a booking.
               */
              className={`q-card q-stack q-stack-md q-appear${arrived.has(line.id) ? ' q-flash' : ''}`}
              style={{ position: 'relative' }}
            >
              {/*
                * ALWAYS. A package put on can be taken off.
                *
                * This was {lines.length > 1 && …}, so a booking with exactly one
                * package had no way to remove it: chosen was permanent until the
                * page was abandoned.
                *
                * That guard was right in the old model. The form always began
                * with one line, and the catalogue lived INSIDE an empty one — so
                * removing the last line took away the only way to browse, and
                * keeping one was how the page stayed usable.
                *
                * The catalogue is section-level now and a booking with no
                * packages is a legitimate thing to have: a package stopped being
                * required here a while ago, and is one of four ways a booking
                * can be worth writing down. So the last one comes off like any
                * other, and the catalogue above is still there to add another.
                *
                * The twin of "Add another package", which came out when the
                * empty line did. This one was missed.
                */}
              <button
                type="button"
                className="q-btn-ghost q-btn-xs"
                style={{ position: 'absolute', top: '16px', right: '16px' }}
                title={`Take ${line.selectedPackageDeep?.name || 'this package'} off the booking`}
                onClick={() => {
                  const newLines = [...lines];
                  newLines.splice(index, 1);
                  setLines(newLines);
                  editorRefs.current.splice(index, 1);
                }}
              >
                Remove
              </button>
              {/*
                * ONLY WHEN IT DISTINGUISHES SOMETHING.
                *
                * A single-line booking read "2. Packages", then "Package", then
                * "Package" again — three headings, the same word, with a
                * collapsed filter between them. This one earns its place when
                * there are several lines to tell apart and says nothing the
                * section heading has not already said when there is one.
                */}
              {lines.length > 1 && (
                <h3 className="q-strong" style={{ marginBottom: '8px' }}>
                  Package {index + 1}
                </h3>
              )}
              
              {/*
                * NO DOMAIN GATE. THE PACKAGES LEAD.
                *
                * This asked "Service domain: Photography or Videography?" before
                * it would show a single package, and a booking cannot answer
                * that. A package BUNDLES services, and those services can come
                * from different domains — Event Photography and Event
                * Videography sold as one thing — so for that package the
                * question has two right answers and picking either was
                * arbitrary. Worse, having picked one, the operator was then
                * offered only that domain's classifications, so half of what
                * the package is classified by became unfilterable, and the line
                * was badged with a single domain that was not the whole truth.
                *
                * A domain is a property of the SERVICES a package bundles. It is
                * not a property of the booking, and it was never the booking's
                * to be confined by. So it is a filter now, not a gate: the
                * packages are on screen immediately, and domain is one facet
                * beside search and classification — where a package spanning two
                * domains is kept by either of them.
                */}
                <div key="configure" className="q-field q-swap">
                  <div className="q-row q-row-between" style={{ marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <span className="q-row" style={{ gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {/*
                        * The domains this package actually spans, from the
                        * package. It used to print the one domain the operator
                        * had been made to pick on the way in, which for a
                        * package bundling Event Photography and Event
                        * Videography named one of the two and called it the
                        * line's domain.
                        */}
                      {[...new Set((((line.selectedPackageDeep?.services) || []) as any[])
                        .map((sv: any) => sv.domain?.name || sv.domainName)
                        .filter(Boolean))].map((d) => (
                        <span key={d as string} className="q-badge q-badge-neutral">{d as string}</span>
                      ))}
                      {Object.entries(line.selectedDimensionValues).filter(([_, v]) => v).map(([dimId, valId]) => {
                        const d = allDimensions.find((x: any) => x.id === dimId);
                        const vName = d?.values.find((x: any) => x.id === valId)?.name;
                        return vName ? <span key={dimId} className="q-badge q-badge-neutral">{vName}</span> : null;
                      })}
                      <strong className="q-strong" style={{ marginLeft: '8px' }}>
                        {line.packageId === 'custom' ? 'Custom Package' : 'Editing Package Template'}
                      </strong>
                    </span>
                    <button type="button" className="q-btn-ghost q-btn-xs" onClick={() => {
                      const newLines = [...lines];
                      newLines[index].packageId = '';
                      newLines[index].customName = '';
                      newLines[index].selectedPackageDeep = null;
                      setLines(newLines);
                    }}>Change Package</button>
                  </div>
                  
                  {line.isLoadingDeep ? (
                    <div className="q-meta">Loading template...</div>
                  ) : (line.packageId === 'custom' || line.selectedPackageDeep) ? (
                    <>
                      <PackageFieldsEditor
                        ref={el => {
                          if (el) editorRefs.current[index] = el;
                        }}
                        mode="create"
                        currencyCode={currencyCode}
                        // Narrowed to what the chosen package declares, so the line
                        // shows the package rather than the whole catalog. A custom
                        // line has nothing to narrow to and gets everything.
                        {...(() => {
                          const s = scopedFor(line.packageId === 'custom' ? null : line.selectedPackageDeep);
                          return {
                            allServices: s.services,
                            allVariables: s.variables,
                            allDeliverables: s.deliverables,
                            dimensionsByDomain: s.dimensions,
                          };
                        })()}
                        roleOptions={roleOptions}
                        // The classifications the operator narrowed by on the way
                        // here. A search that found nothing should not become a
                        // blank form: the package being built starts classified
                        // the way it was looked for.
                        intendedValueIds={Object.values(line.selectedDimensionValues).filter(Boolean)}
                        hideControls={true}
                        /*
                          * Which catalogue package this line is an instance of,
                          * or null when the operator is writing something
                          * bespoke here for the first time.
                          *
                          * It decides whether this form ANSWERS a package or
                          * DEFINES one. Off the shelf, what the package is — its
                          * picture, its name, what it bundles — is stated rather
                          * than asked, and everything it left open stays exactly
                          * as editable as it was. Bespoke, there is nothing to
                          * be an instance of, so the whole editor is the point.
                          */
                        derivedFrom={line.packageId === 'custom' ? null : (line.selectedPackageDeep?.name ?? null)}
                        /* The baseline a departure is measured against. The
                           instance records instance_of anyway, so this is what
                           lets the operator SEE the difference while making it,
                           rather than only being able to read it back later. */
                        derivedServiceIds={((line.selectedPackageDeep?.services || []) as any[]).map((sv: any) => sv.id)}
                        initial={line.packageId === 'custom' 
                          ? { variableValues: [], name: line.customName || '' } 
                          : {
                            name: line.selectedPackageDeep.name,
                            description: line.selectedPackageDeep.description,
                            durationMinutes: line.selectedPackageDeep.duration_minutes,
                            serviceIds: (line.selectedPackageDeep.services || []).map((s: any) => s.id),
                            deliverables: ((line.selectedPackageDeep.services || []) as any[]).flatMap((s) =>
                              ((s.deliverables || []) as any[]).map((d) => ({
                                serviceId: s.id as string, deliverableId: d.id as string,
                                quantity: d.quantity ?? null, unit: d.unit ?? null, spec: d.spec ?? null,
                              }))),
                            narrowings: ((line.selectedPackageDeep.services || []) as any[]).flatMap((s) =>
                              ((s.narrowedTo || []) as { values: { id: string }[] }[])
                                .flatMap((d) => d.values.map((v) => ({ serviceId: s.id as string, valueId: v.id })))),
                            extraStages: (line.selectedPackageDeep.extra_stages || []).map((s: any) => ({ name: s.name, roleName: s.roleName || '', frontStage: s.front_stage ?? true })),
                            variableValues: (line.selectedPackageDeep.variableValues || []).map((v: any) => ({ serviceVariableId: v.serviceVariableId, value: v.value })),
                          }
                        }
                      />
                      {/*
                        * WHAT THIS BOOKING SAYS ABOUT THIS PACKAGE.
                        *
                        * These were under a heading reading "What this package
                        * asks", inside a q-narrow panel. Both were wrong, and
                        * the second more so than the first.
                        *
                        * q-narrow is this system's NARROWING surface — the
                        * recessed box a catalogue's filters sit in. Putting the
                        * questions there said, in the only vocabulary the design
                        * has for it, "these are controls for narrowing a list".
                        * They are the opposite: they are what the booking
                        * commits to. Recessed and captioned as a description of
                        * the package, the most defining thing on the line read
                        * as the least important.
                        *
                        * And there is nothing to announce. "What this package
                        * asks" describes the package's behaviour; at booking
                        * time these are not a description of anything, they are
                        * the questions being answered. "What occasion is it
                        * for?" needs no heading to explain that it is a
                        * question.
                        *
                        * So they sit with the price, which is the same kind of
                        * thing — a fact this booking states about its own copy
                        * of the package — in one group below the rule, at the
                        * weight of everything else being decided.
                        */}
                      <div className="q-stack q-stack-md" style={{ marginTop: '24px', borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '24px' }}>
                      {/*
                        * WHAT THIS PACKAGE ASKS, ASKED HERE TOO.
                        *
                        * The storefront put these to the client and this form
                        * put them to nobody. A studio taking the same booking
                        * over the telephone got a package whose deliberately
                        * open questions arrived unanswered, with no way to
                        * answer them at intake — so the two classes of variable
                        * worked on one of the two ways into this system.
                        *
                        * Which one it is comes first, because some of what
                        * follows depends on it: the date of the occasion means
                        * nothing until the occasion is settled. Same order as
                        * the storefront, for the same reason.
                        */}
                      {(() => {
                        const q = line.openQuestions;
                        if (!q || (q.variables.length === 0 && q.classifications.length === 0)) return null;
                        const setAnswer = (id: string, raw: string) => setLines((prev) => {
                          const next = [...prev];
                          next[index] = { ...next[index], variableAnswers: { ...next[index].variableAnswers, [id]: raw } };
                          return next;
                        });
                        const setClassification = (dimensionId: string, valueId: string) => setLines((prev) => {
                          const next = [...prev];
                          next[index] = { ...next[index], chosenClassifications: { ...next[index].chosenClassifications, [dimensionId]: valueId } };
                          return next;
                        });
                        return (
                          <>
                            {q.classifications.map((c: any) => (
                              <div className="q-field" key={c.dimensionId}>
                                <label className="q-label">{c.question || c.name}</label>
                                <select
                                  className="q-select"
                                  value={line.chosenClassifications[c.dimensionId] || ''}
                                  onChange={(e) => setClassification(c.dimensionId, e.target.value)}
                                >
                                  <option value="">Not said yet</option>
                                  {c.values.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </select>
                              </div>
                            ))}

                            {q.variables.map((v: any) => (
                              <div className="q-field" key={v.id}>
                                <label className="q-label">
                                  {v.label}
                                  {v.unit && <span className="q-meta-sm" style={{ marginLeft: '6px' }}>({v.unit}s)</span>}
                                  {/*
                                    * WHERE THE QUESTION COMES FROM, TRUTHFULLY.
                                    *
                                    * A variable can belong to a service or to a
                                    * CLASSIFICATION. This printed serviceName
                                    * either way, and the domain was stamping a
                                    * classification's variable with whichever
                                    * service came first in the bundle — so
                                    * "Location Address" claimed to come from
                                    * Event Photography when it comes from
                                    * Context. It is asked because of how the
                                    * work is classified, not because of who
                                    * performs it.
                                    *
                                    * Separated in the text as well as the
                                    * spacing: read aloud, the two ran together
                                    * into one word.
                                    */}
                                  {(v.dimensionName || v.serviceName) && (
                                    <span className="q-meta-sm" style={{ marginLeft: '8px' }}>
                                      &middot; {v.dimensionName || v.serviceName}
                                    </span>
                                  )}
                                </label>
                                <VariableField
                                  kind={v.kind}
                                  value={line.variableAnswers[v.id] ?? ''}
                                  onChange={(next) => setAnswer(v.id, Array.isArray(next) ? next.join(', ') : next)}
                                  options={v.options || []}
                                  unit={v.unit}
                                  min={v.min}
                                  max={v.max}
                                  emptyLabel="Not said yet"
                                  width="100%"
                                />
                                {/*
                                  * A DATE THE STUDIO KNOWS AND THE CALENDAR
                                  * DOES NOT.
                                  *
                                  * The calendar reads bookings.scheduled_for
                                  * and nothing else; an answer like the date of
                                  * the occasion lands in
                                  * booking_line_variable_values, which
                                  * listBookingsInRange never touches. So a
                                  * studio could take the date of the wedding
                                  * from the client and have the booking appear
                                  * on no calendar at all, with nothing saying
                                  * so.
                                  *
                                  * NOT FILLED IN AUTOMATICALLY, because these
                                  * are two different facts: scheduled_for is
                                  * when the STUDIO works, and this is when the
                                  * EVENT is. Usually the same for event
                                  * coverage and not always — a pre-wedding
                                  * shoot is before, an album after — and a
                                  * calendar that invents commitments nobody
                                  * made is worse than one with gaps.
                                  *
                                  * So it is offered, and it is offered here,
                                  * beside the answer that was just given rather
                                  * than in the section above that the operator
                                  * has already scrolled past.
                                  */}
                                {v.kind === 'date' && (line.variableAnswers[v.id] ?? '') !== '' && (() => {
                                  const said = String(line.variableAnswers[v.id]).slice(0, 10);
                                  const scheduled = when ? when.slice(0, 10) : '';
                                  const reads = (d: string) => new Date(`${d}T00:00`).toLocaleDateString(undefined,
                                    { day: 'numeric', month: 'long', year: 'numeric' });
                                  if (!scheduled) {
                                    return (
                                      <span className="q-row q-row-sm q-appear" style={{ alignItems: 'center' }}>
                                        <span className="q-meta-sm">This booking is not scheduled.</span>
                                        <button type="button" className="q-btn q-btn-secondary q-btn-xs"
                                          onClick={() => setWhen(`${said}T09:00`)}>
                                          Schedule it for {reads(said)}
                                        </button>
                                      </span>
                                    );
                                  }
                                  if (scheduled !== said) {
                                    return (
                                      <span className="q-row q-row-sm q-appear" style={{ alignItems: 'center' }}>
                                        <span className="q-meta-sm q-text-danger">
                                          This booking is scheduled for {reads(scheduled)}.
                                        </span>
                                        <button type="button" className="q-btn q-btn-secondary q-btn-xs"
                                          onClick={() => setWhen(`${said}T${when.slice(11) || '09:00'}`)}>
                                          Move it to {reads(said)}
                                        </button>
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            ))}
                          </>
                        );
                      })()}

                        <div className="q-field">
                        {/*
                          * THE ONE PRICE ON THIS LINE, AND IT SAYS SO.
                          *
                          * The editor above used to offer a Base Price as well,
                          * blank, which submitBooking then overwrote with this
                          * figure — two fields for one number, and the inert one
                          * was the one an operator looking for the package's
                          * price reached first. The editor no longer draws it
                          * when it is embedded.
                          *
                          * It arrives holding the catalogue price and can be
                          * changed for this client, which is the whole reason a
                          * booking keeps its own instance of a package: what was
                          * quoted here does not move when the catalogue does.
                          */}
                        <label className="q-label">Price for this booking</label>
                        <div className="q-row" style={{ gap: '8px', alignItems: 'center' }}>
                          <span className="q-meta-sm q-strong" style={{ width: '40px' }}>{currencyCode}</span>
                          <input className="q-input q-num" type="number" value={line.linePrice} onChange={e => {
                            const newLines = [...lines];
                            newLines[index].linePrice = e.target.value;
                            setLines(newLines);
                          }} placeholder="0.00" step="0.01" style={{ width: '140px' }} />
                        </div>
                        <span className="q-meta-sm">
                          {line.selectedPackageDeep?.price?.base_price != null || line.selectedPackageDeep?.price?.amount != null
                            ? 'From the package. Change it to quote this client differently.'
                            : 'This package has no price set, so name one here or leave it unquoted.'}
                        </span>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
            </div>
          ))}
        </div>
      </div>

      {/*
        * The work this booking involves, collated across its packages.
        *
        * Read-only for the package-derived tasks, because those are what each
        * package says it involves and changing one is a decision about that
        * package. Everything here becomes editable on the booking itself, where
        * roles can be overridden per task and people assigned to them.
        *
        * What CAN be added here is work belonging to the booking and to no
        * package — a venue visit, an album collection — which previously had
        * nowhere to live at all.
        */}
      <div className="q-card q-section q-rise">
        <h2 className="q-section-title">3. Tasks</h2>

        {(() => {
          const fromPackages = tasksFromPackages;

          return (
            <div className="q-stack q-stack-md">
              {fromPackages.length === 0 ? (
                <p className="q-meta">
                  The packages selected above define no tasks. Tasks come from a service&rsquo;s
                  workflow, which is set in Services settings.
                </p>
              ) : (
                <>
                  <p className="q-meta">
                    {fromPackages.length} {fromPackages.length === 1 ? 'task' : 'tasks'} will be
                    created from the packages above. Roles and assignments can be changed on the
                    booking.
                  </p>
                  <div className="q-stack" style={{ gap: '4px' }}>
                    {fromPackages.map((t) => (
                      <div
                        key={t.key}
                        className="q-row q-row-between"
                        style={{ alignItems: 'center', padding: '6px 10px', borderRadius: '6px', background: 'var(--q-color-ink-50)' }}
                      >
                        <span>
                          <span className="q-strong">{t.name}</span>
                          <span className="q-meta-sm" style={{ display: 'block' }}>{t.pkg}</span>
                        </span>
                        <span className="q-meta-sm">{t.role || 'No role'}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {extraTasks.length > 0 && (
                <div className="q-stack" style={{ gap: '4px' }}>
                  {extraTasks.map((t, i) => (
                    <div
                      key={`${t.name}-${i}`}
                      className="q-row q-row-between"
                      style={{ alignItems: 'center', padding: '6px 10px', borderRadius: '6px', background: 'var(--q-color-ink-50)' }}
                    >
                      <span>
                        <span className="q-strong">{t.name}</span>
                        <span className="q-meta-sm" style={{ display: 'block' }}>Added to this booking</span>
                      </span>
                      <span className="q-row" style={{ gap: '8px', alignItems: 'center' }}>
                        <span className="q-meta-sm">
                          {roleChoices.find((r) => r.id === t.roleId)?.name || 'No role'}
                        </span>
                        <button
                          type="button"
                          className="q-btn-ghost q-btn-xs"
                          onClick={() => setExtraTasks(extraTasks.filter((_, x) => x !== i))}
                          title={`Remove ${t.name}`}
                        >
                          &times;
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="q-row" style={{ gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="q-field" style={{ flex: 1, minWidth: '200px' }}>
                  <label className="q-label">Add a task for this booking</label>
                  <input
                    className="q-input"
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    placeholder="e.g. Collect album from printer"
                  />
                </div>
                <div className="q-field" style={{ minWidth: '150px' }}>
                  <label className="q-label">Role</label>
                  <select className="q-select" value={newTaskRoleId} onChange={(e) => setNewTaskRoleId(e.target.value)}>
                    <option value="">No role</option>
                    {roleChoices.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <button
                  type="button"
                  className="q-btn q-btn-secondary q-btn-sm"
                  disabled={!newTaskName.trim()}
                  onClick={() => {
                    setExtraTasks([...extraTasks, { name: newTaskName.trim(), roleId: newTaskRoleId }]);
                    setNewTaskName('');
                    setNewTaskRoleId('');
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          );
        })()}

        {/*
          * THE SECTION'S OWN FIGURE, IN THE BAND A CARD USES FOR ITS PRICE.
          *
          * Section 2 was the only part of this page with anything to look at:
          * covers, names, and a price in the accent at the foot of every card.
          * The other four sections held the same KINDS of thing — a sum of
          * money, a count of work — and drew every one of them as q-meta-sm,
          * the smallest grey on the page. The difference was never that
          * packages are prettier. It is that packages were shown and the rest
          * were whispered.
          *
          * So: the same band, at the foot of each section, carrying that
          * section's one figure. Nothing is invented — q-card-foot and q-price
          * are what a package card already uses, and a section IS a card. What
          * it buys is rhythm. Reading down the page, every section now resolves
          * to one figure in the accent, the way every card in the rail does.
          */}
        <div className="q-card-foot">
          <span className={tasksFromPackages.length > 0 ? 'q-figure' : 'q-figure q-absent'}>
            {tasksFromPackages.length > 0
              ? <>{tasksFromPackages.length}<span className="q-figure-unit">{tasksFromPackages.length === 1 ? 'task' : 'tasks'}</span></>
              : 'No work defined yet'}
          </span>
          {tasksFromPackages.length > 0 && (
            <span className="q-meta-sm">
              {tasksFromPackages.filter((t) => t.role).length} of them with a role
            </span>
          )}
        </div>
      </div>

      {/*
        * Invoice before contract, in the order the money is actually settled:
        * a studio bills from what was booked, and a contract formalises the same
        * figures when one is sent. Neither can be built before the booking
        * exists, because both are built FROM its packages — so both are raised
        * the moment it is saved, and both are editable on it afterwards.
        */}
      <div className="q-card q-section q-rise">
        <h2 className="q-section-title">4. Invoice</h2>
        <p className="q-meta" style={{ marginBottom: '16px' }}>
          Created as a draft with one line per package. Issue it when ready.
        </p>
        <div className="q-stack q-stack-md">
          {/*
            * THE DOCUMENT, NOT THE SETTINGS FOR ONE.
            *
            * Drawn the way the invoice itself is drawn — the same four columns
            * the finished document uses — because it is the same document, one
            * step earlier. An operator quoting on the telephone reads the total
            * off this rather than adding the package cards up themselves.
            */}
          {draftInvoice.rows.length === 0 ? (
            <p className="q-empty">
              Nothing above is priced yet, so no invoice is raised with this booking. Price a package
              in section 2, or raise one from the booking once you have quoted it.
            </p>
          ) : (
            <>
              <div className="q-table-container">
                <table className="q-table">
                  <thead>
                    <tr>
                      <th className="q-table-th">Description</th>
                      <th className="q-table-th">Qty</th>
                      <th className="q-table-th">Each</th>
                      <th className="q-table-th">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftInvoice.rows.map((r) => (
                      <tr key={r.id} className="q-table-tr">
                        <td className="q-table-td q-strong">{r.description}</td>
                        <td className="q-table-td q-num">{r.quantity}</td>
                        <td className="q-table-td q-num">{formatAmount(r.unitPrice)}</td>
                        <td className="q-table-td q-num q-strong">{formatAmount(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/*
                * Subtotal, tax, total — the three the client sees.
                *
                * Tax showed nowhere on this form while createInvoiceForBooking
                * snapshotted the studio's rate onto every document it raised. A
                * studio on 7.5% quoted ₦200,000 here and billed ₦215,000, and
                * the gap first became visible to whoever opened the invoice.
                * Shown only when the studio charges any: a zero rate is a real
                * position, and a row reading "Tax 0%" is noise on every line of
                * every booking a studio that charges none will ever take.
                */}
              {/*
                * ONLY WHERE THERE IS ARITHMETIC TO SHOW.
                *
                * This drew Subtotal, Tax and Total. With no tax — which is every
                * studio that has not set a rate — Subtotal and Total are the
                * same figure on two rows with nothing between them, and the
                * band at the foot of the section says it a third time. One
                * package, no tax: ₦210,000 appeared five times in this section,
                * counting the two table columns.
                *
                * The breakdown earns its place when something happens between
                * the two numbers. When nothing does, the foot carries the answer
                * on its own, which is what the foot is for and what the other
                * sections already do.
                */}
              {taxRate > 0 && (
                <div className="q-stack q-stack-sm">
                  <div className="q-row q-row-between">
                    <span className="q-meta">Subtotal</span>
                    <span className="q-num">{formatAmount(draftInvoice.subtotal)}</span>
                  </div>
                  <div className="q-row q-row-between">
                    <span className="q-meta">Tax ({taxRate}%)</span>
                    <span className="q-num">{formatAmount(draftInvoice.tax)}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {unpricedLines.length > 0 && (
            <p className="q-meta-sm">
              {unpricedLines.join(', ')} {unpricedLines.length === 1 ? 'is' : 'are'} on the booking
              but not on this invoice, because nothing has been quoted for
              {unpricedLines.length === 1 ? ' it' : ' them'} yet.
            </p>
          )}

          <div className="q-field" style={{ maxWidth: '420px' }}>
            <label className="q-label">Amount to invoice</label>
            <select
              className="q-select"
              value={invoicePortion}
              onChange={(e) => setInvoicePortion(e.target.value as 'full' | 'deposit')}
            >
              <option value="full">The full amount</option>
              <option value="deposit">
                {/*
                  * The percentage this actually bills, which is the one in
                  * section 5. This read depositDefault — the studio's standing
                  * setting — while every calculation beneath it used the
                  * contract field, so changing the deposit to 30% left the
                  * option still offering "the deposit only (20%)" and billing
                  * thirty. One deposit, named wherever it is shown.
                  */}
                {depositPct > 0 ? `The deposit only (${depositPct}%)` : 'The deposit only'}
              </option>
            </select>
            {invoicePortion === 'deposit' && depositPct === 0 && draftInvoice.rows.length > 0 && (
              <span className="q-meta-sm">
                The deposit in section 5 is 0%, so this would ask the client for nothing. Set one
                there, or invoice the full amount.
              </span>
            )}
            {invoicePortion === 'deposit' && depositPct > 0 && (
              <span className="q-meta-sm">
                The balance can be invoiced later from the booking.
              </span>
            )}
          </div>
          <div className="q-field" style={{ maxWidth: '260px' }}>
            <label className="q-label">Due date (optional)</label>
            <input
              className="q-input"
              type="date"
              value={invoiceDue}
              onChange={(e) => setInvoiceDue(e.target.value)}
            />
          </div>
          <div className="q-field">
            <label className="q-label">Invoice notes (optional)</label>
            <textarea
              className="q-textarea"
              rows={3}
              value={invoiceNotes}
              onChange={(e) => setInvoiceNotes(e.target.value)}
              placeholder="Bank details, payment reference, or other information for the client."
            />
          </div>
        </div>

        {/*
          * THE SECTION'S OWN FIGURE, IN THE BAND A CARD USES FOR ITS PRICE.
          *
          * Section 2 was the only part of this page with anything to look at:
          * covers, names, and a price in the accent at the foot of every card.
          * The other four sections held the same KINDS of thing — a sum of
          * money, a count of work — and drew every one of them as q-meta-sm,
          * the smallest grey on the page. The difference was never that
          * packages are prettier. It is that packages were shown and the rest
          * were whispered.
          *
          * So: the same band, at the foot of each section, carrying that
          * section's one figure. Nothing is invented — q-card-foot and q-price
          * are what a package card already uses, and a section IS a card. What
          * it buys is rhythm. Reading down the page, every section now resolves
          * to one figure in the accent, the way every card in the rail does.
          */}
        <div className="q-card-foot">
          {/*
            * What the client is asked for, tax included — the same figure the
            * document above resolves to, rather than a second arithmetic on the
            * same numbers. This band used to compute its own deposit from
            * bookingTotal and reach a different answer from the invoice whenever
            * the studio charged tax.
            */}
          <span className={draftInvoice.rows.length > 0 ? 'q-price' : 'q-price q-absent'}>
            {draftInvoice.rows.length > 0 ? formatAmount(draftInvoice.total) : 'Not quoted yet'}
          </span>
          {draftInvoice.rows.length > 0 && invoicePortion === 'deposit' && depositPct > 0 && (
            <span className="q-meta-sm">of {formatAmount(bookingTotal)} booked</span>
          )}
        </div>
      </div>

      <div className="q-card q-section q-rise">
        <h2 className="q-section-title">5. Contract</h2>
        <p className="q-meta" style={{ marginBottom: '16px' }}>
          Uses your standard terms and the total for these packages. The wording can be edited on
          the contract before it is sent.
        </p>

        {/*
          * SAID HERE, BEFORE IT MATTERS.
          *
          * A contract is an agreement between the studio and somebody, so it
          * cannot be raised without a client. That was already true and already
          * checked — but the check lived at the far end of a save, so an
          * operator filled this section in, submitted, and only then learned it
          * had been for nothing.
          *
          * The booking itself is not blocked. Taking one with almost nothing
          * known is the whole point of this form; a contract is simply the one
          * thing on it that needs a name to be an agreement with.
          */}
        {/* Not clientId: a client typed in but not yet saved still becomes one
            on submit, and warning about that would be wrong. */}
        {!client && (
          <p className="q-note q-note-warn q-meta q-appear">
            A contract is an agreement with someone, so this needs a client. The booking will still
            be taken — add a client above, or raise the contract later from the booking itself.
          </p>
        )}
        <div className="q-field" style={{ maxWidth: '320px' }}>
          <label className="q-label">Deposit</label>
          <div className="q-row" style={{ alignItems: 'center', gap: '8px' }}>
            <input
              className="q-input"
              type="number"
              min={0}
              max={100}
              step={1}
              style={{ maxWidth: '100px' }}
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
            <span className="q-meta">% due on confirmation</span>
          </div>
          <span className="q-meta-sm">
            {Number(deposit) === 0
              ? 'No deposit. The full amount is due on signing.'
              : `Studio default is ${depositDefault}%. A change here applies to this contract only.`}
          </span>
        </div>

        {/*
          * A PERCENTAGE OF WHAT.
          *
          * This section said it "uses your standard terms and the total for
          * these packages", then took a deposit as a percentage — and named
          * neither number. The one figure an operator is actually agreeing to
          * on the telephone, the money due on confirmation, was the one thing
          * the contract section would not say. It was not set small here; it
          * did not exist.
          *
          * The same band as the sections above, so the page resolves the same
          * way five times.
          */}
        <div className="q-card-foot">
          <span className={isQuoted ? 'q-price' : 'q-price q-absent'}>
            {!isQuoted
              ? 'Not quoted yet'
              : depositPct > 0
                ? formatAmount(depositAmount)
                : formatAmount(bookingTotal)}
          </span>
          <span className="q-meta-sm">
            {!isQuoted
              ? 'Price the packages above to see what is due'
              : depositPct > 0
                ? `on confirmation, ${formatAmount(bookingTotal - depositAmount)} on delivery`
                : 'due on signing'}
          </span>
        </div>
      </div>

      {/*
        * A package used to be the condition. It is now one of four, because a
        * booking exists to record that someone asked — and a name, a date or
        * their own words are each enough to be worth writing down. What is still
        * refused is a booking that says nothing at all.
        */}
      <div className="q-row">
        <button
          className="q-btn q-btn-primary"
          aria-busy={isPending}
          disabled={isPending || !hasSomethingToRecord}
          onClick={submitBooking}
        >
          {isPending ? 'Creating…' : 'Create booking'}
        </button>
        {!hasSomethingToRecord && (
          <span className="q-meta-sm">Add a client, a date, what they asked for, or a package.</span>
        )}
      </div>

      {/*
        * Says where the rest of the job is.
        *
        * Crew, contract and invoice are not on this form and cannot be: the
        * tasks people get put on are cut from each package's workflow when the
        * line is created, the contract sums those lines, and the invoice needs
        * the contract. All of it exists a moment after this button, not before —
        * so the form says so rather than leaving an operator hunting for steps
        * that were never here.
        */}
      <p className="q-meta-sm">
        The booking opens once created, where the team can be assigned and anything raised here
        can be amended.
      </p>
    </div>
  );
}
