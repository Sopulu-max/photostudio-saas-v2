import type { FieldTypeKey } from './fieldTypes';

/**
 * The curated starting-point library — engine-authored, not a database
 * table. Bounded configurability applied to creation itself: this is the
 * closed set of shapes the engine offers, not something a studio edits.
 *
 * These seed SERVICES, not Packages. A Service is what a studio actually
 * knows how to do — Portrait Photography, Album Design — independent of how
 * it gets sold. There is no blank "start from scratch": every Service
 * originates from one of these. What a studio sells (a Package) is built
 * afterward by bundling one or more real Services together and wrapping
 * them in a price — a separate, commercial act, not a template-seeded one.
 *
 * Each template still carries suggested intake questions, even though
 * questions live on the Package, not the Service: when a Package bundles a
 * service, it's a reasonable default to offer that service's typical
 * questions as a starting point for the Package's own form.
 */

export type TemplateQuestion = {
  type: FieldTypeKey;
  label: string;
  required?: boolean;
  help?: string;
  options?: string[];
};

/**
 * A stage in a Service's suggested Process — the routing that answers "who
 * does this cascade to." roleName is Team's own vocabulary (find-or-created
 * on use); frontStage follows Shostack's service-blueprint line of
 * visibility — is the client present for this stage or not.
 */
export type TemplateStage = { name: string; roleName?: string; frontStage: boolean };

export type ServiceTemplate = {
  id: string;
  /** Service Domain — Photography, Videography, Printing. */
  domain: string;
  /** The specific transformation's name — what gets created as the Service. */
  name: string;
  summary: string;
  /** What this transformation directly produces — Deliverables, studio vocabulary. */
  deliverables: string[];
  /** The Service's default Process. */
  blueprint?: { name: string; stages: TemplateStage[] };
  /** Suggested questions a Package bundling this service might ask a client. */
  questions: TemplateQuestion[];
  // Curated hints for the five classification dimensions — only set where the
  // template's own summary/questions already ground it (never invented). Not
  // every template has an opinion on every dimension; picking a Domain
  // aggregates whatever its templates DO know into that Domain's suggestions.
  // The rest of the studio's own tagging fills in what the engine doesn't
  // know yet — this is deliberately partial knowledge, not a claim to cover
  // everything a Domain could mean.
  subjects?: string[];
  occasions?: string[];
  contexts?: string[];
  purposes?: string[];
  clientTypes?: string[];
};

