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

/**
 * Whether a service brings something into existence or acts on something that
 * already exists. This is general knowledge the app holds about every service,
 * in every domain — not a photography detail:
 *
 *   generative      reality → new asset          a shoot, a broadcast, a logo
 *   transformative  existing asset → new asset   editing, restoring, printing,
 *                                                framing, digitising, binding
 *
 * It matters because a transformative service cannot start until its input
 * exists. That dependency has no home in the schema right now
 * (`services.required_input_deliverable_id` was dropped in 20260810000001 in
 * favour of dynamic intake forms), so this flag is the only place the system
 * knows it at all.
 */
export type ServiceMode = 'generative' | 'transformative';

export type ServiceTemplate = {
  id: string;
  /** Service Domain — Photography, Videography, Printing. */
  domain: string;
  /** Defaults to 'generative' when unset — see serviceMode(). */
  mode?: ServiceMode;
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

  // ── Photography: work on images that already exist ───────────────────────
  // Everything above creates new photographs. These transform ones that are
  // already there — the client brings the material. That is a different
  // transformation, which is the whole reason they are separate services and
  // not stages inside a shoot's blueprint. It is also why a restoration studio
  // can exist without ever owning a camera.
  //
  // NOTE: the schema cannot currently express "this service consumes an
  // existing deliverable" — services.required_input_deliverable_id was dropped
  // in 20260810000001 in favour of dynamic intake forms. So the dependency
  // below is stated in prose and carried by the questions, not by structure.
  {
    id: 'photo-retouching',
    domain: 'Photography',
    mode: 'transformative',
    name: 'Photo Retouching',
    summary: 'Refining photographs that already exist — the client supplies the images. Distinct from the editing pass inside a shoot, because here there was no shoot.',
    deliverables: ['Edited photographs'],
    blueprint: {
      name: 'Photo Retouching',
      stages: [
        { name: 'Review & Quote', frontStage: true },
        { name: 'Retouch', roleName: 'Photo Editor', frontStage: false },
        { name: 'Delivery', frontStage: true },
      ],
    },
    questions: [
      { type: 'number', label: 'Number of images' },
      { type: 'choice', label: 'Depth of work', options: ['Basic clean-up', 'Full retouch', 'Composite / heavy edit'] },
      { type: 'url', label: 'Link to the images' },
    ],
  },
  {
    id: 'photo-restoration',
    domain: 'Photography',
    mode: 'transformative',
    name: 'Photo Restoration',
    summary: 'Repairing damaged, faded or torn photographs. The input is usually a physical print, so this often depends on digitisation first.',
    deliverables: ['Restored photographs'],
    blueprint: {
      name: 'Photo Restoration',
      stages: [
        { name: 'Assess Damage', frontStage: true },
        { name: 'Restore', roleName: 'Photo Editor', frontStage: false },
        { name: 'Delivery', frontStage: true },
      ],
    },
    questions: [
      { type: 'number', label: 'Number of photographs' },
      { type: 'text', label: 'What kind of damage' },
      { type: 'boolean', label: 'Original is a physical print?' },
    ],
    purposes: ['Archival'],
  },
  {
    id: 'photo-digitisation',
    domain: 'Photography',
    mode: 'transformative',
    name: 'Photo Digitisation',
    summary: 'Scanning physical photographs, negatives or slides into digital files. Produces nothing new — it moves an existing image into another medium.',
    deliverables: ['Digital scans'],
    blueprint: {
      name: 'Photo Digitisation',
      stages: [{ name: 'Scan', roleName: 'Print Technician', frontStage: false }],
    },
    questions: [
      { type: 'number', label: 'Number of items' },
      { type: 'choice', label: 'Source material', options: ['Prints', 'Negatives', 'Slides'] },
    ],
    purposes: ['Archival'],
  },
  {
    id: 'film-developing',
    domain: 'Photography',
    mode: 'transformative',
    name: 'Film Developing',
    summary: 'Processing exposed film into developed negatives. This is the step that makes film the reverse of digital: here the physical original comes first, and the digital file is derived from it.',
    deliverables: ['Developed film'],
    blueprint: {
      name: 'Film Developing',
      stages: [{ name: 'Develop', roleName: 'Darkroom Technician', frontStage: false }],
    },
    questions: [
      { type: 'number', label: 'Number of rolls' },
      { type: 'choice', label: 'Film type', options: ['Colour negative', 'Black & white', 'Slide / E-6'] },
      { type: 'boolean', label: 'Scan after developing?' },
    ],
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

  // ── Videography: work on footage that already exists ─────────────────────
  // The same split as photography, for the same reason. An edit suite with no
  // camera is a real business; so is a studio that only transfers old tapes.
  {
    id: 'video-editing',
    domain: 'Videography',
    name: 'Video Editing',
    summary: 'Cutting footage the client already has into a finished piece. Distinct from the edit inside a shoot, because here the studio never filmed anything.',
    mode: 'transformative',
    deliverables: ['Edited video'],
    blueprint: {
      name: 'Video Editing',
      stages: [
        { name: 'Review Footage', frontStage: true },
        { name: 'Edit', roleName: 'Video Editor', frontStage: false },
        { name: 'Delivery', frontStage: true },
      ],
    },
    questions: [
      { type: 'choice', label: 'Finished length', options: ['Under 1 minute', '1–3 minutes', '3–10 minutes', 'Longer'] },
      { type: 'url', label: 'Link to the footage' },
      { type: 'boolean', label: 'Music or voiceover supplied?' },
    ],
  },
  {
    id: 'video-restoration',
    domain: 'Videography',
    name: 'Video Restoration',
    summary: 'Repairing degraded footage — noise, colour loss, damaged tape. The video equivalent of photo restoration.',
    mode: 'transformative',
    deliverables: ['Restored video'],
    blueprint: {
      name: 'Video Restoration',
      stages: [
        { name: 'Assess Footage', frontStage: true },
        { name: 'Restore', roleName: 'Video Editor', frontStage: false },
        { name: 'Delivery', frontStage: true },
      ],
    },
    questions: [
      { type: 'number', label: 'Total minutes of footage' },
      { type: 'text', label: 'What is wrong with it' },
    ],
    purposes: ['Archival'],
  },
  {
    id: 'tape-transfer',
    domain: 'Videography',
    name: 'Tape Transfer',
    summary: 'Moving VHS, MiniDV, 8mm and other tape formats to digital files. Produces nothing new — it carries existing footage into another medium.',
    mode: 'transformative',
    deliverables: ['Digital video files'],
    blueprint: {
      name: 'Tape Transfer',
      stages: [{ name: 'Transfer', roleName: 'Video Editor', frontStage: false }],
    },
    questions: [
      { type: 'number', label: 'Number of tapes' },
      { type: 'choice', label: 'Source format', options: ['VHS', 'MiniDV', '8mm / Hi8', 'Betamax', 'Other'] },
    ],
    purposes: ['Archival'],
  },

  // ── Printing / Design — deliverables that require their own process ────
  {
    id: 'printing',
    domain: 'Printing',
    mode: 'transformative',
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
    mode: 'transformative',
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
    mode: 'transformative',
    name: 'Album Design',
    summary: 'A designed photobook — depends on edited photographs already existing, a layout and print process of its own.',
    deliverables: ['Photobook'],
    blueprint: { name: 'Album Design', stages: [{ name: 'Design', roleName: 'Graphic Designer', frontStage: false }] },
    questions: [
      { type: 'number', label: 'Number of pages' },
      { type: 'choice', label: 'Cover material', options: ['Linen', 'Leather', 'Acrylic'] },
    ],
  },

  // ── Graphic Design: work made from a brief ───────────────────────────────
  // Album Design above is transformative — it needs photographs to already
  // exist. These are the other half of the domain: they create from a brief
  // rather than from an asset, which is why their first stage is a
  // conversation and not a file. A studio doing branding work had nothing to
  // select before these.
  {
    id: 'logo-design',
    domain: 'Graphic Design',
    name: 'Logo Design',
    summary: 'A mark for a business, made from a brief. Iterative by nature — concepts, a chosen direction, then final files.',
    deliverables: ['Logo files'],
    blueprint: {
      name: 'Logo Design',
      stages: [
        { name: 'Brief', frontStage: true },
        { name: 'Concepts', roleName: 'Graphic Designer', frontStage: false },
        { name: 'Revisions', roleName: 'Graphic Designer', frontStage: true },
        { name: 'Final Files', roleName: 'Graphic Designer', frontStage: false },
      ],
    },
    questions: [
      { type: 'text', label: 'Business or brand name', required: true },
      { type: 'number', label: 'Number of initial concepts' },
      { type: 'number', label: 'Rounds of revision included' },
      { type: 'url', label: 'Reference or moodboard link' },
    ],
    clientTypes: ['Business'],
    purposes: ['Branding'],
  },
  {
    id: 'brand-identity',
    domain: 'Graphic Design',
    name: 'Brand Identity',
    summary: 'The full system around a mark — colour, type, usage rules. Broader than a logo, and usually delivered as a guideline document.',
    deliverables: ['Brand guidelines', 'Logo files'],
    blueprint: {
      name: 'Brand Identity',
      stages: [
        { name: 'Discovery', frontStage: true },
        { name: 'Direction', roleName: 'Graphic Designer', frontStage: true },
        { name: 'Build System', roleName: 'Graphic Designer', frontStage: false },
        { name: 'Handover', frontStage: true },
      ],
    },
    questions: [
      { type: 'text', label: 'Business or brand name', required: true },
      { type: 'boolean', label: 'Existing logo to work from?' },
      { type: 'multichoice', label: 'What the system should cover', options: ['Logo', 'Colour palette', 'Typography', 'Usage rules', 'Stationery', 'Social templates'] },
    ],
    clientTypes: ['Business'],
    purposes: ['Branding'],
  },
  {
    id: 'flyer-design',
    domain: 'Graphic Design',
    name: 'Flyer Design',
    summary: 'A single piece of promotional artwork — flyer, poster, or social graphic. Short turnaround, one deliverable.',
    deliverables: ['Print-ready artwork'],
    blueprint: {
      name: 'Flyer Design',
      stages: [
        { name: 'Brief', frontStage: true },
        { name: 'Design', roleName: 'Graphic Designer', frontStage: false },
        { name: 'Delivery', frontStage: true },
      ],
    },
    questions: [
      { type: 'text', label: 'What is it promoting' },
      { type: 'choice', label: 'Intended output', options: ['Print', 'Social media', 'Both'] },
      { type: 'boolean', label: 'Copy and images supplied?' },
    ],
    purposes: ['Advertising'],
  },
];

export function getTemplate(id: string): ServiceTemplate | undefined {
  return SERVICE_TEMPLATES.find((t) => t.id === id);
}

/**
 * Creating something new is the default reading of a service, so only the
 * templates that act on existing material declare themselves. Anything
 * unmarked is generative.
 */
export function serviceMode(t: ServiceTemplate): ServiceMode {
  return t.mode ?? 'generative';
}

/** The services in a domain that need something to already exist before they can start. */
export function transformativeTemplates(domain?: string): ServiceTemplate[] {
  return SERVICE_TEMPLATES.filter(
    (t) => serviceMode(t) === 'transformative' && (!domain || t.domain === domain)
  );
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
