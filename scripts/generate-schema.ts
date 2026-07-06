import fs from 'fs';
import path from 'path';
import { LEGAL_TRANSITIONS, NON_STATUS_EVENTS } from '../src/lib/domains/kernel/types';

// The 7 status-bearing tables mapped from LEGAL_TRANSITIONS
const TABLES = Object.keys(LEGAL_TRANSITIONS);

function generateCheckConstraints(): string {
  let sql = `-- ==========================================\n`;
  sql += `-- AUTOMATICALLY GENERATED CHECK CONSTRAINTS\n`;
  sql += `-- ==========================================\n\n`;

  for (const table of TABLES) {
    const states = Object.keys(LEGAL_TRANSITIONS[table as keyof typeof LEGAL_TRANSITIONS]);
    const statesList = states.map(s => `'${s}'`).join(', ');
    
    // We add the constraint
    sql += `ALTER TABLE public.${table} DROP CONSTRAINT IF EXISTS chk_${table}_status;\n`;
    sql += `ALTER TABLE public.${table} ADD CONSTRAINT chk_${table}_status CHECK (status IN (${statesList}));\n\n`;
  }
  return sql;
}

function generateTrigger(): string {
  let sql = `-- ==========================================\n`;
  sql += `-- AUTOMATICALLY GENERATED TRIGGER LOGIC\n`;
  sql += `-- ==========================================\n\n`;

  sql += `CREATE OR REPLACE FUNCTION public.update_entity_status_from_event()\n`;
  sql += `RETURNS TRIGGER AS $$\n`;
  sql += `DECLARE\n`;
  sql += `    new_status text;\n`;
  sql += `BEGIN\n`;
  sql += `    -- Extract the status from event_type (e.g. "agreement.active" -> "active")\n`;
  sql += `    new_status := split_part(new.event_type, '.', 2);\n\n`;

  sql += `    -- Bypass events that are purely observational and don't change status\n`;
  
  const nonStatusArr = Array.from(NON_STATUS_EVENTS).map(e => `'${e}'`).join(', ');
  sql += `    IF new.event_type IN (${nonStatusArr}) THEN\n`;
  sql += `        RETURN new;\n`;
  sql += `    END IF;\n\n`;

  sql += `    -- Validate and apply based on canonical unions\n`;

  let first = true;
  for (const table of TABLES) {
    // Map table name to singular entity type
    let entityType = table.endsWith('s') ? table.slice(0, -1) : table;
    
    const states = Object.keys(LEGAL_TRANSITIONS[table as keyof typeof LEGAL_TRANSITIONS]);
    const statesList = states.map(s => `'${s}'`).join(', ');

    if (first) {
      sql += `    IF new.entity_type = '${entityType}' AND new_status IN (${statesList}) THEN\n`;
      first = false;
    } else {
      sql += `    ELSIF new.entity_type = '${entityType}' AND new_status IN (${statesList}) THEN\n`;
    }
    sql += `        UPDATE public.${table} SET status = new_status WHERE id = new.entity_id;\n`;
  }
  
  if (!first) {
    sql += `    END IF;\n\n`;
  }

  sql += `    RETURN new;\n`;
  sql += `END;\n`;
  sql += `$$ LANGUAGE plpgsql SECURITY DEFINER;\n\n`;

  sql += `DROP TRIGGER IF EXISTS trigger_update_status_from_event ON public.events;\n`;
  sql += `CREATE TRIGGER trigger_update_status_from_event\n`;
  sql += `AFTER INSERT ON public.events\n`;
  sql += `FOR EACH ROW\n`;
  sql += `EXECUTE FUNCTION public.update_entity_status_from_event();\n`;

  return sql;
}

export function generateSchemaMigration(): string {
  let sql = `-- Migration: Regenerated State Machine\n`;
  sql += `-- This migration is automatically generated from src/lib/domains/kernel/types.ts\n`;
  sql += `-- DO NOT EDIT MANUALLY\n\n`;

  sql += generateCheckConstraints();
  sql += generateTrigger();

  return sql;
}

function getLatestMigrationFile(): string | null {
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('_regenerated_state_machine.sql'));
  if (files.length === 0) return null;
  return path.join(migrationsDir, files[files.length - 1]);
}

function writeMigration() {
  const sql = generateSchemaMigration();
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const existingFile = getLatestMigrationFile();
  
  let filename = `${timestamp}_regenerated_state_machine.sql`;
  if (existingFile) {
    const existingContent = fs.readFileSync(existingFile, 'utf8');
    if (existingContent === sql) {
      console.log('Schema is up to date.');
      return;
    }
    filename = path.basename(existingFile);
  }
  
  fs.writeFileSync(path.join(migrationsDir, filename), sql);
  console.log(`Generated migration: ${filename}`);
}

function checkDrift() {
  const sql = generateSchemaMigration();
  const existingFile = getLatestMigrationFile();
  
  if (!existingFile) {
    console.error('No regenerated state machine migration found. Please run generation script.');
    process.exit(1);
  }
  
  const existingContent = fs.readFileSync(existingFile, 'utf8');
  if (existingContent !== sql) {
    console.error('SCHEMA DRIFT DETECTED: The generated state machine differs from the latest migration.');
    console.error('Run `npm run generate:schema` to update the migration.');
    process.exit(1);
  }
  
  console.log('Schema drift check passed.');
}

const isCheck = process.argv.includes('--check');

if (isCheck) {
  checkDrift();
} else {
  writeMigration();
}
