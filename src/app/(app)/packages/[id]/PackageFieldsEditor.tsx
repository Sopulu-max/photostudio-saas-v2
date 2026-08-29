'use client';

import React, { useState, useTransition, forwardRef, useImperativeHandle } from 'react';
import { useRouter } from 'next/navigation';
import { createPackage, updatePackage, setPackageStatus, duplicatePackage } from '@/modules/packages/interface';
import { formatDeliverable } from '@/modules/packages/interface';
import { DURATION_CHOICES } from '@/kernel/currency';
import { QuestionEditor } from './QuestionEditor';

type ServiceOption = { 
  id: string; 
  name: string; 
  domain?: { id?: string; name: string } | null;
  description?: string | null;
  deliverables?: { id: string; name: string }[];
  /** However many dimensions this service's domain asks, with what it carries. */
  dimensions?: { id: string; name: string; values: { id: string; name: string }[] }[];
  workflow?: { name: string; tasks: any[] };
};

/** A dimension a package can be classified by, and the domain that owns it. */
type DimensionOption = {
  id: string;
  name: string;
  domainName: string;
  /**
   * The domain that owns the dimension — needed to create a value on it, since
   * a dimension's vocabulary is the domain's rather than any one service's.
   * Absent where the caller reads dimensions off a service's saved tags, and a
   * dimension with no domain simply offers no way to add to it.
   */
  domainId?: string;
  values: { id: string; name: string }[];
};
type Stage = { name: string; roleName: string; frontStage: boolean };

/**
 * One thing this package promises, and the bundled service that produces it.
 *
 * The service is part of the promise rather than looked up from it. A package
 * bundling Photography and Framing promises prints through Framing; without the
 * pairing, "20 prints" floats free of anything that makes them.
 */
type Promise_ = { serviceId: string; deliverableId: string; quantity: number | null; unit: string | null; spec: string | null; specValues?: Record<string, unknown> | null };

import type { ServiceVariable } from '@/modules/services/interface';

/**
 * A Package is a commercial construct — it bundles one or more real
 * Services (asked of the Services module, never invented here) into a
 * single priced offering. Its routing is the union of every bundled
 * Service's Process, plus whatever this specific offering adds on its own.
 */
