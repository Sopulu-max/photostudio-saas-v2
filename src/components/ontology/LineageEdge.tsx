import React from 'react';
import styles from './ontology.module.css';
import { KernelState } from './StateBadge';

interface LineageEdgeProps {
  status?: KernelState | 'neutral';
  direction?: 'horizontal' | 'vertical';
  length?: number; // length in px
}

export function LineageEdge({ status = 'neutral', direction = 'vertical', length = 24 }: LineageEdgeProps) {
  // Map specific kernel states to their edge visual representation
  const isActive = status === 'active' || status === 'in_progress';
  const isWaiting = status === 'waiting';
  const isHalted = status === 'halted';
  const isSuccess = status === 'completed' || status === 'delivered';

  let edgeClass = styles.edgeNeutral;
  if (isActive) edgeClass = styles.edgeActive;
  if (isWaiting) edgeClass = styles.edgeWaiting;
  if (isHalted) edgeClass = styles.edgeHalted;
  if (isSuccess) edgeClass = styles.edgeSuccess;

  const style: React.CSSProperties = {
    [direction === 'vertical' ? 'height' : 'width']: `${length}px`,
    [direction === 'vertical' ? 'width' : 'height']: '2px',
  };

  return (
    <div className={`${styles.lineageEdge} ${edgeClass} ${styles[direction]}`} style={style} />
  );
}
