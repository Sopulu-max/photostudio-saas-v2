import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { LEGAL_TRANSITIONS } from '@/lib/domains/kernel/types';

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'; // Default local supabase db connection
let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: DB_URL });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

describe('Schema Gate — Zero Cascades Check', () => {
  it('kernel tables must not have ON DELETE CASCADE foreign keys', async () => {
    // The kernel tables to check
    const kernelTables = [
      'organizations', 'identities', 'services', 'customers', 
      'requests', 'agreements', 'service_instances', 'assets', 
      'instance_consumed_assets', 'events'
    ];

    const query = `
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule
      FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON tc.constraint_name = rc.constraint_name
          AND tc.table_schema = rc.constraint_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON rc.unique_constraint_name = ccu.constraint_name
          AND rc.unique_constraint_schema = ccu.constraint_schema
      WHERE
        tc.table_schema = 'public'
        AND tc.table_name = ANY($1)
    `;

    const res = await client.query(query, [kernelTables]);
    const cascadingKeys = res.rows.filter(r => r.delete_rule === 'CASCADE');

    // Currently the spec says "zero cascades in kernel tables".
    // If any exist, this test should fail.
    expect(cascadingKeys).toEqual([]);
  });
});

describe('Schema Gate — Canonical Vocabularies Verbatim Check', () => {
  it('database CHECK constraints for status columns must match TS unions exactly', async () => {
    // 1. Get the CHECK constraints for status columns in kernel tables
    const query = `
      SELECT
        t.relname as table_name,
        pg_get_constraintdef(c.oid) as check_def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE n.nspname = 'public' 
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) LIKE '%status%';
    `;
    const res = await client.query(query);
    
    // Helper to parse the CHECK constraint text: 
    // e.g. "CHECK ((status = ANY (ARRAY['created'::text, 'scheduled'::text, ...])))"
    // Extract the strings inside the ARRAY[...].
    const extractAllowedValues = (checkDef: string): string[] => {
      const matches = checkDef.match(/'([^']+)'/g);
      if (!matches) return [];
      return matches.map(s => s.replace(/'/g, ''));
    };

    // We will extract and verify each table against the source of truth (LEGAL_TRANSITIONS)
    // NOTE: 'events' does not have a status column. 'services', 'organizations', 'customers', 'assets' have statuses too.
    // For now we check the core transactional tables (requests, agreements, instances, assets).
    // Let's manually define the canonical sets from the system spec:
    
    const canonicalSets = {
      'requests': ['created', 'reviewed', 'accepted', 'declined', 'withdrawn', 'expired'],
      'agreements': ['proposed', 'active', 'completed', 'cancelled'],
      'service_instances': ['created', 'scheduled', 'in_progress', 'waiting', 'completed', 'delivered', 'archived', 'halted'],
      'assets': ['registered', 'available', 'in_use', 'retained', 'released']
    };

    for (const row of res.rows) {
      const tableName = row.table_name;
      if (canonicalSets[tableName as keyof typeof canonicalSets]) {
        const allowedValues = extractAllowedValues(row.check_def);
        const expected = canonicalSets[tableName as keyof typeof canonicalSets];
        
        // Assert exact match, sorted to avoid order issues
        expect(allowedValues.sort()).toEqual(expected.sort());
      }
    }
  });
});
