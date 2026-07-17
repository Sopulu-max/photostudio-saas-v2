'use server';

import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { Asset, AssetOrigin, AssetStatus, Deliverable, DeliverableStatus } from '../types/engine';

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
  status: AssetStatus,
  actorId: string
) {
  const { data: asset, error } = await supabaseAdmin
    .from('assets')
    .update({ status })
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
    payload: { status }
  });

  return asset as Asset;
}

export async function createDeliverable(params: {
  organizationId: string;
  assetId: string;
  agreementId: string;
  personId: string; // The Recipient
  actorId: string; // The Operator/Configurator delivering it
}) {
  const { data: deliverable, error } = await supabaseAdmin
    .from('deliverables')
    .insert({
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
  status: DeliverableStatus,
  actorId: string
) {
  const updateData: any = { status };
  if (status === 'delivered') {
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
    payload: { status }
  });

  return deliverable as Deliverable;
}
