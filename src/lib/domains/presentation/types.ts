// --- Audiences ---
export type AudienceRole = 'staff' | 'customer' | 'partner_org' | 'public';

export interface AudienceContext {
  role: AudienceRole;
  /**
   * The ID of the current audience if they are known.
   * For staff, this is their user/staff ID.
   * For customers, this is their CustomerDTO.id.
   * For partner_orgs, this is their OrganizationDTO.id.
   * For public, this is null.
   */
  id: string | null;
}

// --- Facing Tiers (The F1/F2 Laws) ---
/**
 * F1 — Never external. Hard drop for non-staff.
 * Examples: internal notes, margins, upstream B2B costs.
 */
export const TIER_NEVER_EXTERNAL = 'never_external';

/**
 * F2 — Always visible to counterparty. 
 * Examples: Customer's own agreement terms, payments, outcome status.
 */
export const TIER_COUNTERPARTY_GUARANTEED = 'counterparty_guaranteed';

/**
 * Studio may expose; default hidden.
 * Examples: public pricing, progress granularity, availability.
 */
export const TIER_CONFIGURABLE_CLOSED = 'configurable_closed';

/**
 * Studio may hide; default shown.
 * Examples: Identity, service catalog, public contact details.
 */
export const TIER_CONFIGURABLE_OPEN = 'configurable_open';

export type FacingTier = 
  | typeof TIER_NEVER_EXTERNAL
  | typeof TIER_COUNTERPARTY_GUARANTEED
  | typeof TIER_CONFIGURABLE_CLOSED
  | typeof TIER_CONFIGURABLE_OPEN;

// --- Facing Configuration ---
/**
 * Represents the studio's choices for the configurable tiers on specific entity properties.
 */
export interface FacingConfig {
  /**
   * Keys match AttributeSchema.key (e.g., "pricingRules.basePrice").
   * Values: true (exposed), false (hidden).
   */
  [attributePath: string]: boolean | any;
  
  /**
   * Configurable overrides for mapping internal state names to customer-facing copy.
   */
  stateOverrides?: Record<string, string>;
  
  /**
   * Whether the studio has enabled their public portfolio.
   */
  portfolioEnabled?: boolean;

  /**
   * Vocabulary Register: mapping of canonical terms to studio terms.
   * e.g., { "ServiceInstance": "Booking", "Customer": "Client" }
   */
  vocabulary?: Record<string, string>;

  /**
   * Layout/Arrangement (Stage 3): semantic composition overrides.
   * e.g., { "service_page": { sections: [{ id: "hero", variant: "bold" }, ...] } }
   */
  layout?: Record<string, any>;
}

// --- Builder Engine (Component Contracts) ---
export interface ComponentContract {
  /** The id/name of the component, e.g., 'PricingBlock' */
  id: string;
  
  /** The entity or relationships this component can bind to, e.g., ['Service.Pricing'] */
  bindsTo: string[];
  
  /** The visual variants supported by this component, e.g., ['list', 'cards'] */
  variants?: string[];
  
  /** Descriptive name for the palette UI */
  label: string;
}