export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  // ── Photography ──────────────────────────────────────────────────────────
  // No "Wedding Photography" here on purpose. A wedding shoot runs the exact
  // same Shoot → Edit → Deliver process as any other event — same roles,
  // same stages. Nothing about the transformation differs; only who's
  // buying and why. That makes "Wedding" an Occasion a studio tags on a
  // Package built from Event Photography, not a Service of its own — the
  // same reasoning that keeps "Birthday Photography" from being one either.
  {
    id: 'portrait-photography',
    domain: 'Photography',
    name: 'Portrait Photography',
    summary: 'A studio portrait session — individual, couple, or family.',
    deliverables: ['Edited photographs'],
    blueprint: {
      name: 'Portrait Photography',
      stages: [
        { name: 'Shoot', roleName: 'Photographer', frontStage: true },
        { name: 'Photo Edit', roleName: 'Photo Editor', frontStage: false },
      ],
    },
    questions: [
      { type: 'choice', label: 'Setting', options: ['In-studio', 'Outdoor', "Client's home"] },
      { type: 'number', label: 'Number of people' },
      { type: 'number', label: 'Number of outfits' },
      { type: 'url', label: 'Moodboard link' },
    ],
    subjects: ['Person'],
    contexts: ['In-studio', 'Outdoor', "Client's home"],
  },
  // Same reasoning for "Maternity" and "Newborn": as actually built, both
  // used the identical generic Photographer role and Shoot → Edit stages as
  // Portrait Photography — no structural difference the model can see, so
  // no separate Service. If a studio's newborn work genuinely needs a
  // specialist, that belongs on a role (a "Newborn Photographer" role on
  // this same Service's blueprint), not a second Service with the same
  // shape. Both fold into Portrait Photography, distinguished by Occasion.
  {
    id: 'event-photography',
    domain: 'Photography',
    name: 'Event Photography',
    summary: 'Coverage for a celebration or gathering — birthdays, weddings, anniversaries, parties. One process; the occasion is what varies.',
    deliverables: ['RAW images', 'Edited photographs'],
    blueprint: {
      name: 'Event Photography',
      stages: [
        { name: 'Shoot', roleName: 'Photographer', frontStage: true },
        { name: 'Photo Edit', roleName: 'Photo Editor', frontStage: false },
        { name: 'Delivery', frontStage: true },
      ],
    },
    questions: [
      { type: 'date', label: 'Event date', required: true },
      { type: 'text', label: 'Venue' },
      { type: 'number', label: 'Guest count' },
      { type: 'boolean', label: 'Second shooter needed?' },
      { type: 'multichoice', label: 'Style preference', options: ['Candid', 'Traditional', 'Editorial'] },
    ],
    subjects: ['Person'],
    occasions: ['Wedding', 'Birthday', 'Anniversary', 'Party'],
  },
  {
    id: 'headshot-photography',
    domain: 'Photography',
    name: 'Headshot Photography',
    summary: 'Professional headshots — the same process whether the sitter is solo or one of a whole team.',
    deliverables: ['Edited photographs'],
    blueprint: {
      name: 'Headshot Photography',
      stages: [
        { name: 'Shoot', roleName: 'Photographer', frontStage: true },
        { name: 'Photo Edit', roleName: 'Photo Editor', frontStage: false },
      ],
    },
    questions: [
      { type: 'number', label: 'Number of people' },
      { type: 'choice', label: 'Background', options: ['Studio backdrop', 'On-location', 'Office'] },
    ],
    subjects: ['Person'],
    contexts: ['In-studio', 'On-location'],
  },
  {
    id: 'product-photography',
    domain: 'Photography',
    name: 'Product Photography',
    summary: 'Commercial product photography for web or print — lighting rigs and still-life technique, no live subject.',
    deliverables: ['Edited photographs'],
    blueprint: {
      name: 'Product Photography',
      stages: [
        { name: 'Shoot', roleName: 'Photographer', frontStage: false },
        { name: 'Photo Edit', roleName: 'Photo Editor', frontStage: false },
      ],
    },
    questions: [
      { type: 'number', label: 'Number of products' },
      { type: 'choice', label: 'Usage', options: ['Web', 'Print', 'Both'] },
      { type: 'url', label: 'Reference or brand guide link' },
    ],
    subjects: ['Product'],
  },
  {
    id: 'passport-photography',
    domain: 'Photography',
    name: 'Passport Photography',
    summary: 'Exact framing, plain background, no expression — genuinely different technical constraints from a portrait session.',
    deliverables: ['Printed photographs'],
    blueprint: {
      name: 'Passport Photography',
      stages: [{ name: 'Shoot & Print', roleName: 'Photographer', frontStage: true }],
    },
    questions: [
      { type: 'text', label: 'Destination country / document type' },
    ],
    subjects: ['Person'],
    purposes: ['Passport'],
  },
  {
    id: 'pet-photography',
    domain: 'Photography',
    name: 'Pet Photography',
    summary: 'A pet portrait session — no posing cooperation, different pacing, its own technique.',
    deliverables: ['Edited photographs'],
    blueprint: {
      name: 'Pet Photography',
      stages: [
        { name: 'Shoot', roleName: 'Photographer', frontStage: true },
        { name: 'Photo Edit', roleName: 'Photo Editor', frontStage: false },
      ],
    },
    questions: [
      { type: 'choice', label: 'Setting', options: ['In-studio', 'Outdoor'] },
      { type: 'number', label: 'Number of pets' },
    ],
    subjects: ['Pet'],
    contexts: ['In-studio', 'Outdoor'],
  },

  // ── Videography ──────────────────────────────────────────────────────────
  // No "Wedding Videography" either, same reasoning as photography.
  {
    id: 'event-videography',
    domain: 'Videography',
    name: 'Event Videography',
    summary: 'Video coverage for a gathering, wedding, or conference — recorded and edited, not live. One process; the occasion is what varies.',
    deliverables: ['RAW footage', 'Edited video'],
    blueprint: {
      name: 'Event Videography',
      stages: [
        { name: 'Shoot', roleName: 'Videographer', frontStage: true },
        { name: 'Video Edit', roleName: 'Video Editor', frontStage: false },
        { name: 'Delivery', frontStage: true },
      ],
    },
    questions: [
      { type: 'text', label: 'Event type' },
      { type: 'choice', label: 'Coverage', options: ['4 hours', '8 hours', 'Full day'] },
      { type: 'boolean', label: 'Multi-camera needed?' },
      { type: 'boolean', label: 'Drone footage wanted?' },
    ],
    occasions: ['Wedding', 'Conference'],
  },
  {
    id: 'live-streaming',
    domain: 'Videography',
    name: 'Live Streaming',
    summary: 'Real-time broadcast — the value is delivered the moment it happens, not edited afterward. A genuinely different process from recorded video.',
    deliverables: ['Live broadcast'],
    blueprint: {
      name: 'Live Streaming',
      stages: [{ name: 'Broadcast', roleName: 'Videographer', frontStage: true }],
    },
    questions: [
      { type: 'date', label: 'Event date', required: true },
      { type: 'text', label: 'Platform (YouTube, Zoom, etc.)' },
      { type: 'boolean', label: 'Multi-camera needed?' },
    ],
  },
  {
    id: 'brand-video',
    domain: 'Videography',
    name: 'Commercial Videography',
    summary: 'A brand or promotional video — recorded and edited, purpose is the client\'s, not the process\'s.',
    deliverables: ['Edited video'],
    blueprint: {
      name: 'Commercial Videography',
      stages: [
        { name: 'Shoot', roleName: 'Videographer', frontStage: false },
        { name: 'Video Edit', roleName: 'Video Editor', frontStage: false },
      ],
    },
    questions: [
      { type: 'boolean', label: 'Script or storyboard provided?' },
      { type: 'choice', label: 'Deliverable length', options: ['Under 1 minute', '1–3 minutes', '3+ minutes'] },
    ],
    purposes: ['Advertising'],
  },

  // ── Printing / Design — deliverables that require their own process ────
  {
    id: 'printing',
    domain: 'Printing',
    name: 'Fine Art Printing',
    summary: 'A physical print, made from a digital image — its own transformation, which is why it is a separate Service, not a property of the photography that produced the original.',
    deliverables: ['Printed photographs'],
    blueprint: { name: 'Fine Art Printing', stages: [{ name: 'Print', roleName: 'Print Technician', frontStage: false }] },
    questions: [
      { type: 'text', label: 'Which image (reference or file name)' },
      { type: 'choice', label: 'Size', options: ['8x10', '11x14', '16x20'] },
    ],
  },
  {
    id: 'framing',
    domain: 'Printing',
    name: 'Framing',
    summary: 'A framed, display-ready print — depends on a print already existing, its own process of materials and assembly.',
    deliverables: ['Framed print'],
    blueprint: { name: 'Framing', stages: [{ name: 'Frame', roleName: 'Print Technician', frontStage: false }] },
    questions: [
      { type: 'choice', label: 'Frame finish', options: ['Black', 'White', 'Natural wood'] },
    ],
  },
  {
    id: 'album-design',
    domain: 'Graphic Design',
    name: 'Album Design',
    summary: 'A designed photobook — depends on edited photographs already existing, a layout and print process of its own.',
    deliverables: ['Photobook'],
    blueprint: { name: 'Album Design', stages: [{ name: 'Design', roleName: 'Graphic Designer', frontStage: false }] },
    questions: [
      { type: 'number', label: 'Number of pages' },
      { type: 'choice', label: 'Cover material', options: ['Linen', 'Leather', 'Acrylic'] },
    ],
  },
];

export function getTemplate(id: string): ServiceTemplate | undefined {
  return SERVICE_TEMPLATES.find((t) => t.id === id);
}

/** Grouped by domain, for the picker. */
export function templatesByDomain(): { domain: string; templates: ServiceTemplate[] }[] {
  const order: string[] = [];
  const map = new Map<string, ServiceTemplate[]>();
  for (const t of SERVICE_TEMPLATES) {
    if (!map.has(t.domain)) { map.set(t.domain, []); order.push(t.domain); }
    map.get(t.domain)!.push(t);
  }
  return order.map((domain) => ({ domain, templates: map.get(domain)! }));
}
