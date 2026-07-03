"use client";

import React, { useState } from 'react';
import styles from './ontology.module.css';

interface MemoryDrawerProps {
  children: React.ReactNode;
  label?: string;
  defaultExpanded?: boolean;
}

export function MemoryDrawer({ children, label = 'View Lineage', defaultExpanded = false }: MemoryDrawerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={styles.memoryDrawer}>
      <button 
        onClick={() => setExpanded(!expanded)} 
        className={styles.memoryDrawerTrigger}
        aria-expanded={expanded}
      >
        <span className={styles.memoryDrawerIcon} style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          ▸
        </span>
        <span className={styles.memoryDrawerLabel}>{label}</span>
      </button>
      {expanded && (
        <div className={styles.memoryDrawerContent}>
          {children}
        </div>
      )}
    </div>
  );
}
