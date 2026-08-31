'use client';

import React, { useState, useTransition, forwardRef, useImperativeHandle } from 'react';
import { useRouter } from 'next/navigation';
import { createPackage, updatePackage, setPackageStatus, duplicatePackage } from '@/modules/packages/interface';
import { formatDeliverable } from '@/modules/packages/interface';
import { DURATION_CHOICES } from '@/kernel/currency';
import { QuestionEditor } from './QuestionEditor';
/*
 * The control this form kept rebuilding.
 *
 * Choosing from what is known, and typing something that is not, is one
 * interaction — and it was already written, once, with the keyboard handling
 * and the outside-click and the "Use X — new" line that a hand-rolled copy
 * never gets round to. Two more copies went in here anyway, one for
 * classifications and one for outputs, because each felt like a different
 * feature while it was being written. They were the same feature twice.
 */
import { PickMany, PickToAdd } from '@/components/Pick';
// The same narrowing the catalogues do. A picker differs only in excluding
// what is chosen and bounding what it draws, and both are arguments.
import { CatalogFilter } from '@/components/CatalogFilter';
import { ImageUpload } from '@/components/ImageUpload';
import { Counted } from '@/components/Counted';
// The one widget for one variable. This form carried its own ten-branch
// copy of it — the fifth — while the component built to end exactly that
// sat one import away.
import { VariableField } from '@/components/VariableField';
// And the one parser that turns what was typed into what is meant.
import { parseVariableValue } from '@/modules/services/variableTypes';

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
    /** Public URL of the cover image, when this form is being shown it. */
    coverUrl?: string | null;
    /** Where that cover is looking, as a CSS background-position. */
    coverPosition?: string | null;
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
    variableValues?: { serviceVariableId: string; value: unknown; answeredBy?: 'studio' | 'client' }[];
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
   * variables and the booking form — undefined is "not mine to speak for".
   */
  const wasGivenPrice = initial.price != null;
  /*
   * The cover.
   *
   * `undefined` means this form was never shown one and must not speak for it —
   * the same rule the price, the workflow, the variables and the intake
   * questions all follow, and the one that has cost real data every time it was
   * skipped. An empty string is a deliberate removal.
   */
  const [coverUrl, setCoverUrl] = useState<string | null | undefined>(initial.coverUrl);
  const [coverProblem, setCoverProblem] = useState<string | null>(null);
  const [coverPosition, setCoverPosition] = useState<string | null | undefined>(initial.coverPosition);

  /*
   * A picture saves itself; a field waits for Save.
   *
   * Typing in a field is an edit in progress and belongs with the others under
   * one button. Choosing a picture is not: by the time it appears it is already
   * in the studio bucket, and the only thing still pending is one column. Making
   * that wait for a Save at the far end of a long form means an operator who
   * came from the package page to add a cover, added one, saw it, and left —
   * with a file in storage that nothing points at.
   *
   * Only where there is a package to save it to. While building one there is no
   * row yet, so it travels with the rest of the form as every other field does.
   */
  const applyCover = (next: string | null) => {
    setCoverUrl(next ?? '');
    // A new picture is a new crop. Carrying the old one over would place the
    // next photograph by where the last one happened to be looking.
    setCoverPosition(next ? null : null);
    setCoverProblem(null);
    saveCover({ coverUrl: next, coverPosition: null });
  };

  const applyCoverPosition = (next: string) => {
    setCoverPosition(next);
    setCoverProblem(null);
    saveCover({ coverPosition: next });
  };

  const saveCover = (patch: { coverUrl?: string | null; coverPosition?: string | null }) => {
    if (mode !== 'edit' || !packageId) return;
    startTransition(async () => {
      try {
        const { updatePackage } = await import('@/modules/packages/interface');
        // Only what changed. Every other field is absent, and absent means leave
        // it alone — the same rule that keeps this from erasing the price.
        await updatePackage({ packageId, ...patch });
      } catch (e: any) {
        setCoverProblem(e?.message || 'The cover could not be saved.');
      }
    });
  };
  
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

  /*
   * Which bundled service is open.
   *
   * Everything a package says, it says about one of its services: what that
   * service promises, how it is classified, what it fixes, what it involves.
   * Those were four sections, each looping over the same bundle and heading
   * every block "For Portrait Photography" — so three bundled services made
   * twelve blocks in four places, and configuring one service meant four trips
   * down the page finding its name each time.
   *
   * A service is the unit of the work, so a service is the unit on the page.
   *
   * `undefined` means never touched, and then the default decides: one bundled
   * service opens, because there is nothing to scan past, and several stay shut
   * because scanning is exactly what you are doing when there are several. A
   * service just added always opens — you added it in order to configure it.
   */
  const [openService, setOpenService] = useState<Record<string, boolean>>({});

  const createValue = (dim: any, asked: string, onCreated: (id: string) => void) => {
    if (!asked.trim() || !dim.domainId) return;
    startTransition(async () => {
      try {
        const { findOrCreateDimensionValue } = await import('@/modules/services/interface');
        const id = await findOrCreateDimensionValue({
          serviceDomainId: dim.domainId, dimensionName: dim.name, value: asked.trim(),
        });
        if (!id) throw new Error(`Could not add "${asked}".`);
        setCreatedValues((prev) => {
          const mine = prev[dim.id] || [];
          return mine.some((v) => v.id === id) ? prev : { ...prev, [dim.id]: [...mine, { id, name: asked }] };
        });
        onCreated(id);
      } catch (e: any) {
        alert(e?.message || 'Could not add that value.');
      }
    });
  };

  const declareOutput = (serviceId: string, name: string) => {
    const asked = name.trim();
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

  /*
   * WHICH OF THE TWO CLASSES EACH VARIABLE IS IN.
   *
   * A package either fixes a value — and that is part of the offer — or it
   * deliberately leaves the answer to the client and the question is asked at
   * booking. Both are decisions a studio makes one variable at a time.
   *
   * Only the first used to be recorded. "Ask the client" was an empty box, so a
   * question the studio meant to ask and a variable nobody had thought about
   * looked identical — and every variable in the second heap was asked. Declare
   * a variable on a service and every package built on it silently began asking
   * strangers a new question on the storefront.
   *
   * Undecided is now its own state, and it is asked of nobody. A package with
   * undecided variables is unfinished, which is a thing worth being able to see.
   */
  const [answeredBy, setAnsweredBy] = useState<Record<string, 'studio' | 'client'>>(() => {
    const seed: Record<string, 'studio' | 'client'> = {};
    for (const v of (initial.variableValues || [])) {
      if (v.answeredBy) seed[v.serviceVariableId] = v.answeredBy;
      else if (v.value !== null && v.value !== undefined && v.value !== '') seed[v.serviceVariableId] = 'studio';
    }
    return seed;
  });

  const decide = (id: string, next: 'studio' | 'client' | 'undecided') => {
    setAnsweredBy((prev) => {
      const copy = { ...prev };
      if (next === 'undecided') delete copy[id];
      else copy[id] = next;
      return copy;
    });
    // A question asked of the client cannot also carry the studio's answer, and
    // the table says so too.
    if (next !== 'studio') setVariable(id, '');
  };

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
        // Opened as it is added: you bundled it in order to say something about
        // it, and the place to say that is inside it.
        setOpenService((prev) => ({ ...prev, [id]: true }));
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
    // A variable owned by a dimension has no serviceId; it is in play because
    // of how the package is classified, not because of what it bundles.
    const activeVariables = allVariables.filter((v) => !v.serviceId || serviceIds.includes(v.serviceId));
    /*
     * Both decisions travel, and silence travels as silence.
     *
     * A studio answer needs its value; a client answer is the absence of one on
     * purpose. A variable in neither heap is simply not listed, which is what
     * tells the module nobody has decided — and it is then asked of no one
     * rather than of everyone.
     */
    type VariableDecision = { serviceVariableId: string; answeredBy: 'studio' | 'client'; value?: unknown };
    const payloadVariableValues: VariableDecision[] =
      activeVariables.flatMap<VariableDecision>((v) => {
      const chosen = answeredBy[v.id];
      if (chosen === 'client') return [{ serviceVariableId: v.id, answeredBy: 'client' as const }];
      const raw = variableValues[v.id];
      if ((raw ?? '') === '') return [];
      /*
       * One parser, like one widget.
       *
       * This read Number() for a number and raw === 'true' for a boolean, while
       * the client's form and the line config both went through
       * parseVariableValue — which accepts yes, included and 1 as true, and
       * returns null rather than NaN for a number that is not one. Three places
       * turning a typed string into a value is three chances to disagree about
       * what the studio meant, and two of them already had.
       */
      const value = parseVariableValue(v.kind as any, raw);
      return [{ serviceVariableId: v.id, answeredBy: 'studio' as const, value }];
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
      coverUrl: coverUrl === undefined ? undefined : (coverUrl || null),
      coverPosition: coverPosition === undefined ? undefined : (coverPosition || null),
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
    const setFor = (next: string[]) => setNarrowings((prev) => ({ ...prev, [serviceId]: next }));
    const chosenNames = chosen.map((id) => values.find((v: any) => v.id === id)?.name).filter(Boolean) as string[];

    return (
      <div className="q-field" key={dim.id}>
        <label className="q-label">{dim.name}</label>
        {/* The domain was restated under every dimension of the same service,
            beneath a heading that already names the service. What is worth
            saying here is the one thing that is not obvious: that these values
            are the service own and this package has not narrowed them. */}
        {inherited && chosen.length > 0 && (
          <span className="q-meta-sm">As the service is classified — not narrowed by this package.</span>
        )}
        {/*
          * Chips and a box that filters and will take a new word — which is
          * PickMany, and has been all along. This had three controls of its own
          * making instead: a list, a dropdown with an Add, and a standing
          * Create field beside it.
          *
          * PICKMANY SPEAKS IN NAMES AND THIS SECTION HOLDS IDS, which is what
          * made a bespoke copy look necessary. It is not: findOrCreateDimensionValue
          * takes a name and returns the id of the value it found or made, so a
          * name is a complete answer here. The only care needed is that the
          * narrowings array holds every dimension's values at once, so what
          * belongs to the others is carried through untouched.
          */}
        <PickMany
          values={chosenNames}
          options={values.map((v: any) => v.name)}
          placeholder={`Choose or type a ${String(dim.name).toLowerCase()}`}
          allowCreate={Boolean(dim.domainId)}
          onChange={(next) => {
            const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
            const others = forService.filter((id) => !values.some((v: any) => v.id === id));
            const resolved: string[] = [];
            let invented: string | null = null;
            for (const name of next) {
              const hit = values.find((v: any) => same(v.name, name));
              if (hit) resolved.push(hit.id);
              else invented = name;
            }
            setFor([...others, ...resolved]);
            // Created against the domain, then added — so the id is the studio's
            // own rather than a name this package alone would understand.
            if (invented) createValue(dim, invented, (id) => setFor([...others, ...resolved, id]));
          }}
        />
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
    /*
     * The service's own, and whatever its classifications bring with them.
     *
     * An Occasion has a date, declared once for the studio — so a service
     * classified Birthday carries that date here without anybody adding it to
     * the service. It is answered by the same rule as any other: the package
     * either fixes it or leaves it to the client.
     *
     * Read from the values in play, which is the package's narrowing where it
     * made one and the service's own classification where it did not — the same
     * set the classifications control above is showing.
     */
    const valuesInPlay = narrowings[s.id] ?? offeredBy(s.id);
    const dimsInPlay = new Set(
      (s.domain?.name ? dimensionsByDomain[s.domain.name] || [] : [])
        .filter((d: any) => d.values.some((v: any) => valuesInPlay.includes(v.id)))
        .map((d: any) => d.id),
    );
    const vars = [
      ...allVariables.filter((v) => v.serviceId === s.id),
      ...allVariables.filter((v: any) => v.dimensionId && dimsInPlay.has(v.dimensionId)),
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
          const who = answeredBy[v.id];
          return (
            <div key={v.id} className="q-tile q-row q-row-between" style={{ flexWrap: 'wrap' }}>
              <div>
                <strong className="q-strong">{v.label}</strong>
                {!who && <span className="q-meta-sm"> &middot; nobody has decided</span>}
              </div>
              <div className="q-row">
                {/*
                  * The decision first, because it governs whether the box beside
                  * it means anything. An empty box used to carry this, which is
                  * how "ask the client" and "not got to it yet" became the same
                  * thing — and the second of those was being asked.
                  */}
                <select
                  className="q-select" value={who ?? ''} disabled={isPending}
                  onChange={(e) => decide(v.id, (e.target.value || 'undecided') as any)}
                  style={{ minWidth: '9rem' }}
                >
                  <option value="">Not decided</option>
                  <option value="studio">We set it</option>
                  <option value="client">The client chooses</option>
                </select>
                {/*
                  * THE FIELD ITSELF, EITHER WAY.
                  *
                  * Choosing "the client chooses" used to print the sentence "a
                  * field on the booking form" — a description of a thing,
                  * standing where the thing could have stood. A studio deciding
                  * what to ask a stranger should see what the stranger sees, at
                  * the moment it decides, not read a promise about it.
                  *
                  * So the control is drawn both ways: live when the studio is
                  * setting the value, and inert when the client will. And it is
                  * not a mock of the client's field — VariableField IS the
                  * component the public booking page renders, so a shape that
                  * looks right here cannot look different there.
                  *
                  * That component exists because four surfaces once carried
                  * their own `kind === 'number' && …` ladder over the same
                  * shapes, and two of them already disagreed about what a
                  * boolean was. This form was quietly the fifth, ten branches
                  * long, and I edited it all day without noticing.
                  */}
                <VariableField
                  kind={v.kind}
                  value={who === 'client' ? '' : current}
                  onChange={(next) => setVariable(v.id, Array.isArray(next) ? next.join(',') : next)}
                  options={v.options || []}
                  unit={v.unit}
                  min={v.min}
                  max={v.max}
                  // Inert, not absent: a client fills this in, so the studio
                  // reads it rather than answers it.
                  disabled={isPending || who !== 'studio'}
                  emptyLabel={who === 'client' ? 'The client fills this in' : '—'}
                />
                {who === 'studio' && current !== '' && (
                  <button type="button" className="q-btn q-btn-secondary q-btn-xs" disabled={isPending}
                    onClick={() => setVariable(v.id, '')}>Clear</button>
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

        {/*
          * The same box, and here the caller keeps its own chips.
          *
          * PickMany owns the chips it draws; a promise is not a chip. It is a
          * tile with a quantity and whatever spec the output defines, so the
          * chips are already rendered above and all that is wanted is the box —
          * which is exactly what PickToAdd is for and says it is for.
          *
          * "All outputs produced by this service have been promised" was a dead
          * end that stated a limit and offered no way past it. Typing past the
          * list is the way past it, and because declareServiceDeliverable finds
          * or creates by name within the domain, typing the name of an output
          * the studio already has attaches that one rather than making a second
          * with the same name.
          */}
        <PickToAdd
          options={suggested.map((d: any) => d.name)}
          placeholder="Choose or type an output"
          onAdd={(name) => {
            const hit = produces.find((d: any) => d.name.trim().toLowerCase() === name.trim().toLowerCase());
            if (hit) addPromise(s.id, hit.id);
            // Onto the service, so every package of it can promise one too.
            else declareOutput(s.id, name);
          }}
        />
      </div>
    );
  };

  /** The production sequences to run for this bundled service. */


  return (
    <div className="q-stack q-stack-lg">
      <div className="q-card q-section q-rise">
        <h2 className="q-section-title">{heading(1, "Package Identity")}</h2>
        <div className="q-stack q-stack-md">
          {/* First, because for a photography studio the picture is half of what
              a package is — and because two packages of one service are told
              apart on a card by almost nothing else. */}
          {coverUrl !== undefined && (
            <div className="q-field">
              <label className="q-label">Cover</label>
              <ImageUpload
                url={coverUrl || null}
                folder="packages"
                label="cover"
                // Twice the widest a cover is ever drawn, which is as much as
                // the densest display can resolve.
                maxEdge={2400}
                onUploaded={(u) => applyCover(u)}
                onCleared={() => applyCover(null)}
                position={coverPosition}
                onPositionChange={applyCoverPosition}
              />
              {coverProblem && <span className="q-meta-sm q-text-danger">{coverProblem}</span>}
              {mode === 'edit' && <span className="q-meta-sm">Saved as soon as it is chosen.</span>}
            </div>
          )}
          <div className="q-field">
            <label className="q-label">Name</label>
            <input className="q-input" value={effectiveName}
              onFocus={() => { if (!nameTouched) setName(composed); }}
              onChange={(e) => { setNameTouched(true); setName(e.target.value); }} />
            <span className="q-meta-sm">{nameTouched ? 'Your own name.' : 'Composed from what you bundled below — type here to give it a name of your own.'}</span>
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

      <div className="q-card q-section q-rise">
        <h2 className="q-section-title">{heading(2, "Services")}</h2>
        <p className="q-meta" style={{ marginBottom: '16px' }}>
          The services this package is built from. Open one to set what it promises, how it is
          classified, what this package fixes about it, and the work it involves.
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
          /*
           * Narrowing this list is CatalogFilter's job, not this form's.
           *
           * The search, the domain select, the count line, the clear, the cap
           * and the "show the other twelve" were all written out again here —
           * the same act the packages and services catalogues do, differing
           * only in that a picker excludes what is already chosen and bounds
           * what it draws. Both of those are what the caller passes in.
           */
          const tagsOf = (s: any) => (s.dimensions || []).flatMap((d: any) => d.values);

          return (
            <div className="q-stack q-stack-lg">
              <div className="q-stack q-stack-sm">
                {chosen.length === 0 ? (
                  <p className="q-empty" style={{ margin: 0 }}>
                    Nothing bundled yet. A package is one or more services sold together, so pick at
                    least one below.
                  </p>
                ) : chosen.map((s) => {
                  const isOpen = openService[s.id] ?? (chosen.length === 1);
                  const domainDims = s.domain?.name ? dimensionsByDomain[s.domain.name] || [] : [];
                  /*
                   * What this package already says about the service, said on
                   * the shut row. Collapsing may hide the controls; it must not
                   * hide the fact that there is something under them, or a
                   * closed row reads as a service nothing has been set on.
                   */
                  const summary = [
                    `${promisesFor(s.id).length} promised`,
                    `${(narrowings[s.id] ?? offeredBy(s.id)).length} classified`,
                    // Counted the way the save counts them: a variable cleared
                    // back to empty is not fixed, and a summary that disagreed
                    // with what gets written would be worse than none.
                    `${allVariables.filter((v) =>
                      v.serviceId === s.id && (variableValues[v.id] ?? '') !== '').length} fixed`,
                  ].join(' · ');

                  return (
                    <div key={s.id} className="q-tile q-stack q-stack-sm">
                      <div className="q-row q-row-between">
                        <button
                          type="button"
                          className="q-disclosure"
                          onClick={() => setOpenService((prev) => ({ ...prev, [s.id]: !isOpen }))}
                          aria-expanded={isOpen}
                        >
                          <span className="q-disclosure-mark" aria-hidden="true" />
                          <span>
                            <span className="q-strong">{s.name}</span>{' '}
                            <span className="q-meta-sm">{s.domain?.name || 'No domain'}</span>
                            {!isOpen && <span className="q-meta-sm"> — {summary}</span>}
                          </span>
                        </button>
                        <button
                          type="button" className="q-btn-ghost q-btn-xs"
                          onClick={() => toggleService(s.id)}
                          title={`Remove ${s.name} from this package`}
                        >
                          Remove
                        </button>
                      </div>

                      {/*
                        * Rendered whether or not it is open, because a height
                        * cannot be animated from a thing that is not there. The
                        * grid row does the opening; `inert` does what unmounting
                        * used to do for everything except the drawing — a folded
                        * service must not still be reachable by tabbing into
                        * fields nobody can see.
                        */}
                      <div className={isOpen ? 'q-fold q-fold-open' : 'q-fold'} inert={!isOpen}>
                        <div className="q-stack q-stack-lg q-tile-sub">
                          <div className="q-stack q-stack-sm">
                            <h4 className="q-strong">Deliverables</h4>
                            {renderPromises(s)}
                          </div>

                          <div className="q-stack q-stack-sm">
                            <h4 className="q-strong">Classifications</h4>
                            {domainDims.length === 0 ? (
                              <p className="q-meta-sm">
                                {s.domain?.name
                                  ? `${s.domain.name} defines no dimensions yet, so there is nothing to classify this by.`
                                  : 'This service has no domain, so it carries no classifications.'}
                              </p>
                            ) : (
                              /*
                                * Stacked, not gridded.
                                *
                                * These sat in q-grid-cards — the grid built for
                                * cards, at 250px minimum with a 24px gutter. Two
                                * dimensions therefore became two columns, and
                                * because one carries a row of chosen chips and
                                * the next does not, their boxes came to rest at
                                * different heights. Nothing was aligned with
                                * anything, and there was no arrangement of a
                                * card grid that would have aligned them: the
                                * fields are different heights by nature.
                                *
                                * A field per row is what the rest of this form
                                * does, and a dimension wants the width anyway —
                                * its chosen values wrap along it.
                                */
                              <div className="q-stack q-stack-md">
                                {domainDims.map((d: any) => renderDimension(
                                  { ...d, domainName: s.domain?.name || '', domainId: s.domain?.id || '' }, s.id))}
                              </div>
                            )}
                          </div>

                          <div className="q-stack q-stack-sm">
                            <h4 className="q-strong">Variables</h4>
                            {renderVariables(s)}
                          </div>

                          <div className="q-stack q-stack-sm">
                            <h4 className="q-strong">Tasks</h4>
                            {!s.workflow?.name && (
                              <p className="q-meta-sm">
                                No workflow defines how {s.name} is produced. Define one in Services to give
                                every package of it the same steps, or add a step below that this package
                                alone involves.
                              </p>
                            )}
                            {renderTasks(s)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/*
                * Only where there is something left to find. Inside a booking
                * the catalogue is already narrowed to the chosen package's own
                * services and every one of them is bundled, so a search box
                * there searches an empty set.
                */}
              {allServices.length > chosen.length && (
                <CatalogFilter
                  items={allServices.filter((s) => !serviceIds.includes(s.id))}
                  noun="service"
                  facetLabel="domain"
                  // Always drawn: below the catalogue's threshold this control
                  // is furniture, but in a form you are here to pick one thing
                  // and the box you type into cannot come and go.
                  threshold={0}
                  // Bounded, because this sits between two fields. The count
                  // held back is stated with a way to open it, so a service you
                  // could not name and could not narrow to is never unreachable.
                  cap={15}
                  read={(s: any) => ({
                    name: s.name,
                    description: s.description,
                    facet: s.domain?.name ?? null,
                    // The classifications are searched but not offered as chips:
                    // a row of every value in the studio, above a list of
                    // fifteen services, is the density this section was just
                    // taken apart for.
                    tags: [],
                  })}
                >
                  {(shown) => (
                    <div className="q-stack q-stack-sm">
                      {shown.map((s: any) => {
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
                    </div>
                  )}
                </CatalogFilter>
              )}

              {allServices.length === 0 && (
                <p className="q-meta-sm">No services yet. A package is built from services, so create one first.</p>
              )}
            </div>
          );
        })()}
      </div>

      {/*
        * WHAT THE PACKAGE PROMISES ALTOGETHER.
        *
        * Each deliverable is set inside the service that produces it, because
        * that is where a quantity means anything — but a package bundling three
        * services then has its whole promise spread across three folds, two of
        * them shut, and the one question a studio most wants answered while
        * building an offer is what the client ends up with.
        *
        * Read-only on purpose. Everything here is set a few inches above, and
        * two places to change one number is how they come to disagree. This
        * counts what is already there, and fills as the services above are
        * filled in.
        */}
      <div className="q-card q-section q-rise">
        <h2 className="q-section-title">{heading(3, 'Deliverables')}</h2>
        {(() => {
          const bundled = allServices.filter((x) => serviceIds.includes(x.id));
          const promised = bundled.flatMap((x) =>
            promisesFor(x.id).map((p) => ({ p, from: x.name })));

          if (bundled.length === 0) {
            return <p className="q-empty">Nothing bundled yet, so nothing is promised yet.</p>;
          }
          if (promised.length === 0) {
            return (
              <p className="q-empty">
                Nothing promised yet. Open a service above and say what the client receives.
              </p>
            );
          }

          return (
            <div className="q-stack q-stack-sm">
              {promised.map(({ p, from }, i) => {
                const def = (allDeliverables as any[]).find((d) => d.id === p.deliverableId);
                const name = def?.name
                  ?? declaredOutputs.find((d) => d.id === p.deliverableId)?.name
                  ?? p.deliverableId;
                return (
                  <div key={`${from}-${p.deliverableId}-${i}`} className="q-row q-row-between q-tile">
                    <span className="q-text-body">
                      <Counted text={formatDeliverable({
                        name,
                        quantity: p.quantity,
                        spec_values: p.specValues || def?.spec_values,
                      } as any)} />
                    </span>
                    {bundled.length > 1 && <span className="q-meta-sm">{from}</span>}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/*
        * THE BOOKING FORM, WHICH IS WHAT THIS ALWAYS WAS.
        *
        * Called "Intake questions", it read as a small extra at the foot of a
        * package. It is not: this is where a studio builds the form a client
        * fills in, and half of that form was being built somewhere else
        * entirely — every variable a package leaves to the client is a field on
        * it, typed, with its own unit and options.
        *
        * Two mechanisms, one idea. They are not merged here — that is a
        * structural change and this is not it — but the studio is shown the
        * whole form in one place rather than being left to work out that the
        * variables it set three sections up are half of what a client will see.
        *
        * The fields from variables are read-only here, and say where they are
        * set. Two places to change one field is how they come to disagree.
        *
        * Only when this form was given the questions — a caller that does not
        * pass them is not editing them, and a form that reports on what it was
        * never given deletes it.
        */}
      {questions !== undefined && (
        <div className="q-card q-section q-rise">
          <h2 className="q-section-title">{heading(4, 'Booking form')}</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            What a client fills in when they book this package.
          </p>

          {(() => {
            const bundled = allServices.filter((x) => serviceIds.includes(x.id));
            const asked = bundled.flatMap((x) =>
              (allVariables.filter((v) => v.serviceId === x.id) as any[])
                .filter((v) => answeredBy[v.id] === 'client')
                .map((v) => ({ v, from: x.name })));

            if (asked.length === 0) return null;
            return (
              <div className="q-stack q-stack-sm" style={{ marginBottom: '20px' }}>
                <span className="q-eyebrow">From the services</span>
                {asked.map(({ v, from }) => (
                  <div key={v.id} className="q-row q-row-between q-tile">
                    <span className="q-meta-plain">{v.label}</span>
                    <span className="q-meta-sm">{bundled.length > 1 ? `${from} · ` : ''}set above</span>
                  </div>
                ))}
              </div>
            );
          })()}

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
