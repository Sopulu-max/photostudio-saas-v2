'use client';

import React, { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBooking, addBookingLine, setLineConfiguration, createContractForBooking } from '@/modules/bookings/interface';
import { createInvoiceForBooking } from '@/modules/finances/interface';
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
import { parseVariableValue } from '@/modules/services/variableTypes';
import { PackageFieldsEditor } from '../packages/[id]/PackageFieldsEditor';
import { CatalogFilter } from '@/components/CatalogFilter';
import { toStored, hasPrice } from '@/kernel/money';
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
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /** The studio's currency, for figures shown while the form is being filled in. */
  const formatAmount = (n: number) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode || 'USD', maximumFractionDigits: 0 }).format(n);

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
    selectedDomain: string;
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
    selectedDomain: '',
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

  const [lines, setLines] = useState<LineState[]>([freshLine()]);

  // Domain names from the dimensionsByDomain keys + any domains on services
  // that might not have dimensions yet
  const allDomains = React.useMemo(() => {
    const fromDimensions = Object.keys(dimensionsByDomain);
    const fromServices = services.map(s => s.domainName).filter(Boolean);
    return [...new Set([...fromDimensions, ...fromServices])].sort();
  }, [dimensionsByDomain, services]);

  // For a given domain, which service ids belong to it?
  const serviceIdsForDomain = React.useCallback((domain: string) => {
    return services.filter(s => s.domainName === domain).map(s => s.id);
  }, [services]);

  // Filter packages: only those containing at least one service in the domain
  const packagesForDomain = React.useCallback((domain: string) => {
    return packages.filter(p => {
      if (!p.services || !Array.isArray(p.services)) return false;
      return p.services.some((s: any) => {
        // If it already has domain populated from the DB
        if (s.domain && s.domain.name === domain) return true;
        if (s.domainName === domain) return true;
        // Otherwise look it up in our services list
        const sId = typeof s === 'string' ? s : s.id;
        const matchingService = services.find(srv => srv.id === sId);
        return matchingService && matchingService.domainName === domain;
      });
    });
  }, [packages, services]);

  // Further filter packages by selected dimensions for a given line
  const filteredPackagesForLine = React.useCallback((line: LineState) => {
    const pkgs = packagesForDomain(line.selectedDomain);
    const selectedDims = Object.entries(line.selectedDimensionValues).filter(([_, val]) => val !== '');
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
  }, [packagesForDomain]);

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

  const handlePackageSelect = (index: number, id: string, customName?: string) => {
    const newLines = [...lines];
    newLines[index].packageId = id;
    newLines[index].customName = customName || '';
    if (id && id !== 'custom') {
      newLines[index].isLoadingDeep = true;
      setLines(newLines);
      /*
       * Both at once. The package itself, and what it leaves for the client to
       * answer — because an operator on the telephone IS the client answering,
       * and until now this form never asked them.
       *
       * The questions are not fatal: a package whose open questions cannot be
       * read is still a package that can be booked, so a failure here clears
       * the block rather than the line.
       */
      Promise.all([
        getPackage(id),
        getOpenQuestionsForPackage(id).catch(() => ({ variables: [], classifications: [] })),
      ]).then(([deep, open]) => {
        setLines(prev => {
          const updated = [...prev];
          updated[index].selectedPackageDeep = deep;
          updated[index].isLoadingDeep = false;
          updated[index].openQuestions = open;
          // A different package asks different questions; answers to the last
          // one are not answers to this one.
          updated[index].variableAnswers = {};
          updated[index].chosenClassifications = {};
          if (deep.price?.amount != null && !updated[index].linePrice) {
            updated[index].linePrice = String(deep.price.amount);
          }
          return updated;
        });
      }).catch(err => {
        console.error(err);
        setLines(prev => {
          const updated = [...prev];
          updated[index].isLoadingDeep = false;
          return updated;
        });
      });
    } else {
      newLines[index].selectedPackageDeep = null;
      newLines[index].openQuestions = null;
      newLines[index].variableAnswers = {};
      newLines[index].chosenClassifications = {};
      setLines(newLines);
    }
  };



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
            <label className="q-label">Date and time (optional)</label>
            <input className="q-input" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
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

      <div className="q-section q-rise">
        <h2 className="q-section-title">2. Packages</h2>
        
        <div className="q-stack q-stack-lg">
          {lines.map((line, index) => (
            /*
             * Keyed by the line's own id, so React animates the one that was
             * added rather than replaying every card each time the list
             * changes — an index key would restage the whole section on every
             * keystroke that adds or removes a line.
             */
            <div key={line.id} className="q-card q-stack q-stack-md q-appear" style={{ position: 'relative' }}>
              {lines.length > 1 && (
                <button
                  type="button"
                  className="q-btn-ghost q-btn-xs"
                  style={{ position: 'absolute', top: '16px', right: '16px' }}
                  onClick={() => {
                    const newLines = [...lines];
                    newLines.splice(index, 1);
                    setLines(newLines);
                    editorRefs.current.splice(index, 1);
                  }}
                >
                  Remove
                </button>
              )}
              <h3 className="q-strong" style={{ marginBottom: '8px' }}>
                {lines.length > 1 ? `Package ${index + 1}` : 'Package'}
              </h3>
              
              {/* ── Step A: Choose a Domain ─────────────────── */}
              {!line.selectedDomain ? (
                <div key="domain" className="q-stack q-stack-sm q-swap">
                  <label className="q-label">Service domain</label>
                  {allDomains.length > 0 ? (
                    <div className="q-chip-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
                      {allDomains.map(domain => (
                        <button
                          key={domain}
                          type="button"
                          className="q-chip q-button-base"
                          style={{
                            padding: '10px 20px',
                            fontSize: '0.95rem',
                            border: '1px solid var(--q-color-ink-200)',
                            borderRadius: 'var(--q-radius-md)',
                            cursor: 'pointer',
                            transition: 'all 0.15s var(--q-ease)',
                          }}
                          onClick={() => {
                            const newLines = [...lines];
                            newLines[index].selectedDomain = domain;
                            setLines(newLines);
                          }}
                        >
                          {domain}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="q-meta">No service domains defined yet. Create a service first.</p>
                  )}
                </div>

              /* ── Step B: Filter and Choose Package ── */
              ) : !line.packageId ? (
                /*
                 * Each step replaces the last in the same box, so the eye needs
                 * telling that the box changed rather than that the page did.
                 * q-swap settles in from very slightly small — the truthful
                 * animation for content BECOMING other content, where rising
                 * would claim something new had arrived beneath it.
                 *
                 * Keyed by the step, so React remounts on the change and the
                 * animation actually plays; without a changing key the same
                 * element is reused and nothing moves.
                 */
                <div key="choose" className="q-stack q-stack-sm q-swap">
                  <div className="q-row q-row-between" style={{ alignItems: 'center', marginBottom: '8px' }}>
                    <span className="q-meta" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <strong className="q-strong" style={{ color: 'var(--q-color-ink-900)' }}>{line.selectedDomain}</strong>
                    </span>
                    <button
                      type="button"
                      className="q-btn-ghost q-btn-xs"
                      onClick={() => {
                        const newLines = [...lines];
                        newLines[index].selectedDomain = '';
                        newLines[index].selectedDimensionValues = {};
                        setLines(newLines);
                      }}
                    >
                      Change domain
                    </button>
                  </div>
                  
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
                  {(dimensionsByDomain[line.selectedDomain] || []).length > 0 && (() => {
                    const active = Object.values(line.selectedDimensionValues).filter(Boolean).length;
                    return (
                    <details className="q-stack q-stack-md" style={{ marginBottom: '24px' }} open={active > 0}>
                      <summary className="q-strong" style={{ marginBottom: '4px', cursor: 'pointer' }}>
                        Filter by classification{active > 0 ? ` · ${active} applied` : ''}
                      </summary>
                      <div className="q-grid-2" style={{ marginTop: '12px' }}>
                        {(dimensionsByDomain[line.selectedDomain] || []).map((d: any) => (
                          <div key={d.id} className="q-field">
                            <label className="q-label">{d.name}</label>
                            <select
                              className="q-select"
                              value={line.selectedDimensionValues[d.id] || ''}
                              onChange={(e) => {
                                const newLines = [...lines];
                                newLines[index].selectedDimensionValues = {
                                  ...newLines[index].selectedDimensionValues,
                                  [d.id]: e.target.value
                                };
                                setLines(newLines);
                              }}
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

                  {/* Matching Packages Stack */}
                  <div className="q-stack q-stack-md">
                    <h4 className="q-strong" style={{ marginBottom: '8px' }}>Package</h4>

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
                      items={filteredPackagesForLine(line)}
                      noun="package"
                      // Always drawn: this is the step, not an aid to it.
                      threshold={0}
                      read={(p: any) => ({ name: p.name, description: p.description, tags: [] })}
                    >
                      {(pkgs, { query }) => (
                        <div className="q-stack q-stack-sm">
                          {pkgs.map((p: any) => (
                            <button
                              key={p.id}
                              type="button"
                              className="q-option"
                              onClick={() => handlePackageSelect(index, p.id)}
                            >
                              <div className="q-row q-row-between">
                                <div>
                                  <div className="q-strong">{p.name}</div>
                                  {p.description && <div className="q-meta-sm">{p.description}</div>}
                                  <div className="q-row q-row-sm">
                                    {p.durationMinutes ? <span className="q-meta-sm">{p.durationMinutes} minutes</span> : null}
                                    {p.deliverables?.length ? (
                                      <span className="q-meta-sm">
                                        {p.deliverables.length} deliverable{p.deliverables.length === 1 ? '' : 's'}
                                      </span>
                                    ) : null}
                                    {p.services?.length ? (
                                      <span className="q-meta-sm">
                                        {p.services.length} service{p.services.length === 1 ? '' : 's'}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <span className="q-meta-sm">Select &rarr;</span>
                              </div>
                            </button>
                          ))}

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
                            className="q-btn q-btn-secondary q-fill q-center-text"
                            onClick={() => handlePackageSelect(index, 'custom', query)}
                          >
                            {query ? `Create package: “${query}”` : 'Create a new package'}
                          </button>
                        </div>
                      )}
                    </CatalogFilter>
                  </div>
                </div>

              /* ── Step D: Configure the chosen Package ────────────── */
              ) : (
                <div key="configure" className="q-field q-swap">
                  <div className="q-row q-row-between" style={{ marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <span className="q-row" style={{ gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="q-badge q-badge-neutral">{line.selectedDomain}</span>
                      {Object.entries(line.selectedDimensionValues).filter(([_, v]) => v).map(([dimId, valId]) => {
                        const d = (dimensionsByDomain[line.selectedDomain] || []).find((x: any) => x.id === dimId);
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
                          <div className="q-narrow q-stack q-stack-md" style={{ marginTop: '24px' }}>
                            <div>
                              <h4 className="q-section-title" style={{ margin: 0 }}>What this package asks</h4>
                              <p className="q-meta-sm" style={{ margin: '4px 0 0' }}>
                                Left open for the client. Answer what they have said; the rest can be
                                filled in on the booking.
                              </p>
                            </div>

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
                                  <span className="q-meta-sm" style={{ marginLeft: '8px' }}>{v.serviceName}</span>
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
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      <div className="q-field" style={{ marginTop: '24px', borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '24px' }}>
                        <label className="q-label">Line Price</label>
                        <input className="q-input" type="number" value={line.linePrice} onChange={e => {
                          const newLines = [...lines];
                          newLines[index].linePrice = e.target.value;
                          setLines(newLines);
                        }} placeholder="0.00" />
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            className="q-btn q-btn-secondary"
            onClick={() => setLines([...lines, freshLine()])}
          >
            Add another package
          </button>
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
          const fromPackages = lines.flatMap((line, i) => {
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
          });

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
          <div className="q-field" style={{ maxWidth: '420px' }}>
            <label className="q-label">Amount to invoice</label>
            <select
              className="q-select"
              value={invoicePortion}
              onChange={(e) => setInvoicePortion(e.target.value as 'full' | 'deposit')}
            >
              <option value="full">The full amount</option>
              <option value="deposit">
                {depositDefault > 0 ? `The deposit only (${depositDefault}%)` : 'The deposit only'}
              </option>
            </select>
            {(() => {
              // What the packages come to, so the figure is not arithmetic the
              // operator has to do in their head while filling in a form.
              //
              // Priced at nothing and not priced at all are different questions,
              // so they are asked separately: a booking every one of whose boxes
              // is empty gets no invoice, while a booking deliberately priced at
              // zero is a free job and gets one.
              const priced = lines.filter((l) => l.linePrice.trim() !== '');
              if (priced.length === 0) {
                return (
                  <span className="q-meta-sm">
                    Nothing above is priced yet, so no invoice is raised. Add one from the booking once you have quoted it.
                  </span>
                );
              }
              const total = priced.reduce((sum, l) => sum + (Number(l.linePrice) || 0), 0);
              const pct = invoicePortion === 'deposit' ? Number(deposit) || 0 : 100;
              const amount = Math.round(total * (pct / 100) * 100) / 100;
              return (
                <span className="q-meta-sm">
                  {invoicePortion === 'deposit' && pct > 0
                    ? `${formatAmount(amount)} of ${formatAmount(total)}. The balance can be invoiced later from the booking.`
                    : `${formatAmount(amount)}, the whole booking.`}
                </span>
              );
            })()}
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
