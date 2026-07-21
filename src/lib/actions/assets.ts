'use server';

import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { Asset, AssetOrigin, AssetStatus, Deliverable, DeliverableStatus } from '../types/engine';

// Valid state machine transitions for Asset
const ASSET_TRANSITIONS: Record<string, AssetStatus[]> = {
  registered: ['available'],
  available:  ['in_use', 'retained'],
  in_use:     ['available', 'retained'],
  retained:   ['released'],
  released:   [], // Terminal state
};

// Valid state machine transitions for Deliverable
const DELIVERABLE_TRANSITIONS: Record<string, DeliverableStatus[]> = {
  produced:  ['reviewed', 'delivered'],
  reviewed:  ['delivered', 'produced'], // Can revert to produced if revisions requested
  delivered: ['archived'],
  archived:  [], // Terminal state
};

export async function registerAsset(params: {
  organizationId: string;
  workflowId?: string;
  origin: AssetOrigin;
  type: string;
  fileReference: string;
  actorId: string;
}) {
  const { data: asset, error } = await supabaseAdmin
    .from('assets')
    .insert({
      organization_id: params.organizationId,
      workflow_id: params.workflowId || null,
      origin: params.origin,
      type: params.type,
      file_reference: params.fileReference,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to register asset:', error);
    throw new Error('Failed to register asset');
  }

  await logEvent({
    organizationId: params.organizationId,
    entityType: 'asset',
    entityId: asset.id,
    action: 'registered',
    actorId: params.actorId,
    payload: { origin: params.origin, type: params.type }
  });

  return asset as Asset;
}

export async function updateAssetStatus(
  assetId: string,
  organizationId: string,
  newStatus: AssetStatus,
  actorId: string
) {
  // STATE MACHINE GUARD
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('assets')
    .select('status')
    .eq('id', assetId)
    .eq('organization_id', organizationId)
    .single();

  if (fetchError || !current) {
    throw new Error('Asset not found');
  }

  const allowedTransitions = ASSET_TRANSITIONS[current.status] || [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Illegal asset state transition: '${current.status}' → '${newStatus}'. Allowed: [${allowedTransitions.join(', ')}]`
    );
  }

  const { data: asset, error } = await supabaseAdmin
    .from('assets')
    .update({ status: newStatus })
    .eq('id', assetId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update asset status:', error);
    throw new Error('Failed to update asset status');
  }

  await logEvent({
    organizationId,
    entityType: 'asset',
    entityId: asset.id,
    action: 'status_updated',
    actorId,
    payload: { from: current.status, to: newStatus }
  });

  return asset as Asset;
}

export async function createDeliverable(params: {
  organizationId: string;
  assetId: string;
  agreementId: string;
  personId: string;
  actorId: string;
}) {
  const { data: deliverable, error } = await supabaseAdmin
    .from('deliverables')
    .insert({
      organization_id: params.organizationId, // FIX: was missing
      asset_id: params.assetId,
      agreement_id: params.agreementId,
      person_id: params.personId,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create deliverable:', error);
    throw new Error('Failed to create deliverable');
  }

  await logEvent({
    organizationId: params.organizationId,
    entityType: 'deliverable',
    entityId: deliverable.id,
    action: 'created',
    actorId: params.actorId,
    payload: { assetId: params.assetId, agreementId: params.agreementId }
  });

  return deliverable as Deliverable;
}

export async function updateDeliverableStatus(
  deliverableId: string,
  organizationId: string,
  newStatus: DeliverableStatus,
  actorId: string
) {
  // STATE MACHINE GUARD
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('deliverables')
    .select('status')
    .eq('id', deliverableId)
    .single();

  if (fetchError || !current) {
    throw new Error('Deliverable not found');
  }

  const allowedTransitions = DELIVERABLE_TRANSITIONS[current.status] || [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Illegal deliverable state transition: '${current.status}' → '${newStatus}'. Allowed: [${allowedTransitions.join(', ')}]`
    );
  }

  const updateData: any = { status: newStatus };
  if (newStatus === 'delivered') {
    updateData.delivered_at = new Date().toISOString();
  }

  const { data: deliverable, error } = await supabaseAdmin
    .from('deliverables')
    .update(updateData)
    .eq('id', deliverableId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update deliverable status:', error);
    throw new Error('Failed to update deliverable status');
  }

  await logEvent({
    organizationId,
    entityType: 'deliverable',
    entityId: deliverable.id,
    action: 'status_updated',
    actorId,
    payload: { from: current.status, to: newStatus }
  });

  return deliverable as Deliverable;
}
