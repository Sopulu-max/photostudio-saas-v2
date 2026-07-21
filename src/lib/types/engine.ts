/**
 * Production Engine Types
 * 
 * These types mirror the database schema exactly.
 * Level 1 immutable primitives + Level 3 configuration.
 */

// ============================================================
// STATUS ENUMS
// ============================================================

export type OrganizationStatus = 'active' | 'suspended' | 'archived';
export type PersonRole = 'configurator' | 'operator' | 'client' | 'vendor' | 'freelancer';
export type PersonStatus = 'active' | 'archived';
export type ResourceStatus = 'available' | 'reserved' | 'in_use' | 'maintenance' | 'retired';
export type IntentStatus = 'created' | 'reviewed' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
export type AgreementStatus = 'proposed' | 'active' | 'modified' | 'completed' | 'cancelled';
export type WorkflowStatus = 'created' | 'in_progress' | 'completed' | 'halted';
export type TaskStatus = 'created' | 'assigned' | 'in_progress' | 'blocked' | 'completed';
export type AssetOrigin = 'produced' | 'provided';
export type AssetStatus = 'registered' | 'available' | 'in_use' | 'retained' | 'released';
export type DeliverableStatus = 'produced' | 'reviewed' | 'delivered' | 'archived';
export type TransactionDirection = 'inbound' | 'outbound';
export type TransactionStatus = 'created' | 'pending' | 'settled' | 'voided';
export type WorkflowTemplateStatus = 'active' | 'retired';
export type ServiceTemplateStatus = 'active' | 'retired';
export type VisualLayoutStatus = 'draft' | 'published';

// ============================================================
// LEVEL 1: IMMUTABLE CORE ENTITIES
// ============================================================

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  status: OrganizationStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  organization_id: string;
  role: PersonRole;
  display_name: string;
  email: string | null;
  phone: string | null;
  status: PersonStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Resource {
  id: string;
  organization_id: string;
  type: string;
  name: string;
  status: ResourceStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Intent {
  id: string;
  organization_id: string;
  person_id: string;
  source: string | null;
  description: string | null;
  service_template_id: string | null;
  status: IntentStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Agreement {
  id: string;
  organization_id: string;
  intent_id: string;
  person_id: string;
  version: number;
  terms: Record<string, unknown>;
  status: AgreementStatus;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workflow {
  id: string;
  organization_id: string;
  agreement_id: string;
  template_id: string | null;
  status: WorkflowStatus;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  workflow_id: string;
  stage_name: string;
  stage_order: number;
  assigned_person_id: string | null;
  status: TaskStatus;
  due_date: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  organization_id: string;
  workflow_id: string | null;
  origin: AssetOrigin;
  type: string;
  file_reference: string | null;
  status: AssetStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Deliverable {
  id: string;
  asset_id: string;
  agreement_id: string;
  person_id: string;
  status: DeliverableStatus;
  delivered_at: string | null;
  created_at: string;
}

export interface FinancialTransaction {
  id: string;
  organization_id: string;
  agreement_id: string | null;
  person_id: string | null;
  direction: TransactionDirection;
  type: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  due_date: string | null;
  settled_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// LEVEL 3: CONFIGURATION
// ============================================================

export interface WorkflowStageDefinition {
  name: string;
  order: number;
  description?: string;
  duration_hours?: number;
  requires_approval?: boolean;
  resource_requirements?: Array<{ type: string; quantity: number }>;
  role_requirements?: Array<{ role: string; count: number }>;
}

export interface WorkflowTemplate {
  id: string;
  organization_id: string;
  name: string;
  stages: WorkflowStageDefinition[];
  status: WorkflowTemplateStatus;
  created_at: string;
  updated_at: string;
}

export interface ServiceTemplate {
  id: string;
  organization_id: string;
  name: string;
  default_workflow_template_id: string | null;
  pricing: {
    base_price?: number;
    currency?: string;
    deposit_percentage?: number;
    add_ons?: Array<{ name: string; price: number }>;
  };
  resource_requirements: Record<string, unknown>;
  role_requirements: Record<string, unknown>;
  deliverable_spec: Record<string, unknown>;
  form_schema: any[];
  status: ServiceTemplateStatus;
  created_at: string;
  updated_at: string;
}

export interface VisualLayout {
  id: string;
  organization_id: string;
  context: string;
  name: string | null;
  layout_data: Record<string, unknown>;
  status: VisualLayoutStatus;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}
