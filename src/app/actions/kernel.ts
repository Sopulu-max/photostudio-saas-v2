"use server";

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { getOrgId } from '@/lib/auth';

export async function transitionInstance(instanceId: string, eventSuffix: string, payload: Record<string, unknown> = {}) {
  try {
    const { orgId, ops } = await getOps();
    const success = await ops.transitionInstance(orgId, instanceId, eventSuffix, payload);
    if (success) {
      revalidatePath('/instances');
      revalidatePath('/finance');
      revalidatePath('/specimen');
    }
    return { success };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function recordWorkstepAction(instanceId: string, stepName: string) {
  try {
    const { orgId, ops } = await getOps();
    const success = await ops.recordWorkstep(orgId, instanceId, stepName);
    if (success) {
      revalidatePath('/instances');
    }
    return { success };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function getOps() {
  const orgId = await getOrgId();
  if (!orgId) throw new Error('Not authenticated');
  const supabase = await createClient();
  const repo = new KernelRepository(supabase);
  const { KernelOperations } = await import('@/lib/domains/kernel/operations');
  return { orgId, ops: new KernelOperations(supabase, repo) };
}

export async function submitRequestAction(customerId: string, requestedServices: any) {
  try {
    const { orgId, ops } = await getOps();
    const id = await ops.submitRequest(orgId, customerId, requestedServices);
    revalidatePath('/specimen');
    return { success: true, data: id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resolveRequestAction(reqId: string, action: 'accept' | 'decline' | 'withdraw' | 'expire') {
  try {
    const { orgId, ops } = await getOps();
    await ops.resolveRequest(orgId, reqId, action);
    revalidatePath('/specimen');
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function proposeAgreementAction(customerId: string, requestId: string | null, terms: any) {
  try {
    const { orgId, ops } = await getOps();
    const id = await ops.proposeAgreement(orgId, customerId, requestId, terms);
    revalidatePath('/finance');
    revalidatePath('/specimen');
    return { success: true, data: id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function activateAgreementAction(agrId: string) {
  try {
    const { orgId, ops } = await getOps();
    await ops.activateAgreement(orgId, agrId);
    revalidatePath('/finance');
    revalidatePath('/instances');
    revalidatePath('/specimen');
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function modifyAgreementAction(agrId: string, changes: any) {
  try {
    const { orgId, ops } = await getOps();
    await ops.modifyAgreement(orgId, agrId, changes);
    revalidatePath('/finance');
    revalidatePath('/instances');
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function registerAssetAction(assetData: { customerId: string, instanceId?: string, contentReference: string }) {
  try {
    const { orgId, ops } = await getOps();
    const id = await ops.registerAsset(orgId, assetData);
    revalidatePath('/assets');
    return { success: true, data: id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function produceOutcomeAction(instanceId: string, contentReference: string) {
  try {
    const { orgId, ops } = await getOps();
    const id = await ops.produceOutcome(orgId, instanceId, { contentReference });
    revalidatePath('/assets');
    revalidatePath('/instances');
    return { success: true, data: id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deliverOutcomeAction(assetId: string, usageRights: Record<string, unknown> = {}) {
  try {
    const { orgId, ops } = await getOps();
    await ops.deliverOutcome(orgId, assetId, usageRights);
    revalidatePath('/assets');
    revalidatePath('/instances');
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