export const PackageFieldsEditor = forwardRef(function PackageFieldsEditor({
  mode,
  packageId,
  status,
  currencyCode,
  allServices,
  allVariables,
  allDeliverables,
  
  dimensionsByDomain,
  roleOptions,
  intendedValueIds = [],
  questions: initialQuestions,
  lockedQuestionIds = [],
  initial,
  onSubmitOverride,
  hideControls,
}: {
  mode: 'create' | 'edit';
  packageId?: string;
  status?: string;
  currencyCode: string;
  allServices: ServiceOption[];
  allVariables: (ServiceVariable & { serviceName: string })[];
  allDeliverables: { id: string; name: string }[];
  /** Domain name → the dimensions it classifies by. A package may draw on several. */
  dimensionsByDomain: Record<string, { id: string; name: string; values: { id: string; name: string }[] }[]>;
  roleOptions: string[];
  /**
   * Classifications the operator started from, before there was any service to
   * attach them to. Each is applied to a bundled service whose domain owns it.
   *
   * Plural because of where they now come from: a booking narrows by several
   * dimensions at once to find a package, and when none matches, the package
   * being created should start life classified the way it was searched for.
   * Making the operator re-pick what they just picked is how a narrowing search
   * turns into a blank form.
   */
  intendedValueIds?: string[];
  initial: {
    name?: string;
    description?: string | null;
    durationMinutes?: number | null;
    /**
     * What it sells for, in the module's normalised shape.
     *
     * Declared here rather than reached through a cast, which is why nothing
     * caught the edit page passing no price at all: `(initial as any).price`
     * reads undefined off any object and reports no error, so the field opened
     * blank and Save wrote that blank back over the real figure.
     */
    price?: { amount?: number; base_price?: number; currency?: string } | null;
    serviceIds?: string[];
    /** What the package promises, each on the bundled service that produces it. */
    deliverables?: Promise_[];
    /** Each value paired with the bundled service this package narrows to it. */
    narrowings?: { serviceId: string; valueId: string }[];
    extraStages?: Stage[];
    variableValues?: { serviceVariableId: string; value: unknown }[];
    tasks?: { taskId: string; isActive: boolean; roleId: string | null }[];
    services?: any[];
  };
  /** What this package asks a client at booking, and which of those are answered already. */
  questions?: any[];
  lockedQuestionIds?: string[];
  onSubmitOverride?: (payload: any) => Promise<void> | void;
  hideControls?: boolean;
}, ref) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /*
   * Numbered only when this editor IS the form.
   *
   * hideControls means it is embedded — today, inside the new-booking form,
   * which has its own "1. When & Who ... 4. Contract". Two numbered sequences on
   * one page produced a section 1 nested inside section 2 and a section 3
   * following a section 6, so Tasks read as buried rather than as a step. The
   * headings stay; only the numbers, which belong to a sequence that is not
   * running here, come off.
   */
  const embedded = Boolean(hideControls);
  const heading = (n: number, title: string) => (embedded ? title : `${n}. ${title}`);

  /*
   * Declaring a variable while building the package.
   *
   * A package could only ever fix a value for a variable the service had
   * already declared — so a service that declared none could be packaged
   * exactly one way, and adding "outfits" meant leaving, editing the service,
   * and coming back.
   *
   * But declaring what varies is most of what building a package IS. The same
   * Portrait Photography becomes Basic and Deluxe by saying two outfits or
   * five, and the moment you notice the studio needs an outfits variable is the
   * moment you are trying to sell two different amounts of it.
   *
   * The variable lands on the SERVICE, not on this package. That is the point:
   * it becomes available to every package of that service and to the booking
   * form. What this package contributes is the value it then fixes.
   */
  /*
   * The questions this package asks, held here so one Save covers them.
   *
   * They lived in a second editor below this form's Save button, with a Save of
   * its own — so editing a question and pressing the obvious button did nothing
   * to it. The same shape as the service variables, one module along.
   *
   * Undefined means this form was not given them and must not speak for them:
   * saving would otherwise send an empty list and delete every question the
   * package asks.
   */
  const [questions, setQuestions] = useState<any[] | undefined>(initialQuestions);

  const [declaringFor, setDeclaringFor] = useState<string | null>(null);
  const [newVar, setNewVar] = useState<{ label: string; kind: string; unit: string; options: string }>(
    { label: '', kind: 'number', unit: '', options: '' },
  );
  const [declaredVars, setDeclaredVars] = useState<any[]>([]);

  const declare = (serviceId: string) => {
    const label = newVar.label.trim();
    if (!label) return;
    startTransition(async () => {
      try {
        const { declareServiceVariable } = await import('@/modules/services/interface');
        const created: any = await declareServiceVariable({
          serviceId,
          variable: {
            key: label,
            label,
            kind: newVar.kind as any,
            unit: newVar.unit.trim() || null,
            options: newVar.options.split(',').map((o) => o.trim()).filter(Boolean),
          } as any,
        });
        if (created) {
          // Held locally so it appears at once. The page reloads it from the
          // service on the next render, which is where it actually lives.
          setDeclaredVars((prev) => prev.some((v) => v.id === created.id) ? prev : [...prev, created]);
        }
        setNewVar({ label: '', kind: 'number', unit: '', options: '' });
        setDeclaringFor(null);
      } catch (e: any) {
        alert(e?.message || 'Could not add that variable.');
      }
    });
  };


  const [nameTouched, setNameTouched] = useState(!!initial.name);
  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [serviceIds, setServiceIds] = useState<string[]>(initial.serviceIds || []);
  const [duration, setDuration] = useState(initial.durationMinutes ?? 0);
  
  // Reads either key, so a package priced before the shape was corrected still
  // opens showing its price rather than an empty box.
  const [priceAmount, setPriceAmount] = useState<string>(() => {
    const stored: any = initial.price ?? {};
    const value = stored.base_price ?? stored.amount;
    return value != null ? String(value) : '';
  });
  /*
   * Whether this form was handed a price at all.
   *
   * An empty box has two meanings and they are opposite. If the form was given
   * a price, empty means the operator cleared it — send null and erase it. If
   * it was never given one, empty means this form knows nothing about the
   * price, and sending null erases a price it was never shown.
   *
   * That second case is not hypothetical: the edit page passed no price for
   * months, so opening any package and pressing Save wiped what it sold for
   * while showing the operator nothing at all. Same rule as the workflow, the
   * variables and the intake questions — undefined is "not mine to speak for".
   */
  const wasGivenPrice = initial.price != null;
  
  /*
   * What this package promises, and how much of it, in what unit, to what spec.
   *
   * A service says the KIND — edited photographs. Only a package says six of
   * them, or thirty seconds, or 20x30. Held against the service that produces
   * it, so a package promising prints has to bundle something that prints.
   */
  const [promises, setPromises] = useState<Promise_[]>(() => {
    /*
     * Open a package and see what its services already produce.
     *
     * Selecting a service auto-promises what it makes, to save clicks. Coming
     * back to edit did not, so a bundle assembled before that — or by any path
     * other than the checkbox — opened with an empty promises list beside a
     * service that plainly produces things. Editing a bundled service is meant
     * to feel like editing the service, and a service does not forget its own
     * outputs.
     *
     * Materialised rather than merely shown, unlike the classifications above:
     * there, absence has a documented meaning — untouched sells everything —
     * so drawing the inheritance is enough. Here absence means nothing is
     * promised, and the rest of the app reads it that way, so parity with what
     * adding a service does is the honest fix.
     */
    const seeded = [...(initial.deliverables || [])];
    for (const sid of (initial.serviceIds || [])) {
      if (seeded.some((p) => p.serviceId === sid)) continue;
      const produces = (allServices.find((x) => x.id === sid)?.deliverables || []) as { id: string }[];
      for (const d of produces) {
        seeded.push({ serviceId: sid, deliverableId: d.id, quantity: null, unit: null, spec: null, specValues: null });
      }
    }
    return seeded;
  });
  const [newDeliverableId, setNewDeliverableId] = useState<Record<string, string>>({});

  const promisesFor = (sid: string) => promises.filter((p) => p.serviceId === sid);
  const addPromise = (sid: string, deliverableId: string) => {
    if (!deliverableId) return;
    setPromises((prev) => prev.some((p) => p.serviceId === sid && p.deliverableId === deliverableId)
      ? prev
      : [...prev, { serviceId: sid, deliverableId, quantity: null, unit: null, spec: null, specValues: null }]);
    setNewDeliverableId((prev) => ({ ...prev, [sid]: '' }));
  };
  const removePromise = (sid: string, deliverableId: string) =>
    setPromises((prev) => prev.filter((p) => !(p.serviceId === sid && p.deliverableId === deliverableId)));
  const patchPromise = (sid: string, deliverableId: string, patch: Partial<Promise_>) =>
    setPromises((prev) => prev.map((p) => (p.serviceId === sid && p.deliverableId === deliverableId ? { ...p, ...patch } : p)));


  /*
   * How this package narrows each service it bundles, keyed by service id.
   *
   * Per service rather than one flat list, because the narrowing is a fact
   * about a service inside this package: bundle two Photography services and a
   * bare value could not say which of them it applied to.
   *
   * A package selects; it never redefines. There is no free-text escape here on
   * purpose — inventing a value is an act on a domain's vocabulary, which
   * belongs to the service layer. What a package can say is drawn from what it
   * bundles, and a service left untouched sells everything it offers.
   */
  const [narrowings, setNarrowings] = useState<Record<string, string[]>>(() => {
    const byService: Record<string, string[]> = {};
    for (const n of (initial.narrowings || [])) {
      if (!byService[n.serviceId]) byService[n.serviceId] = [];
      byService[n.serviceId].push(n.valueId);
    }
    return byService;
  });
  const [pendingValue, setPendingValue] = useState<Record<string, string>>({});
  /*
   * Classifications and outputs a package invented while it was being built.
   *
   * A SERVICE LEAVES ITS LISTS OPEN, and a package is what opens them. Context:
   * Studio, Outdoor is what the service happened to say first, not the whole of
   * what it can be — so a studio assembling a Beach package should create Beach
   * there and then, because that is the moment the studio discovers it sells
   * one. Making them leave, edit the service and come back is what keeps a
   * catalogue as small as whatever was typed on the first day.
   *
   * WHERE EACH ONE LANDS DIFFERS, and the difference is not arbitrary:
   *
   *   A VALUE goes onto the DIMENSION, which belongs to the domain — so every
   *   service and every package classified that way can reach it from then on.
   *   It is NOT added to the service. A service's own values are the default a
   *   package inherits when it says nothing, so putting Beach there would
   *   silently reclassify every existing package that had never mentioned it.
   *
   *   AN OUTPUT goes onto the SERVICE, because a service's outputs are a menu
   *   rather than a default — nothing is promised until a package states a
   *   quantity. Widening it changes no existing package and makes the new
   *   output available to every future one, which is the same thing declaring a
   *   variable does.
   *
   * Both are held here as well as saved, so the thing just created appears
   * immediately instead of after a reload.
   */
  const [createdValues, setCreatedValues] = useState<Record<string, { id: string; name: string }[]>>({});
  const [newValue, setNewValue] = useState<Record<string, string>>({});
  const [declaredOutputs, setDeclaredOutputs] = useState<{ id: string; name: string; serviceId: string }[]>([]);
  /*
   * The tasks list, which was open in the database and shut in the form.
   *
   * package_tasks.workflow_task_id has always been nullable — a package holding
   * work of its own was provided for from the start. But this form rendered the
   * workflow's tasks as disabled checkboxes and never sent them at all, so
   * updatePackage's task handling, written and working, was reachable by
   * nothing. A Deluxe that includes an album had no way to say so.
   *
   * `taskEdits` holds changes to the copied ones, keyed by their package_task
   * id. `addedTasks` holds the package's own, which carry no id until saved.
   */
  const [taskEdits, setTaskEdits] = useState<Record<string, { isActive?: boolean; roleName?: string | null }>>({});
  const [addedTasks, setAddedTasks] = useState<{ serviceId: string; name: string; roleName: string | null }[]>([]);
  const [newTask, setNewTask] = useState<Record<string, string>>({});

  const addTask = (serviceId: string) => {
    const named = (newTask[serviceId] || '').trim();
    if (!named) return;
    setAddedTasks((prev) => [...prev, { serviceId, name: named, roleName: null }]);
    setNewTask((prev) => ({ ...prev, [serviceId]: '' }));
  };
  const [newOutput, setNewOutput] = useState<Record<string, string>>({});
  /*
   * Finding a service to bundle, rather than scrolling past all of them.
   *
   * The section drew every service in the studio as a full card — description,
   * every classification as a badge, its outputs, its variables — with the
   * selected ones scattered among them in creation order. At five services that
   * is untidy. At fifty it is a wall four thousand pixels tall in which the one
   * or two this package actually bundles are hidden, and the section is named
   * after those two.
   *
   * The same answer the booking form already reached for the same problem: a
   * search box, and a filter on the vocabulary the studio classifies by.
   */
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceDomain, setServiceDomain] = useState('');
  const [showAllServices, setShowAllServices] = useState(false);

  const createValue = (dim: any, serviceId: string, pendingKey: string, onCreated: (id: string) => void) => {
    const asked = (newValue[pendingKey] || '').trim();
    if (!asked || !dim.domainId) return;
    startTransition(async () => {
      try {
        const { findOrCreateDimensionValue } = await import('@/modules/services/interface');
        const id = await findOrCreateDimensionValue({
          serviceDomainId: dim.domainId, dimensionName: dim.name, value: asked,
        });
        if (!id) throw new Error(`Could not add "${asked}".`);
        setCreatedValues((prev) => {
          const mine = prev[dim.id] || [];
          return mine.some((v) => v.id === id) ? prev : { ...prev, [dim.id]: [...mine, { id, name: asked }] };
        });
        onCreated(id);
        setNewValue((prev) => ({ ...prev, [pendingKey]: '' }));
      } catch (e: any) {
        alert(e?.message || 'Could not add that value.');
      }
    });
  };

  const declareOutput = (serviceId: string) => {
    const asked = (newOutput[serviceId] || '').trim();
    if (!asked) return;
    startTransition(async () => {
      try {
        const { declareServiceDeliverable } = await import('@/modules/services/interface');
        const created = await declareServiceDeliverable({ serviceId, name: asked });
        if (!created) throw new Error(`Could not add "${asked}".`);
        setDeclaredOutputs((prev) =>
          prev.some((d) => d.id === created.id && d.serviceId === serviceId)
            ? prev
            : [...prev, { ...created, serviceId }]);
        addPromise(serviceId, created.id);
        setNewOutput((prev) => ({ ...prev, [serviceId]: '' }));
      } catch (e: any) {
        alert(e?.message || 'Could not add that output.');
      }
    });
  };
  /*
   * What this package includes (fixed variables).
   * Like dimensions, variables are tied to the selected services.
   */
  const initialVarsMap: Record<string, string> = {};
  for (const v of (initial.variableValues || [])) {
    initialVarsMap[v.serviceVariableId] = String(v.value ?? '');
  }
  const [variableValues, setVariableValues] = useState<Record<string, string>>(initialVarsMap);
  const setVariable = (id: string, raw: string) => setVariableValues((v) => ({ ...v, [id]: raw }));

  const [extraStages, setExtraStages] = useState<Stage[]>(initial.extraStages || []);

  const bundledNames = allServices.filter((s) => serviceIds.includes(s.id)).map((s) => s.name);
  const composed = bundledNames.join(' + ') || 'Untitled package';

  /*
   * (Available dimensions logic has been moved directly into the Service Cards)
   */
  const effectiveName = nameTouched ? name : composed;

  const toggleService = (id: string) => {
    setServiceIds((prevIds) => {
      const isRemoving = prevIds.includes(id);
      const newServiceIds = isRemoving ? prevIds.filter((x) => x !== id) : [...prevIds, id];

      if (isRemoving) {
        // Everything a package says is said about a bundled service, so dropping
        // one drops exactly its own — no set arithmetic, and a sibling service
        // keeps what it promised even if the two produce the same thing.
        setVariableValues((prevVars) => {
          const next = { ...prevVars };
          allVariables.filter((v) => v.serviceId === id).forEach((v) => delete next[v.id]);
          return next;
        });
        setNarrowings((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setPromises((prev) => prev.filter((p) => p.serviceId !== id));
      } else {
        // Adding a service: auto-promise what it produces, to save clicks.
        const addedService = allServices.find((s) => s.id === id);
        if (addedService) {
          const produces = addedService.deliverables || [];
          if (produces.length > 0) {
            setPromises((prev) => [
              ...prev,
              ...produces
                .filter((d) => !prev.some((p) => p.serviceId === id && p.deliverableId === d.id))
                .map((d) => ({ serviceId: id, deliverableId: d.id, quantity: null, unit: null, spec: null, specValues: null })),
            ]);
          }

          const sDims = addedService.dimensions || [];
          if (sDims.length > 0) {
            const defaultTags = sDims.flatMap((d) => d.values.map((v: any) => v.id));
            if (defaultTags.length > 0) {
              setNarrowings((prev) => {
                const existing = prev[id] || [];
                const toAdd = defaultTags.filter(tid => !existing.includes(tid));
                if (toAdd.length === 0) return prev;
                return { ...prev, [id]: [...existing, ...toAdd] };
              });
            }
          }
        }

        // The value the operator came in with finally has a service to narrow,
        // but only if this one's domain is the one that owns it.
        const domainName = addedService?.domain?.name;
        const owned = domainName
          ? intendedValueIds.filter((valueId) =>
              (dimensionsByDomain[domainName] || []).some((d) => d.values.some((v) => v.id === valueId)))
          : [];
        if (owned.length > 0) {
          setNarrowings((prev) => {
            const already = prev[id] || [];
            const missing = owned.filter((v) => !already.includes(v));
            return missing.length === 0 ? prev : { ...prev, [id]: [...already, ...missing] };
          });
        }
      }
      return newServiceIds;
    });
  };



  const addStage = () => setExtraStages((s) => [...s, { name: '', roleName: '', frontStage: true }]);
  const patchStage = (i: number, updates: Partial<Stage>) => setExtraStages((s) => s.map((row, idx) => (idx === i ? { ...row, ...updates } : row)));
  const removeStage = (i: number) => setExtraStages((s) => s.filter((_, idx) => idx !== i));

  const buildPayload = () => {
    // Only send values for variables belonging to currently selected services
    const activeVariables = allVariables.filter((v) => serviceIds.includes(v.serviceId));
    const payloadVariableValues = activeVariables
      .filter((v) => (variableValues[v.id] ?? '') !== '')
      .map((v) => {
        const raw = variableValues[v.id];
        const value =
          v.kind === 'number' ? Number(raw)
          : v.kind === 'boolean' ? raw === 'true'
          : raw;
        return { serviceVariableId: v.id, value };
      });

    return {
      name: effectiveName,
      description: description.trim() || null,
      durationMinutes: duration > 0 ? duration : null,
      // base_price, not amount. This wrote { amount } and read { amount } back,
      // so it agreed with itself and looked right on screen — while every
      // invoice, contract and booking total read base_price, found nothing, and
      // priced the package at zero.
      price: priceAmount
        ? { base_price: Number(priceAmount), currency: currencyCode }
        : (wasGivenPrice ? null : undefined),
      serviceIds,
      // Everything below is filtered to services still bundled, so deselecting
      // one cannot leave a link behind that the server would then reject.
      deliverables: promises.filter((p) => serviceIds.includes(p.serviceId)).map(p => ({
        serviceId: p.serviceId,
        deliverableId: p.deliverableId,
        quantity: p.quantity,
        specValues: p.specValues
      })),
      /*
       * The tasks, which this form rendered and then threw away.
       *
       * updatePackage has accepted them all along; nothing ever sent any, so
       * the checkboxes were disabled and the whole path was dead. Only touched
       * ones are sent — an untouched task is not an opinion, and re-stating
       * every copied task on every save would fight syncPackageTasksForWorkflow
       * for ownership of rows this form never edited.
       */
      tasks: [
        ...Object.entries(taskEdits).map(([id, edit]) => ({
          id, isActive: edit.isActive ?? true, roleName: edit.roleName ?? null,
        })),
        ...addedTasks.filter((t) => serviceIds.includes(t.serviceId)).map((t) => ({
          serviceId: t.serviceId, name: t.name, roleName: t.roleName, isActive: true,
        })),
      ],
      narrowings: serviceIds.flatMap((sid) =>
        (narrowings[sid] || []).map((valueId) => ({ serviceId: sid, valueId }))
      ),
      extraStages: extraStages.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), roleName: s.roleName.trim() || null, frontStage: s.frontStage })),
      variableValues: payloadVariableValues,
    };
  };

  useImperativeHandle(ref, () => ({
    buildPayload,
  }), [buildPayload]);

  const submit = () => {
    if (packageId) startTransition(async () => {
      try { 
        if (onSubmitOverride) { await onSubmitOverride({ packageId, ...buildPayload() }); return; }
        await updatePackage({ packageId, ...buildPayload() });
        /*
         * Through updatePackageQuestions rather than folded into updatePackage,
         * because that command owns a rule this form cannot: a question a client
         * has already answered cannot change type. One button, two commands —
         * the same way taking a booking raises its invoice.
         */
        if (questions !== undefined) {
          const { updatePackageQuestions } = await import('@/modules/packages/interface');
          await updatePackageQuestions({ packageId: packageId!, questions });
        }
        
        router.refresh(); 
        router.push(`/packages/${packageId}`);
      }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });
  };
  const submitCreate = () => startTransition(async () => {
    try { 
      if (onSubmitOverride) { await onSubmitOverride(buildPayload()); return; }
      const { packageId: newId } = await createPackage({ ...buildPayload(), formSchema: questions ?? [] }); 
      router.push(`/packages/${newId}`); 
    }
    catch (e: any) { alert(e?.message || 'Failed to create the package.'); }
  });

  const retired = status === 'retired';

  /** Everything the service itself is classified as — what it sells untouched. */
  const offeredBy = (serviceId: string) =>
    ((allServices.find((x) => x.id === serviceId)?.dimensions || []) as DimensionOption[])
      .flatMap((d) => d.values.map((v) => v.id));

  const renderDimension = (dim: DimensionOption, serviceId: string) => {
    /*
     * Untouched means "sells everything it offers" — so show that.
     *
     * The rule was already right and already written down a few lines above;
     * only the drawing of it was wrong. An empty answer rendered as an empty
     * field, which reads as though the service carried no classification at
     * all — so coming back to edit a package looked like the section had lost
     * what you put in it, when in fact nothing had ever needed storing.
     *
     * Inherited values are shown as the service's own. Touch one and the set
     * becomes this package's own answer, which is the moment narrowing
     * actually happens: subtraction from what the service offers.
     */
    const explicit = narrowings[serviceId];
    const inherited = explicit === undefined;
    const forService = explicit ?? offeredBy(serviceId);
    // Whatever the domain already knows, plus anything invented here since the
    // page loaded — so a value created a moment ago is selectable at once.
    const values = [
      ...dim.values,
      ...(createdValues[dim.id] || []).filter((v: any) => !dim.values.some((e: any) => e.id === v.id)),
    ];
    const chosen = forService.filter((id) => values.some((v: any) => v.id === id));
    // Scoped to the card it is drawn in, so the same dimension on two bundled
    // services keeps two independent answers.
    const pendingKey = `${serviceId}:${dim.id}`;
    const setFor = (next: string[]) => setNarrowings((prev) => ({ ...prev, [serviceId]: next }));
    const add = (id: string) => {
      if (id && !forService.includes(id)) setFor([...forService, id]);
      setPendingValue((prev) => ({ ...prev, [pendingKey]: '' }));
    };
    return (
      <div className="q-field" key={dim.id}>
        <label className="q-label">{dim.name}</label>
        <span className="q-meta-sm" style={{ display: 'block', opacity: 0.7 }}>
          {dim.domainName}
          {inherited && chosen.length > 0 && ' · as the service is classified'}
        </span>
        <div className="q-row" style={{ flexWrap: 'wrap', margin: chosen.length > 0 ? '8px 0' : '0' }}>
          {chosen.map((id) => {
            const name = values.find((v: any) => v.id === id)?.name || id;
            return (
              <span key={id} className="q-badge q-badge-neutral">
                {name} <button className="q-btn-ghost" style={{ padding: '0 0 0 6px' }} onClick={() => setFor(forService.filter((x) => x !== id))}>×</button>
              </span>
            );
          })}
        </div>
        <div className="q-row">
          <select
            className="q-select"
            value={pendingValue[pendingKey] || ''}
            onChange={(e) => setPendingValue((prev) => ({ ...prev, [pendingKey]: e.target.value }))}
            style={{ minWidth: '12rem' }}
          >
            <option value="">Select...</option>
            {values.filter((v: any) => !forService.includes(v.id)).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => add(pendingValue[pendingKey] || '')} disabled={!pendingValue[pendingKey]}>+ Add</button>
        </div>
        {/*
          * A list a service left open, opened.
          *
          * The value is created on the dimension, so it belongs to the domain
          * from then on and any service or package classified that way can use
          * it — which is what lets a studio's vocabulary grow by being used
          * rather than by being fully imagined up front.
          */}
        {dim.domainId && (
          <div className="q-row" style={{ marginTop: '6px' }}>
            <input
              className="q-input q-input-sm"
              placeholder={`New ${String(dim.name).toLowerCase()}`}
              value={newValue[pendingKey] || ''}
              onChange={(e) => setNewValue((prev) => ({ ...prev, [pendingKey]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createValue(dim, serviceId, pendingKey, (id) => add(id)); } }}
              style={{ minWidth: '12rem' }}
            />
            <button
              type="button" className="q-btn q-btn-ghost q-btn-xs"
              disabled={isPending || !(newValue[pendingKey] || '').trim()}
              onClick={() => createValue(dim, serviceId, pendingKey, (id) => add(id))}
            >
              Create
            </button>
          </div>
        )}
      </div>
    );
  };

  /**
   * What this package promises through one bundled service.
   *
   * Drawn inside the service's card, which is the whole point: the quantity and
   * spec are the package's to set, but the thing being quantified is produced by
   * this service and by nothing else in the bundle.
   */

  const renderTasks = (s: ServiceOption) => {
    // A saved package holds its own copies; a new one is still reading the
    // workflow it will copy from.
    const savedService = initial.services?.find((is: any) => is.id === s.id);
    const sTasks = savedService?.tasks || s.workflow?.tasks || [];
    const mineAdded = addedTasks.filter((t) => t.serviceId === s.id);
    /*
     * A task copied from a workflow can be switched off or reassigned, but only
     * where this form owns the save. Inside a booking the editor is showing what
     * the package involves, and changing it there would be a decision about the
     * package rather than about the booking — which is why the booking has a
     * task section of its own.
     */
    const editable = !embedded;
    
    return (
      <div className="q-stack q-stack-sm" style={{ marginTop: '16px' }}>
        {s.workflow?.name && (
          <div className="q-meta-sm" style={{ marginTop: '-4px', marginBottom: '4px' }}>From workflow: {s.workflow.name}</div>
        )}
        <div className="q-stack" style={{ gap: '4px' }}>
          {sTasks.map((t: any) => {
            const edit = taskEdits[t.id] || {};
            const isActive = edit.isActive ?? t.isActive ?? true;
            const roleName = edit.roleName ?? t.roleName ?? t.default_role?.name ?? '';
            /*
             * Stores the whole state of the task, not just the half that
             * changed. A partial entry meant reassigning the role of a switched
             * off task resent it as active, because the save had no memory of
             * anything the operator had not touched this time.
             */
            const patch = (next: { isActive?: boolean; roleName?: string | null }) =>
              setTaskEdits((prev) => ({
                ...prev,
                [t.id]: { isActive, roleName: roleName || null, ...next },
              }));
            return (
              <div key={t.id} className="q-row q-row-between q-tile" style={{ padding: '6px 12px', alignItems: 'center' }}>
                <label className="q-row" style={{ alignItems: 'center', gap: '8px', cursor: editable ? 'pointer' : 'default' }}>
                  <input
                    type="checkbox" checked={isActive} disabled={!editable}
                    onChange={(e) => patch({ isActive: e.target.checked })}
                  />
                  <span style={{ fontSize: '0.9rem', opacity: isActive ? 1 : 0.5, textDecoration: isActive ? 'none' : 'line-through' }}>{t.name}</span>
                </label>
                {editable ? (
                  <select
                    className="q-select q-input-sm" value={roleName}
                    onChange={(e) => patch({ roleName: e.target.value || null })}
                    style={{ maxWidth: '11rem' }}
                  >
                    <option value="">No role</option>
                    {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                    {/* The role this task already carries, even if it is not one
                        of the studio's current options — so opening the form
                        cannot quietly drop it. */}
                    {roleName && !roleOptions.includes(roleName) && <option value={roleName}>{roleName}</option>}
                  </select>
                ) : roleName ? (
                  <span className="q-badge q-badge-neutral" style={{ fontSize: '0.75rem' }}>{roleName}</span>
                ) : null}
              </div>
            );
          })}

          {mineAdded.map((t, i) => (
            <div key={`added-${i}`} className="q-row q-row-between q-tile" style={{ padding: '6px 12px', alignItems: 'center' }}>
              <label className="q-row" style={{ alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked readOnly />
                <span style={{ fontSize: '0.9rem' }}>{t.name}</span>
                {/* Named so it is obvious this one is not answerable to the
                    workflow and will not be rewritten when the workflow changes. */}
                <span className="q-meta-sm">this package only</span>
              </label>
              <div className="q-row" style={{ alignItems: 'center', gap: '6px' }}>
                <select
                  className="q-select q-input-sm" value={t.roleName || ''}
                  onChange={(e) => setAddedTasks((prev) => prev.map((x) =>
                    x === t ? { ...x, roleName: e.target.value || null } : x))}
                  style={{ maxWidth: '11rem' }}
                >
                  <option value="">No role</option>
                  {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button
                  type="button" className="q-btn-ghost" style={{ padding: '0 4px' }}
                  onClick={() => setAddedTasks((prev) => prev.filter((x) => x !== t))}
                >×</button>
              </div>
            </div>
          ))}
        </div>

        {/*
          * A workflow says how the service is produced generally. This package
          * may involve a step that no other package of it does, and that step
          * belongs here rather than in the workflow — putting it there would
          * give it to every package of the service at once.
          */}
        {editable && (
          <div className="q-row" style={{ alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <input
              className="q-input q-input-sm"
              placeholder="A step this package alone involves"
              value={newTask[s.id] || ''}
              onChange={(e) => setNewTask((prev) => ({ ...prev, [s.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTask(s.id); } }}
              style={{ minWidth: '16rem' }}
            />
            <button
              type="button" className="q-btn q-btn-ghost q-btn-xs"
              disabled={!(newTask[s.id] || '').trim()}
              onClick={() => addTask(s.id)}
            >
              Add task
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderVariables = (s: ServiceOption) => {
    // Whatever the service already declares, plus anything declared here since
    // the page loaded. Rendered even when there are none, because "nothing
    // varies about this yet" is where a studio most needs to be able to say
    // that something does.
    const vars = [
      ...allVariables.filter((v) => v.serviceId === s.id),
      ...declaredVars.filter((v) => v.serviceId === s.id && !allVariables.some((a) => a.id === v.id)),
    ];
    return (
      <div className="q-stack q-stack-sm">
        {vars.length === 0 && declaringFor !== s.id && (
          <p className="q-meta-sm">
            Nothing varies about {s.name} yet, so every package of it offers the same thing.
          </p>
        )}
        {vars.map((v) => {
          const current = variableValues[v.id] ?? '';
          return (
            <div key={v.id} className="q-tile q-row q-row-between" style={{ flexWrap: 'wrap' }}>
              <div>
                <strong className="q-strong">{v.label}</strong>
                {current === '' && <span className="q-meta-sm"> &middot; asked at booking</span>}
              </div>
              <div className="q-row">
                {v.kind === 'number' && (
                  <>
                    <input
                      className="q-input q-num" type="number" value={current} disabled={isPending}
                      min={v.min ?? undefined} max={v.max ?? undefined}
                      onChange={(e) => setVariable(v.id, e.target.value)}
                      placeholder="&mdash;" style={{ width: '7rem' }}
                    />
                    {v.unit && <span className="q-meta-sm">{Number(current) === 1 ? v.unit : `${v.unit}s`}</span>}
                  </>
                )}
                {v.kind === 'choice' && (
                  <select className="q-select" value={current} disabled={isPending} onChange={(e) => setVariable(v.id, e.target.value)} style={{ minWidth: '10rem' }}>
                    <option value="">Ask the client</option>
                    {v.options.map((o: string) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
                {v.kind === 'boolean' && (
                  <select className="q-select" value={current} disabled={isPending} onChange={(e) => setVariable(v.id, e.target.value)} style={{ minWidth: '10rem' }}>
                    <option value="">Ask the client</option>
                    <option value="true">Included</option>
                    <option value="false">Not included</option>
                  </select>
                )}
                {v.kind === 'text' && (
                  <input className="q-input" value={current} disabled={isPending} onChange={(e) => setVariable(v.id, e.target.value)} placeholder="Ask the client" style={{ minWidth: '10rem' }} />
                )}
                {v.kind === 'textarea' && (
                  <textarea className="q-input" value={current} disabled={isPending} onChange={(e) => setVariable(v.id, e.target.value)} placeholder="Ask the client" style={{ minWidth: '10rem', minHeight: '3rem' }} />
                )}
                {v.kind === 'date' && (
                  <input className="q-input" type="date" value={current} disabled={isPending} onChange={(e) => setVariable(v.id, e.target.value)} style={{ minWidth: '10rem' }} />
                )}
                {v.kind === 'url' && (
                  <input className="q-input" type="url" value={current} disabled={isPending} onChange={(e) => setVariable(v.id, e.target.value)} placeholder="https://..." style={{ minWidth: '10rem' }} />
                )}
                {v.kind === 'multichoice' && (
                  <div className="q-stack q-stack-xs">
                    {v.options.map((o: string) => {
                      const selected = current.split(',').filter(Boolean);
                      const isOn = selected.includes(o);
                      return (
                        <label key={o} className="q-row" style={{ gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isOn}
                            disabled={isPending}
                            onChange={() => {
                              const next = isOn ? selected.filter((x: string) => x !== o) : [...selected, o];
                              setVariable(v.id, next.join(','));
                            }}
                          />
                          <span>{o}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {current !== '' && (
                  <button type="button" className="q-btn q-btn-secondary q-btn-xs" disabled={isPending} onClick={() => setVariable(v.id, '')}>Clear</button>
                )}
              </div>
            </div>
          );
        })}

        {/*
          * Declaring a new one, here, while building the package.
          *
          * It is added to the SERVICE — so it becomes available to every other
          * package of that service and to the booking form — and this package
          * then fixes a value for it like any other. That is what makes two
          * packages of one service different: not different services, the same
          * service with different values fixed.
          */}
        {declaringFor === s.id ? (
          <div className="q-tile q-stack q-stack-sm">
            <div className="q-row">
              <div className="q-field" style={{ flex: 1, minWidth: '10rem' }}>
                <label className="q-label">What varies</label>
                <input
                  className="q-input"
                  value={newVar.label}
                  disabled={isPending}
                  onChange={(e) => setNewVar({ ...newVar, label: e.target.value })}
                  placeholder="e.g. Outfits"
                />
              </div>
              <div className="q-field" style={{ minWidth: '9rem' }}>
                <label className="q-label">Kind</label>
                <select
                  className="q-select"
                  value={newVar.kind}
                  disabled={isPending}
                  onChange={(e) => setNewVar({ ...newVar, kind: e.target.value })}
                >
                  <option value="number">Number</option>
                  <option value="choice">One of a list</option>
                  <option value="multichoice">Several of a list</option>
                  <option value="boolean">Included or not</option>
                  <option value="text">Text</option>
                  <option value="date">Date</option>
                </select>
              </div>
              {newVar.kind === 'number' && (
                <div className="q-field" style={{ minWidth: '8rem' }}>
                  <label className="q-label">Unit (optional)</label>
                  <input
                    className="q-input"
                    value={newVar.unit}
                    disabled={isPending}
                    onChange={(e) => setNewVar({ ...newVar, unit: e.target.value })}
                    placeholder="hour"
                  />
                </div>
              )}
            </div>

            {(newVar.kind === 'choice' || newVar.kind === 'multichoice') && (
              <div className="q-field">
                <label className="q-label">Choices, separated by commas</label>
                <input
                  className="q-input"
                  value={newVar.options}
                  disabled={isPending}
                  onChange={(e) => setNewVar({ ...newVar, options: e.target.value })}
                  placeholder="Indoor, Outdoor, Both"
                />
              </div>
            )}

            <div className="q-row">
              <button
                type="button"
                className="q-btn q-btn-primary q-btn-sm"
                disabled={isPending || !newVar.label.trim()}
                onClick={() => declare(s.id)}
              >
                {isPending ? 'Adding…' : 'Add to ' + s.name}
              </button>
              <button
                type="button"
                className="q-btn q-btn-secondary q-btn-sm"
                disabled={isPending}
                onClick={() => { setDeclaringFor(null); setNewVar({ label: '', kind: 'number', unit: '', options: '' }); }}
              >
                Cancel
              </button>
            </div>

            <span className="q-meta-sm">
              Added to {s.name} itself, so every package of it can set a value — and the booking form
              can ask a client when a package leaves it open.
            </span>
          </div>
        ) : (
          <div>
            <button
              type="button"
              className="q-btn q-btn-secondary q-btn-sm"
              disabled={isPending}
              onClick={() => setDeclaringFor(s.id)}
            >
              Add a variable
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderPromises = (s: ServiceOption) => {
    const mine = promisesFor(s.id);
    // What the service said it produces, plus anything declared onto it here.
    const produces = [
      ...(s.deliverables || []),
      ...declaredOutputs.filter((d) => d.serviceId === s.id && !(s.deliverables || []).some((e: any) => e.id === d.id)),
    ];
    const nameOf = (id: string) =>
      allDeliverables.find((d) => d.id === id)?.name
      ?? declaredOutputs.find((d) => d.id === id)?.name
      ?? produces.find((d: any) => d.id === id)?.name
      ?? id;
    const suggested = produces.filter((d: any) => !mine.some((p) => p.deliverableId === d.id));
    return (
      <div className="q-stack q-stack-sm">
        {mine.length === 0 && <p className="q-empty" style={{ margin: 0 }}>Nothing promised from this service yet.</p>}
        {mine.map((p) => {
          const dName = nameOf(p.deliverableId);
          return (
            <div key={p.deliverableId} className="q-tile q-stack q-stack-sm">
              <div className="q-row q-row-between">
                <strong className="q-strong">{dName}</strong>
                <button type="button" className="q-btn-ghost" style={{ padding: '0 4px' }} onClick={() => removePromise(s.id, p.deliverableId)}>×</button>
              </div>
              <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <input
                  className="q-input q-input-sm" type="number" min={0} placeholder="Quantity"
                  value={p.quantity ?? ''}
                  onChange={(e) => patchPromise(s.id, p.deliverableId, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
                  style={{ maxWidth: '7rem' }}
                />
              </div>

              {/* Dynamic Deliverable Form */}
              {(() => {
                const def = (allDeliverables as any[]).find((d) => d.id === p.deliverableId);
                if (!def) return null;
                
                // If it's a baked instance, there is no form to show
                if (def.spec_values) {
                  return (
                    <div className="q-meta-sm q-banner q-banner-info">
                      <strong>Locked SKU:</strong> The details for this deliverable are predefined and locked by the studio.
                    </div>
                  );
                }

                // If it's a class with a schema, render the form
                const schema = def.spec_schema;
                if (!schema || !Array.isArray(schema) || schema.length === 0) return null;
                
                const currentVals = p.specValues || {};

                return (
                  <div className="q-stack q-stack-sm" style={{ paddingLeft: '16px', borderLeft: '2px solid var(--q-color-neutral-300)' }}>
                    {schema.map((field: any, i: number) => {
                      if (!field.key) return null;
                      
                      const setVal = (v: any) => patchPromise(s.id, p.deliverableId, { specValues: { ...currentVals, [field.key]: v } });
                      
                      return (
                        <div key={i} className="q-field">
                          <label className="q-label q-label-sm">{field.key}</label>
                          {field.type === 'select' && field.options ? (
                            <select 
                              className="q-select q-select-sm" 
                              value={(currentVals[field.key] as string) || ''} 
                              onChange={(e) => setVal(e.target.value)}
                            >
                              <option value="">Select...</option>
                              {field.options.map((opt: string) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input 
                              type="text" 
                              className="q-input q-input-sm" 
                              value={(currentVals[field.key] as string) || ''} 
                              onChange={(e) => setVal(e.target.value)} 
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <span className="q-meta-sm" style={{ opacity: 0.8 }}>
                Appears as: {formatDeliverable({ name: dName, quantity: p.quantity, spec_values: p.specValues || (allDeliverables as any[]).find((d) => d.id === p.deliverableId)?.spec_values })}
              </span>
            </div>
          );
        })}

        {suggested.length > 0 && (
          <div className="q-row" style={{ flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
            <span className="q-meta-sm">Also produces:</span>
            {suggested.map((d: any) => (
              <button key={d.id} type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => addPromise(s.id, d.id)}>
                + {d.name}
              </button>
            ))}
          </div>
        )}

        {/*
          * Promising something the service had not listed.
          *
          * "All outputs produced by this service have been promised" was a dead
          * end: it stated a limit and offered no way past it, when the package
          * being built is exactly what discovers that the service also produces
          * an album. The output is declared onto the SERVICE, so it joins the
          * menu for every package of it — the same act as declaring a variable,
          * and safe for the same reason: a menu promises nothing on its own.
          */}
        <div className="q-row" style={{ alignItems: 'center', gap: '6px' }}>
          <input
            className="q-input q-input-sm"
            placeholder="Something else it produces"
            value={newOutput[s.id] || ''}
            onChange={(e) => setNewOutput((prev) => ({ ...prev, [s.id]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); declareOutput(s.id); } }}
            style={{ minWidth: '14rem' }}
          />
          <button
            type="button" className="q-btn q-btn-ghost q-btn-xs"
            disabled={isPending || !(newOutput[s.id] || '').trim()}
            onClick={() => declareOutput(s.id)}
          >
            Add to this service
          </button>
        </div>
      </div>
    );
  };

  /** The production sequences to run for this bundled service. */


  return (
    <div className="q-stack q-stack-lg">
      <div className="q-card q-section">
        <h2 className="q-section-title">{heading(1, "Package Identity")}</h2>
        <div className="q-stack q-stack-md">
          <div className="q-field">
            <label className="q-label">Name</label>
            <input className="q-input" value={effectiveName}
              onFocus={() => { if (!nameTouched) setName(composed); }}
              onChange={(e) => { setNameTouched(true); setName(e.target.value); }} />
            <span className="q-meta-sm">{nameTouched ? 'Your own name.' : 'Composed from what you bundled above — type here to give it a name of your own.'}</span>
          </div>
          <div className="q-field">
            <label className="q-label">Description</label>
            <textarea className="q-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the client gets. Shown on the booking page." />
          </div>
          <div className="q-field">
            <label className="q-label">Base Price</label>
            <div className="q-row" style={{ gap: '8px', alignItems: 'center' }}>
              <span className="q-meta-sm q-strong" style={{ width: '40px' }}>{currencyCode}</span>
              <input type="number" className="q-input q-num" value={priceAmount} onChange={(e) => setPriceAmount(e.target.value)} placeholder="0.00" step="0.01" style={{ width: '120px' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">{heading(2, "Services")}</h2>
        <p className="q-meta" style={{ marginBottom: '16px' }}>
          The services this package is built from. What each one promises, is classified as, and
          involves is set in the sections below.
        </p>

        {(() => {
          /*
           * CHOSEN FIRST, SEPARATELY FROM THE CHOOSING.
           *
           * This section is named after what the package bundles, and the
           * bundle was the one thing it did not show: two selected services sat
           * among forty-eight unselected ones, distinguished by a border
           * colour. The answer now sits at the top, and the list you pick from
           * holds only what is not yet in it.
           *
           * THE OPTIONS ARE ROWS, NOT CARDS. A picker option needs to tell this
           * service apart from the others — its name, its domain, and its
           * classifications when two services are named alike. It was carrying
           * the service's description, outputs and variables as well, which is
           * both a detail page's worth of content per row AND a duplicate: the
           * sections below already show exactly that, for the services actually
           * bundled, which is the only place it can be acted on.
           */
          const chosen = allServices.filter((s) => serviceIds.includes(s.id));
          const domains = [...new Set(allServices.map((s) => s.domain?.name).filter(Boolean))] as string[];

          const needle = serviceSearch.trim().toLowerCase();
          const matches = allServices.filter((s) => {
            if (serviceIds.includes(s.id)) return false;
            if (serviceDomain && s.domain?.name !== serviceDomain) return false;
            if (!needle) return true;
            const tags = (s.dimensions || []).flatMap((d: any) => d.values.map((v: any) => v.name));
            return [s.name, s.description, s.domain?.name, ...tags]
              .some((f) => (f || '').toLowerCase().includes(needle));
          });

          /*
           * Bounded, and openable.
           *
           * Bounding it is right — this is a form, and you are choosing rather
           * than browsing, so fifty rows between two fields buries the fields.
           * But the first cut told you to search and left no other way through:
           * a service you could not name and could not narrow to was simply
           * unreachable. Saying how many are held back and offering to show
           * them is the difference between a bound and a wall.
           */
          const LIMIT = 15;
          const shown = showAllServices ? matches : matches.slice(0, LIMIT);
          const hidden = matches.length - shown.length;

          const tagsOf = (s: any) => (s.dimensions || []).flatMap((d: any) => d.values);

          return (
            <div className="q-stack q-stack-lg">
              <div className="q-stack q-stack-sm">
                {chosen.length === 0 ? (
                  <p className="q-empty" style={{ margin: 0 }}>
                    Nothing bundled yet. A package is one or more services sold together, so pick at
                    least one below.
                  </p>
                ) : chosen.map((s) => (
                  <div key={s.id} className="q-row q-row-between q-tile">
                    <div>
                      <div className="q-strong">{s.name}</div>
                      <span className="q-eyebrow">{s.domain?.name || 'No domain'}</span>
                    </div>
                    <button
                      type="button" className="q-btn-ghost q-btn-xs"
                      onClick={() => toggleService(s.id)}
                      title={`Remove ${s.name} from this package`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              {/*
                * Only where there is something left to find. Inside a booking
                * the catalogue is already narrowed to the chosen package own
                * services and every one of them is bundled, so a search box
                * there searches an empty set.
                */}
              {allServices.length > chosen.length && (
              <div className="q-stack q-stack-sm">
                <div className="q-row q-row-sm">
                  <input
                    className="q-input"
                    placeholder="Search services by name, domain or classification"
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                    style={{ flex: '1 1 16rem' }}
                  />
                  {domains.length > 1 && (
                    <select className="q-select" value={serviceDomain} onChange={(e) => setServiceDomain(e.target.value)}>
                      <option value="">Every domain</option>
                      {domains.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  )}
                </div>

                {shown.map((s) => {
                  const tags = tagsOf(s);
                  return (
                    <button key={s.id} type="button" className="q-option" onClick={() => toggleService(s.id)}>
                      <div className="q-row q-row-between">
                        <div>
                          <span className="q-strong">{s.name}</span>{' '}
                          <span className="q-meta-sm">{s.domain?.name || 'No domain'}</span>
                        </div>
                        {tags.length > 0 && (
                          <div className="q-row q-row-sm">
                            {tags.slice(0, 3).map((t: any) => (
                              <span key={t.id} className="q-value q-value-sm">{t.name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}

                {hidden > 0 && (
                  <div className="q-row q-row-sm">
                    <span className="q-meta-sm">{shown.length} of {matches.length} shown.</span>
                    <button type="button" className="q-btn q-btn-ghost q-btn-xs" onClick={() => setShowAllServices(true)}>
                      Show the other {hidden}
                    </button>
                  </div>
                )}

                {matches.length === 0 && (
                  <p className="q-meta-sm">No service matches. Clear the search or pick another domain.</p>
                )}
              </div>
              )}

              {allServices.length === 0 && (
                <p className="q-meta-sm">No services yet. A package is built from services, so create one first.</p>
              )}
            </div>
          );
        })()}
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">{heading(3, "Classifications")}</h2>
        <div className="q-stack q-stack-md">
          {(() => {
            const bundledServices = allServices.filter(s => serviceIds.includes(s.id));
            if (bundledServices.length === 0) return <p className="q-empty">Select services above to narrow their classifications.</p>;
            const withDims = bundledServices.filter(s => (s.domain?.name && (dimensionsByDomain[s.domain.name] || []).length > 0));
            if (withDims.length === 0) return <p className="q-meta-sm">None of the bundled services have classifications.</p>;
            return withDims.map((s) => {
              const domainDims = s.domain?.name ? dimensionsByDomain[s.domain.name] || [] : [];
              return (
                <div key={s.id} style={{ marginBottom: '16px' }}>
                  <h3 className="q-strong" style={{ marginBottom: '8px' }}>For {s.name}</h3>
                  <div className="q-grid-cards">
                    {domainDims.map((d: any) => renderDimension({ ...d, domainName: s.domain?.name || '', domainId: s.domain?.id || '' }, s.id))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">{heading(4, "Variables")}</h2>
        
        <div className="q-stack q-stack-md">
          {(() => {
            const bundledServices = allServices.filter(s => serviceIds.includes(s.id));
            if (bundledServices.length === 0) return <p className="q-empty">Select services above to see their variables.</p>;
            const withVars = bundledServices.filter(s => allVariables.some(v => v.serviceId === s.id));
            if (withVars.length === 0) return <p className="q-meta-sm">None of the bundled services have variables.</p>;
            return withVars.map((s) => (
              <div key={s.id} style={{ marginBottom: '16px' }}>
                <h3 className="q-strong" style={{ marginBottom: '8px' }}>For {s.name}</h3>
                {renderVariables(s)}
              </div>
            ));
          })()}
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">{heading(5, "Tasks")}</h2>
        
        <div className="q-stack q-stack-md">
          {(() => {
            const bundledServices = allServices.filter(s => serviceIds.includes(s.id));
            if (bundledServices.length === 0) return <p className="q-empty">Select services above to see their production tasks.</p>;
            /*
              * Every bundled service, including one with no workflow at all.
              *
              * This used to drop those, and then told the operator to go and
              * define a workflow in Services — which is right for work the
              * service always involves and wrong for work only this package
              * does. A service with no workflow was the one case where a
              * package most needed a task of its own, and it was the one case
              * with nowhere to put it.
              */
            return bundledServices.map((s) => (
              <div key={s.id} style={{ marginBottom: '16px' }}>
                <h3 className="q-strong" style={{ marginBottom: '2px' }}>For {s.name}</h3>
                {!s.workflow?.name && (
                  <p className="q-meta-sm" style={{ marginBottom: '4px' }}>
                    No workflow defines how {s.name} is produced. Define one in Services to give every
                    package of it the same steps, or add a step below that this package alone involves.
                  </p>
                )}
                {renderTasks(s)}
              </div>
            ));
          })()}
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">{heading(6, "Deliverables")}</h2>
        
        <div className="q-stack q-stack-md">
          {(() => {
            const bundledServices = allServices.filter(s => serviceIds.includes(s.id));
            if (bundledServices.length === 0) return <p className="q-empty">Select services above to configure what they deliver.</p>;
            return bundledServices.map((s) => (
              <div key={s.id} style={{ marginBottom: '16px' }}>
                <h3 className="q-strong" style={{ marginBottom: '8px' }}>From {s.name}</h3>
                {renderPromises(s)}
              </div>
            ));
          })()}
        </div>
      </div>
      {/*
        * Intake questions, inside the form that saves them.
        *
        * Only when this form was given them — a caller that does not pass
        * questions is not editing them, and a form that reports on what it was
        * never given deletes it.
        */}
      {questions !== undefined && (
        <div className="q-card q-section">
          <h2 className="q-section-title">{heading(7, 'Intake questions')}</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            What a client is asked when booking this package, beyond what its services already vary by.
          </p>
          <QuestionEditor
            packageId={packageId || ''}
            questions={questions as any}
            lockedIds={lockedQuestionIds}
            services={allServices.filter((s) => serviceIds.includes(s.id)).map((s) => ({ id: s.id, name: s.name }))}
            onChange={setQuestions}
          />
        </div>
      )}

      {!hideControls && (
        <>
          <div className="q-row">
            {mode === 'create' ? (
              <button className="q-btn q-btn-primary" disabled={isPending} onClick={submitCreate}>{isPending ? 'Creating…' : 'Create package'}</button>
            ) : (
              <>
                <button className="q-btn q-btn-primary" disabled={isPending} onClick={submit}>{isPending ? 'Saving…' : 'Save changes'}</button>
                <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => router.push(`/packages/${packageId}`)}>Cancel</button>
                <button type="button" className="q-btn q-btn-secondary" disabled={isPending}
                  onClick={() => startTransition(async () => {
                    try { const { packageId: copyId } = await duplicatePackage(packageId!); router.push(`/packages/${copyId}`); }
                    catch (e: any) { alert(e?.message || 'Failed to duplicate the package.'); }
                  })}>
                  Duplicate
                </button>
                <span className="q-spacer" />
                <button type="button" className="q-btn q-btn-secondary" disabled={isPending}
                  onClick={() => startTransition(async () => {
                    try { await setPackageStatus({ packageId: packageId!, status: retired ? 'active' : 'retired' }); router.refresh(); }
                    catch (e: any) { alert(e?.message || 'Something went wrong.'); }
                  })}>
                  {retired ? 'Make sellable again' : 'Retire this package'}
                </button>
              </>
            )}
          </div>
          {mode === 'edit' && (
            retired ? (
              <div className="q-note q-note-warn"><span className="q-meta-plain">Retired — it won&rsquo;t appear when adding services to a booking.</span></div>
            ) : (
              <span className="q-meta-sm">Retiring hides it from new bookings. Past bookings keep their line and price — nothing is deleted.</span>
            )
          )}
        </>
      )}
    </div>
  );
});
