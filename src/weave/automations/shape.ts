/**
 * Automations: the messages a studio means to send and never does.
 *
 * Three triggers, because the engine computes something different for each.
 * Everything else about a message is the studio's own words.
 */

export type Trigger = 'gallery_shared' | 'gallery_expiring' | 'kept_not_bought';

export const TRIGGERS: { trigger: Trigger; says: (days: number) => string }[] = [
  {
    trigger: 'gallery_shared',
    says: (d) => (d === 0 ? 'the day a gallery is sent' : `${d} days after a gallery is sent`),
  },
  {
    trigger: 'gallery_expiring',
    says: (d) => (d === 0 ? 'the day a gallery closes' : `${d} days before a gallery closes`),
  },
  {
    trigger: 'kept_not_bought',
    says: (d) => (d === 0 ? 'as soon as frames are kept and nothing bought'
      : `${d} days after frames are kept and nothing bought`),
  },
];

export type Discount = {
  id: string;
  code: string;
  kind: 'percent' | 'amount';
  value: number;
  expiresOn: string | null;
  maxUses: number | null;
  timesUsed: number;
};

export type Automation = {
  id: string;
  name: string;
  trigger: Trigger;
  afterDays: number;
  subject: string;
  body: string;
  active: boolean;
  discount: Discount | null;
};

/** One message that is due, already written out. */
export type DueSend = {
  automationId: string;
  automationName: string;
  galleryId: string;
  galleryName: string;
  galleryToken: string;
  personId: string;
  to: string;
  toName: string;
  subject: string;
  body: string;
  dueAt: string;
};

export function sayTrigger(a: Pick<Automation, 'trigger' | 'afterDays'>): string {
  return TRIGGERS.find((t) => t.trigger === a.trigger)?.says(a.afterDays) ?? a.trigger;
}

export function sayDiscount(d: Discount, currency = 'NGN'): string {
  const off = d.kind === 'percent'
    ? `${d.value}% off`
    : `${currency} ${(d.value / 100).toLocaleString()} off`;
  const used = d.maxUses ? `${d.timesUsed} of ${d.maxUses} used` : `${d.timesUsed} used`;
  return d.expiresOn ? `${off}, ${used}, until ${d.expiresOn}` : `${off}, ${used}`;
}

/**
 * Put the studio's words together with this client's facts.
 *
 * Deliberately a handful of plain placeholders rather than a template language:
 * a studio writing a note to a client should not have to learn syntax, and an
 * unknown placeholder is left alone rather than blanked, so a stray brace never
 * silently eats a sentence.
 */
export function fillIn(
  text: string,
  facts: { client: string; gallery: string; link: string; code: string | null },
): string {
  return text
    .replace(/\{client\}/g, facts.client)
    .replace(/\{gallery\}/g, facts.gallery)
    .replace(/\{link\}/g, facts.link)
    .replace(/\{code\}/g, facts.code ?? '');
}

/** What a discount takes off a total, never more than the total itself. */
export function discountOff(total: number, d: Discount | null): number {
  if (!d || total <= 0) return 0;
  const off = d.kind === 'percent'
    ? Math.round((total * d.value) / 100)
    : d.value;
  return Math.min(off, total);
}

/** Whether a code may still be used at all. */
export function discountIsLive(d: Discount, today: string): boolean {
  if (d.expiresOn && d.expiresOn < today) return false;
  if (d.maxUses !== null && d.timesUsed >= d.maxUses) return false;
  return true;
}
