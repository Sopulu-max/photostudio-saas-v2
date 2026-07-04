import React from 'react';
import styles from './ontology.module.css';
import { RequestState, AgreementState, InstanceState, AssetState, OrganizationState, CustomerState, ServiceState } from '@/lib/domains/kernel/types';

// Strict union derived exclusively from the Kernel Specification.
export type KernelState = RequestState | AgreementState | InstanceState | AssetState | OrganizationState | CustomerState | ServiceState | 'cancelled' | 'halted';

interface StateBadgeProps {
  state: KernelState;
  // The display register mapping (e.g. mapping "proposed" -> "draft").
  label?: string; 
}

/**
 * The Universal State Grammar.
 * Only accepts canonical states. Register-mapped words are passed as `label`.
 */
export function StateBadge({ state, label }: StateBadgeProps) {
  let stateClass = styles.neutral;
  let defaultLabel = state.replace('_', ' ');

  switch (state) {
    case 'waiting':
      stateClass = styles.waiting;
      break;
    case 'in_progress':
    case 'active':
      stateClass = styles.active;
      break;
    case 'halted':
    case 'cancelled':
      stateClass = styles.halted;
      break;
    case 'completed':
    case 'delivered':
    case 'archived':
      stateClass = styles.success;
      break;
    case 'created':
    case 'scheduled':
    case 'proposed':
      stateClass = styles.neutral; 
      break;
  }

  return (
    <span className={`${styles.badge} ${stateClass}`}>
      {label || defaultLabel}
    </span>
  );
}
