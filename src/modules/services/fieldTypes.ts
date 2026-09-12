/**
 * Intake question types — the bounded vocabulary of what a studio can ask.
 *
 * This is the "properly handled" guarantee. A question type is not a label: it
 * has six responsibilities, and a type is half-built if any is missing. They all
 * live here, so adding a type means filling in six slots in ONE file and it then
 * works on the public form, in validation, and on the booking.
 *
 *   1. define   — what the studio configures (options, etc.)
 *   2. capture  — which widget the public form renders
 *   3. validate — checked server-side before a booking is accepted
 *   4. store    — the shape the answer takes in booking metadata
 *   5. display  — how the studio reads it back
 *   6. feed     — whether it could drive anything else (all inert for now)
 *
 * Bounded on purpose: a closed set, asked in one place, answered in one place.
 * Configurable within a vocabulary the module owns — not a canvas.
 */

export type FieldTypeKey =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'choice'
  | 'multichoice'
  | 'boolean'
  | 'url'
  /*
   * Two shapes the print shop needed and every domain gets.
   *
   * `size` — width × height in the variable's unit, chosen from sizes the
   * studio declares. A choice with options like '16x20' could be read out but
   * not drawn or compared, and reading '16x20' as two numbers would have been
   * the inference from a name that 20261020000000 forbids. So it is a shape:
   * one canonical spelling the engine writes, parsed by one module wherever
   * it is read. See sizes.ts.
   *
   * `file` — something the client hands over: the picture to be printed, a
   * brief, a reference. Stored as the path the server put it at, never the
   * bytes. A question only: a package cannot fix a file and a service cannot
   * vary one, so variableTypes leaves it off the list a variable may take.
   */
  | 'size'
  | 'file';

/** A question as the studio configured it. `id` is immutable — answers key off it. */
export type IntakeQuestion = {
  id: string;
  type: FieldTypeKey;
  label: string;
  required?: boolean;
  help?: string;
  /** choice / multichoice only */
  options?: string[];
  /** Optional reference to a bundled service this question specifically belongs to */
  serviceId?: string;
};

export type FieldTypeDef = {
  key: FieldTypeKey;
  label: string;
  hint: string;
  /** does the studio need to supply a list of options? */
  needsOptions: boolean;
  /** the html input type, where the widget is a plain input */
  inputType?: string;
  /** validate a raw submitted value; return an error message or null */
  validate: (value: unknown, q: IntakeQuestion) => string | null;
  /** normalise for storage */
  store: (value: unknown) => unknown;
  /** render an answer as readable text */
  display: (value: unknown) => string;
};

import { normaliseSize, parseSize, describeSize } from './sizes';

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Where the server puts what a visitor hands over: intake/<org>/<file>.
 *
 * The prefix is the whole of what a `file` answer may claim to be. A path
 * anywhere else — another bucket, another studio's folder, a URL — is not
 * something this form issued, and is refused before it is stored.
 */
export const INTAKE_PREFIX = 'intake/';
export const isIntakePath = (v: unknown) =>
  typeof v === 'string' && v.startsWith(INTAKE_PREFIX) && !v.includes('..') && v.length > INTAKE_PREFIX.length + 1;

/** The name a stored path reads back as — the last segment, minus the id the server prefixed. */
const fileNameOf = (path: string) => {
  const last = path.split('/').pop() || path;
  // The server writes <uuid>-<original name>; the id is for uniqueness, not for reading.
  return last.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
};

const requiredCheck = (value: unknown, q: IntakeQuestion) =>
  q.required && isBlank(value) ? `${q.label} is required.` : null;

