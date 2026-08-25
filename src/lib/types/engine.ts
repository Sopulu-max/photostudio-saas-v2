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
export type ContractStatus = 'proposed' | 'active' | 'modified' | 'completed' | 'cancelled';
export type StageKind = 'enquiry' | 'booked' | 'completed' | 'cancelled';
export type TransactionDirection = 'inbound' | 'outbound';
export type TransactionStatus = 'created' | 'pending' | 'settled' | 'voided';

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

export interface Contract {
  id: string;
  organization_id: string;
  booking_id: string | null;
  contact_id: string;
  version: number;
  terms: Record<string, unknown>;
  status: ContractStatus;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A booking is the spine: one piece of work for a client. It can exist from a
 * title alone and grow; it bundles service lines and everything else (contract,
 * money, work, deliverables) associates to it freely, in any order.
 */
export interface Booking {
  id: string;
  organization_id: string;
  contact_id: string | null;
  title: string;
  stage_id: string;
  scheduled_for: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BookingLine {
  id: string;
  booking_id: string;
  service_template_id: string | null;
  package_service_id: string | null;
  title: string;
  price: Record<string, any>;
  status: string;
  metadata: Record<string, any>;
  current_task_id: string | null;
  created_at: string;
  updated_at: string;
}


export interface FinancialTransaction {
  id: string;
  organization_id: string;
  contract_id: string | null;
  contact_id: string | null;
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


export interface MediaItem {
  url: string;
  alt?: string;
  kind: 'image' | 'video';
}

export interface ServiceDomainLabel {
  id: string;
  organization_id: string;
  service_domain_id: string;
  name: string;
  position: number;
  color: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// SEMANTIC PLANE & COMMERCIAL PLANE (Ontology Types)
// ============================================================

export interface Service {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  service_domain_id: string;
  primary_deliverable_id: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface Package {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  pricing: Record<string, unknown>;
  status: string;
  duration_minutes: number | null;
  price_unit: string | null;
  payment_policy: string | null;
  pricing_variant: string | null;
  extra_stages: any[];
  created_at: string;
  updated_at: string;
}

export interface Deliverable {
  id: string;
  organization_id: string;
  name: string;
  default_unit: string | null;
  spec_schema: Record<string, unknown> | null;
  spec_values: Record<string, unknown> | null;
  created_at: string;
}


// ============================================================
// PRODUCTION PLANE (Physical Assets)
// ============================================================

export interface Asset {
  id: string;
  organization_id: string;
  booking_id: string;
  deliverable_id: string | null;
  produced_by_line_id: string | null;
  derived_from_asset_id: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  state: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DeliveryAsset {
  id: string;
  organization_id: string;
  delivery_id: string;
  asset_id: string;
  position: number;
  created_at: string;
}
