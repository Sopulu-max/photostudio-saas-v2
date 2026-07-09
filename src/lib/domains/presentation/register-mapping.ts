import { FacingConfig } from './types';

// Default mappings from internal state machine states to customer-facing vernacular
const DEFAULT_MAPPINGS: Record<string, string> = {
  // ServiceInstance states
  'in_progress': 'In Production',
  'completed': 'Ready for Delivery',
  'cancelled': 'Cancelled',
  
  // Request states
  'pending': 'Under Review',
  'accepted': 'Accepted',
  'declined': 'Declined',
  
  // Agreement states
  'proposed': 'Awaiting Signature',
  'active': 'Active',
  'fulfilled': 'Fulfilled',
  
  // Outcome states
  'draft': 'Draft',
  'delivered': 'Delivered'
};

export function getCustomerFacingStateName(internalState: string, facingConfig?: FacingConfig): string {
  // If the studio configured a custom label for this specific state, use it
  if (facingConfig && facingConfig[`state.${internalState}.label`]) {
    return facingConfig[`state.${internalState}.label`] as string;
  }
  
  return DEFAULT_MAPPINGS[internalState] || internalState;
}

/**
 * Maps a canonical kernel term (like 'ServiceInstance') to the studio's preferred term (like 'Booking').
 */
export function getVocabularyTerm(canonicalTerm: string, facingConfig?: FacingConfig): string {
  if (facingConfig && facingConfig.vocabulary && facingConfig.vocabulary[canonicalTerm]) {
    return facingConfig.vocabulary[canonicalTerm];
  }
  return canonicalTerm;
}