export const FIELD_TYPES: Record<FieldTypeKey, FieldTypeDef> = {
  text: {
    key: 'text',
    label: 'Short text',
    hint: 'A name, a place, a one-liner',
    needsOptions: false,
    inputType: 'text',
    validate: (v, q) => requiredCheck(v, q),
    store: (v) => (isBlank(v) ? null : String(v).trim()),
    display: (v) => (isBlank(v) ? '—' : String(v)),
  },

  textarea: {
    key: 'textarea',
    label: 'Long text',
    hint: 'A brief, notes, anything wordy',
    needsOptions: false,
    validate: (v, q) => requiredCheck(v, q),
    store: (v) => (isBlank(v) ? null : String(v).trim()),
    display: (v) => (isBlank(v) ? '—' : String(v)),
  },

  number: {
    key: 'number',
    label: 'Number',
    hint: 'Guest count, hours, quantities',
    needsOptions: false,
    inputType: 'number',
    validate: (v, q) => {
      const req = requiredCheck(v, q);
      if (req) return req;
      if (isBlank(v)) return null;
      return Number.isFinite(Number(v)) ? null : `${q.label} should be a number.`;
    },
    store: (v) => (isBlank(v) ? null : Number(v)),
    display: (v) => (isBlank(v) ? '—' : Number(v).toLocaleString()),
  },

  date: {
    key: 'date',
    label: 'Date',
    hint: 'The event date, a deadline',
    needsOptions: false,
    inputType: 'date',
    validate: (v, q) => {
      const req = requiredCheck(v, q);
      if (req) return req;
      if (isBlank(v)) return null;
      return Number.isNaN(new Date(String(v)).getTime()) ? `${q.label} should be a date.` : null;
    },
    store: (v) => (isBlank(v) ? null : String(v)),
    display: (v) => {
      if (isBlank(v)) return '—';
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
    },
  },

  choice: {
    key: 'choice',
    label: 'Pick one',
    hint: 'Indoor or outdoor, a package tier',
    needsOptions: true,
    validate: (v, q) => {
      const req = requiredCheck(v, q);
      if (req) return req;
      if (isBlank(v)) return null;
      return (q.options || []).includes(String(v)) ? null : `${q.label}: that isn't one of the choices.`;
    },
    store: (v) => (isBlank(v) ? null : String(v)),
    display: (v) => (isBlank(v) ? '—' : String(v)),
  },

  multichoice: {
    key: 'multichoice',
    label: 'Pick any',
    hint: 'Extras they might want, styles they like',
    needsOptions: true,
    validate: (v, q) => {
      const arr = Array.isArray(v) ? v : [];
      if (q.required && arr.length === 0) return `${q.label} is required.`;
      const bad = arr.find((x) => !(q.options || []).includes(String(x)));
      return bad ? `${q.label}: "${bad}" isn't one of the choices.` : null;
    },
    store: (v) => (Array.isArray(v) ? v.map(String) : []),
    display: (v) => (Array.isArray(v) && v.length ? v.join(', ') : '—'),
  },

  boolean: {
    key: 'boolean',
    label: 'Yes / no',
    hint: 'Do they need hair and makeup?',
    needsOptions: false,
    validate: (v, q) => (q.required && v !== true && v !== false ? `${q.label} is required.` : null),
    store: (v) => v === true || v === 'true',
    display: (v) => (v === true || v === 'true' ? 'Yes' : v === false || v === 'false' ? 'No' : '—'),
  },

  url: {
    key: 'url',
    label: 'Link',
    hint: 'A moodboard, a reference gallery',
    needsOptions: false,
    inputType: 'url',
    validate: (v, q) => {
      const req = requiredCheck(v, q);
      if (req) return req;
      if (isBlank(v)) return null;
      try {
        const u = new URL(String(v).startsWith('http') ? String(v) : `https://${v}`);
        return u.hostname.includes('.') ? null : `${q.label} should be a web address.`;
      } catch {
        return `${q.label} should be a web address.`;
      }
    },
    store: (v) => {
      if (isBlank(v)) return null;
      const s = String(v).trim();
      return s.startsWith('http') ? s : `https://${s}`;
    },
    display: (v) => (isBlank(v) ? '—' : String(v)),
  },

  size: {
    key: 'size',
    label: 'Size',
    hint: 'A print size, a page format — width × height',
    needsOptions: true,
    validate: (v, q) => {
      const req = requiredCheck(v, q);
      if (req) return req;
      if (isBlank(v)) return null;
      // Compared in canonical form, so '16x20' typed by a client matches the
      // '16×20' the studio declared.
      const chosen = normaliseSize(String(v));
      const declared = (q.options || []).map(normaliseSize);
      if (!declared.includes(chosen)) return `${q.label}: that isn't one of the sizes offered.`;
      return parseSize(chosen) ? null : `${q.label} should be a size like 16×20.`;
    },
    store: (v) => (isBlank(v) ? null : normaliseSize(String(v))),
    display: (v) => (isBlank(v) ? '—' : describeSize(v)),
  },

  file: {
    key: 'file',
    label: 'File',
    hint: 'A picture to print, a brief, a reference',
    needsOptions: false,
    validate: (v, q) => {
      const req = requiredCheck(v, q);
      if (req) return req;
      if (isBlank(v)) return null;
      return isIntakePath(v) ? null : `${q.label}: that file did not upload. Try again.`;
    },
    store: (v) => (isBlank(v) ? null : String(v)),
    display: (v) => (isBlank(v) ? '—' : fileNameOf(String(v))),
  },
};

export const FIELD_TYPE_LIST = Object.values(FIELD_TYPES);

/**
 * A declared option, in the form the engine stores it.
 *
 * Five places write a variable's options and one place must decide what an
 * option looks like once written — otherwise a size typed '16x20' on the
 * deliverable page and '16 × 20' on the service page are two options that
 * mean one thing and compare as different strings. Every kind but size is
 * left as typed, trimmed; empties go.
 */
export function normaliseOptions(kind: string, options: unknown): string[] {
  const list = Array.isArray(options) ? options.map((o) => String(o).trim()).filter(Boolean) : [];
  if (kind !== 'size') return list;
  return [...new Set(list.map(normaliseSize))];
}

export function fieldType(key: string): FieldTypeDef {
  return FIELD_TYPES[key as FieldTypeKey] ?? FIELD_TYPES.text;
}

/**
 * Validate a whole set of answers against a service's questions.
 * Returns a map of question id → error, empty when everything passes.
 */
export function validateAnswers(questions: IntakeQuestion[], answers: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  for (const q of questions) {
    const err = fieldType(q.type).validate(answers?.[q.id], q);
    if (err) errors[q.id] = err;
  }
  return errors;
}

/** Normalise answers for storage, dropping anything not asked. */
export function storeAnswers(questions: IntakeQuestion[], answers: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const q of questions) {
    out[q.id] = fieldType(q.type).store(answers?.[q.id]);
  }
  return out;
}
