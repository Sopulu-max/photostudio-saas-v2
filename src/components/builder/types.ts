import React from 'react';

export type BuilderContext = 'service:new' | 'service:edit' | 'identity' | 'storefront';

// A property field schema for the sidebar editor
export type FieldSchema = {
  name: string; // the key in the data object
  label: string;
  type: 'text' | 'textarea' | 'number' | 'color' | 'select' | 'boolean';
  options?: { label: string; value: string }[];
  defaultValue?: any;
};

// A block definition
export interface BlockDefinition {
  type: string;
  label: string;
  icon: React.ReactNode;
  allowedContexts: BuilderContext[] | 'all';
  fields: FieldSchema[];
  renderCanvas: (props: { data: any }) => React.ReactNode;
  defaultData: any;
}

// A block instance in the canvas
export interface BlockInstance {
  id: string; // unique instance id (e.g. uuid or timestamp)
  type: string; // references BlockDefinition.type
  data: any; // the actual data for this instance
}
