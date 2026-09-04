import { getPackage, getIntakeQuestions, getLockedQuestionIds } from '@/modules/packages/interface';
import {
  listActiveServices, listDimensionsByDomain,
  listVariablesForServices, listVariablesForDimensions,
} from '@/modules/services/interface';
import { listDeliverables, listVariablesForDeliverables } from '@/modules/deliverables/interface';
import { listRoles } from '@/modules/team/interface';
import { getStudioCurrency } from '@/kernel/organizations';

/**
 * WHAT THE PACKAGE EDITOR NEEDS, SAID ONCE.
 *
 * PackageFieldsEditor is the one screen in this app that can say what a package
 * IS — what it bundles, what it promises, what it fixes and what it leaves
 * open, how it is classified. Three places render it, and each used to assemble
 * its catalogues itself: three copies of the same eight loads, three chances
 * for one of them to quietly drift.
 *
 * It matters more than tidiness. The editor is only as complete as the
 * catalogues it is handed — a host that forgot deliverableVariables would show
 * an editor that silently could not ask about an album's cover material, and
 * nothing would look wrong. So the list of what it needs belongs next to the
 * editor, not in whoever happens to be rendering it.
 */
export async function loadPackageEditorCatalogs() {
  const [allServices, roles, currencyCode, allDeliverables, dimensionsByDomain] = await Promise.all([
    listActiveServices(), listRoles(), getStudioCurrency(), listDeliverables(), listDimensionsByDomain(),
  ]);

  const serviceVariables = (await listVariablesForServices(allServices.map((s: any) => s.id)))
    .map((v: any) => ({
      ...v,
      serviceName: (allServices as any[]).find((s) => s.id === v.serviceId)?.name || 'Service',
    }));

  /*
   * What the studio's questions say follows from their answers, and what the
   * deliverables themselves need settling.
   *
   * Loaded for EVERY dimension and EVERY deliverable rather than only the ones
   * in play: which apply depends on what the operator bundles, and that changes
   * while the form is open.
   */
  const [dimensionVariables, deliverableVariables] = await Promise.all([
    listVariablesForDimensions(Object.values(dimensionsByDomain).flat().map((d: any) => d.id)),
    listVariablesForDeliverables((allDeliverables as any[]).map((d) => d.id)),
  ]);

  return {
    allServices,
    allDeliverables,
    dimensionsByDomain,
    currencyCode,
    roleOptions: (roles as any[]).map((r) => r.name),
    allVariables: [...serviceVariables, ...dimensionVariables, ...deliverableVariables],
  };
}

/**
 * A package as the editor's `initial`.
 *
 * Reading a package back into the shape that made it is fiddly and easy to get
 * subtly wrong — deliverables and narrowings are both held ON the bundled
 * services rather than on the package, so both have to be flattened back out
 * with the service each came from. Omitting `price` here is what once opened
 * every package with an empty price box and let Save write that blank over the
 * real figure, which is the class of mistake this function exists to make
 * impossible to repeat per-host.
 */
export function packageEditorInitial(pkg: any) {
  const services = (pkg.services || []) as any[];
  return {
    name: pkg.name,
    description: pkg.description,
    price: pkg.price,
    coverUrl: pkg.cover_url ?? null,
    coverPosition: pkg.cover_position ?? null,
    durationMinutes: pkg.duration_minutes,
    serviceIds: services.map((s) => s.id),
    deliverables: services.flatMap((s) =>
      ((s.deliverables || []) as any[]).map((d) => ({
        serviceId: s.id as string, deliverableId: d.id as string,
        quantity: d.quantity ?? null, unit: d.unit ?? null, spec: d.spec ?? null,
      }))),
    narrowings: services.flatMap((s) =>
      ((s.narrowedTo || []) as { values: { id: string }[] }[])
        .flatMap((d) => d.values.map((v) => ({ serviceId: s.id as string, valueId: v.id })))),
    extraStages: ((pkg.extra_stages || []) as any[]).map((s) => ({
      name: s.name, roleName: s.roleName || '', frontStage: s.front_stage ?? true,
    })),
    variableValues: ((pkg.variableValues || []) as any[]).map((v) => ({
      serviceVariableId: v.serviceVariableId,
      value: v.value,
      answeredBy: v.answeredBy,
    })),
    tasks: services.flatMap((s) =>
      ((s.tasks || []) as any[]).map((t) => ({
        serviceId: s.id as string,
        taskId: t.id as string,
        workflowTaskId: t.workflowTaskId as string,
        name: t.name as string,
        roleId: t.roleId as string | null,
        roleName: t.roleName as string | null,
        isActive: t.isActive as boolean,
      }))),
    services,
  };
}

/**
 * One package, ready to edit: the row, what it asks at booking, and which of
 * those answers are already locked in because a booking has been taken on them.
 *
 * Plus, when this package is a booking's own instance of a catalogue one, what
 * it is an instance OF — by name, and by the services that catalogue package
 * bundles. The editor uses the first to decide whether it is ANSWERING a
 * package or DEFINING one, and the second as the baseline a departure is
 * measured against. The row records `instance_of` as an id and nothing more, so
 * without this every instance would open as though it were bespoke: the whole
 * editor asking what the package is, when the answer is "Standard Event
 * Coverage, and you already know that".
 */
export async function loadPackageForEditor(packageId: string) {
  const [pkg, questions, lockedQuestionIds] = await Promise.all([
    getPackage(packageId),
    getIntakeQuestions(packageId),
    getLockedQuestionIds(packageId),
  ]);
  if (!pkg) return null;

  let derivedFrom: string | null = null;
  let derivedServiceIds: string[] = [];
  const parentId = (pkg as any).instance_of as string | null;
  if (parentId) {
    // Its own read, and a failure here is not fatal: an instance whose
    // catalogue package has since been deleted is still perfectly editable —
    // it just has nothing left to be measured against.
    const parent = await getPackage(parentId).catch(() => null);
    if (parent) {
      derivedFrom = parent.name as string;
      derivedServiceIds = (((parent as any).services || []) as any[]).map((s) => s.id);
    }
  }

  return {
    pkg, questions, lockedQuestionIds,
    initial: packageEditorInitial(pkg),
    derivedFrom, derivedServiceIds,
  };
}
