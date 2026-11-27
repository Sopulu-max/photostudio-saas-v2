'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import { fillIn, type Automation, type Discount, type DueSend, type Trigger } from './shape';

/* --------------------------------------------------------------- discounts */

function shapeDiscount(d: {
  id: string; code: string; kind: 'percent' | 'amount'; value: number;
  expires_on: string | null; max_uses: number | null; times_used: number;
}): Discount {
  return {
    id: d.id, code: d.code, kind: d.kind, value: d.value,
    expiresOn: d.expires_on, maxUses: d.max_uses, timesUsed: d.times_used,
  };
}

export async function discounts(): Promise<Discount[]> {
  const who = await whoIsAsking();
  if (!who) return [];
  const { data, error } = await db
    .from('discounts')
    .select('id, code, kind, value, expires_on, max_uses, times_used')
    .eq('studio_id', who.studioId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to read the discounts:', error);
    throw new Error('Could not read the codes');
  }
  return (data ?? []).map(shapeDiscount);
}

export async function addDiscount(input: {
  code: string; kind: 'percent' | 'amount'; value: number;
  expiresOn?: string | null; maxUses?: number | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  // Upper-cased on the way in so a client typing it in lower case still gets
  // the discount; the comparison happens on one spelling, not two.
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error('A code needs something to type');
  if (!Number.isFinite(input.value) || input.value <= 0) throw new Error('That is not a discount');
  if (input.kind === 'percent' && input.value > 100) throw new Error('More than all of it is not a discount');

  const { error } = await db.from('discounts').insert({
    studio_id: who.studioId,
    code,
    kind: input.kind,
    value: Math.round(input.value),
    expires_on: input.expiresOn || null,
    max_uses: input.maxUses ?? null,
  });

  if (error) {
    if (String(error.message).includes('duplicate')) throw new Error('That code already exists');
    console.error('Failed to add the discount:', error);
    throw new Error('Could not add that code');
  }
  revalidatePath('/automations');
}

export async function removeDiscount(input: { discountId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  await db.from('discounts').delete()
    .eq('id', input.discountId).eq('studio_id', who.studioId);
  revalidatePath('/automations');
}

/* ------------------------------------------------------------- automations */

export async function automations(): Promise<Automation[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db
    .from('automations')
    .select('id, name, trigger, after_days, subject, body, active, '
      + 'discount:discounts(id, code, kind, value, expires_on, max_uses, times_used)')
    .eq('studio_id', who.studioId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to read the automations:', error);
    throw new Error('Could not read the automations');
  }

  return ((data ?? []) as unknown as {
    id: string; name: string; trigger: Trigger; after_days: number;
    subject: string; body: string; active: boolean;
    discount: Parameters<typeof shapeDiscount>[0] | null;
  }[]).map((a) => ({
    id: a.id,
    name: a.name,
    trigger: a.trigger,
    afterDays: a.after_days,
    subject: a.subject,
    body: a.body,
    active: a.active,
    discount: a.discount ? shapeDiscount(a.discount) : null,
  }));
}

export async function addAutomation(input: {
  name: string; trigger: Trigger; afterDays: number;
  subject: string; body: string; discountId?: string | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  if (!input.name.trim()) throw new Error('Give it a name');
  if (!input.subject.trim()) throw new Error('A message needs a subject');
  if (!input.body.trim()) throw new Error('A message needs something in it');
  if (!Number.isInteger(input.afterDays) || input.afterDays < 0 || input.afterDays > 365) {
    throw new Error('Choose between 0 and 365 days');
  }

  const { error } = await db.from('automations').insert({
    studio_id: who.studioId,
    name: input.name.trim(),
    trigger: input.trigger,
    after_days: input.afterDays,
    subject: input.subject.trim(),
    body: input.body.trim(),
    discount_id: input.discountId || null,
  });

  if (error) {
    console.error('Failed to add the automation:', error);
    throw new Error('Could not add that');
  }
  revalidatePath('/automations');
}

export async function setAutomationActive(input: {
  automationId: string; active: boolean;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  await db.from('automations').update({ active: input.active })
    .eq('id', input.automationId).eq('studio_id', who.studioId);
  revalidatePath('/automations');
}

export async function removeAutomation(input: { automationId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  await db.from('automations').delete()
    .eq('id', input.automationId).eq('studio_id', who.studioId);
  revalidatePath('/automations');
}

/* ------------------------------------------------------------ what is due */

const DAY = 86_400_000;

/**
 * What ought to go out, worked out from the galleries themselves.
 *
 * Nothing is scheduled ahead. The due list is DERIVED each time it is read, so
 * a studio that changes an automation sees the effect at once rather than
 * against a queue built under the old wording. Only the fact that something was
 * already sent is stored, because that is the one thing that cannot be
 * recomputed - and it is what stops a client being nagged twice.
 */
export async function whatIsDue(origin: string): Promise<DueSend[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const live = (await automations()).filter((a) => a.active);
  if (live.length === 0) return [];

  const [galleries, sent] = await Promise.all([
    db.from('galleries')
      .select('id, name, token, shared_at, expires_on, '
        + 'booking:bookings(client:people(id, name, email)), '
        + 'items:gallery_files(file:files(id, choices(person_id, person:people(id, name, email))))')
      .eq('studio_id', who.studioId)
      .not('shared_at', 'is', null),
    db.from('automation_sends')
      .select('automation_id, gallery_id, person_id')
      .eq('studio_id', who.studioId),
  ]);

  const already = new Set(
    (sent.data ?? []).map((s) => `${s.automation_id}:${s.gallery_id}:${s.person_id}`),
  );

  type Person = { id: string; name: string; email: string | null };
  const rows = (galleries.data ?? []) as unknown as {
    id: string; name: string; token: string;
    shared_at: string; expires_on: string | null;
    booking: { client: Person | null } | null;
    items: { file: { id: string; choices: { person_id: string; person: Person | null }[] } | null }[];
  }[];

  const now = Date.now();
  const due: DueSend[] = [];

  for (const g of rows) {
    // Who kept something in this gallery, and the client the booking is for.
    const keepers = new Map<string, Person>();
    for (const item of g.items ?? []) {
      for (const c of item.file?.choices ?? []) {
        if (c.person && c.person.email) keepers.set(c.person.id, c.person);
      }
    }
    const client = g.booking?.client ?? null;

    // Did anybody buy from this gallery? One query per gallery would be a
    // round trip each; this is read once below instead.
    for (const a of live) {
      let when: number | null = null;
      let audience: Person[] = [];

      if (a.trigger === 'gallery_shared') {
        when = new Date(g.shared_at).getTime() + a.afterDays * DAY;
        audience = client?.email ? [client] : [];
      } else if (a.trigger === 'gallery_expiring') {
        if (!g.expires_on) continue;
        when = new Date(`${g.expires_on}T00:00:00`).getTime() - a.afterDays * DAY;
        audience = client?.email ? [client] : [];
      } else {
        // kept_not_bought: everyone who kept something here.
        audience = [...keepers.values()];
        when = new Date(g.shared_at).getTime() + a.afterDays * DAY;
      }

      if (when === null || when > now) continue;

      for (const person of audience) {
        if (!person.email) continue;
        if (already.has(`${a.id}:${g.id}:${person.id}`)) continue;

        const facts = {
          client: person.name,
          gallery: g.name,
          link: `${origin}/g/${g.token}`,
          code: a.discount?.code ?? null,
        };

        due.push({
          automationId: a.id,
          automationName: a.name,
          galleryId: g.id,
          galleryName: g.name,
          galleryToken: g.token,
          personId: person.id,
          to: person.email,
          toName: person.name,
          subject: fillIn(a.subject, facts),
          body: fillIn(a.body, facts),
          dueAt: new Date(when).toISOString(),
        });
      }
    }
  }

  // Those who have already bought from a gallery should not be chased about it.
  const galleryIds = [...new Set(due.map((d) => d.galleryId))];
  if (galleryIds.length > 0) {
    const { data: bought } = await db
      .from('orders')
      .select('gallery_id, person_id')
      .eq('studio_id', who.studioId)
      .in('gallery_id', galleryIds);

    const purchased = new Set((bought ?? []).map((o) => `${o.gallery_id}:${o.person_id}`));
    const kept = due.filter((d) => {
      const isChase = live.find((a) => a.id === d.automationId)?.trigger === 'kept_not_bought';
      return !(isChase && purchased.has(`${d.galleryId}:${d.personId}`));
    });
    return kept.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }

  return due.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/**
 * Record that a message went out.
 *
 * Marked by the studio, because nothing here sends: no mail provider is wired
 * and a stub that pretends to send is worse than a list that admits it does
 * not. When a provider arrives it writes this same row.
 */
export async function markSent(input: {
  automationId: string; galleryId: string; personId: string; dueAt: string;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { error } = await db.from('automation_sends').insert({
    studio_id: who.studioId,
    automation_id: input.automationId,
    gallery_id: input.galleryId,
    person_id: input.personId,
    due_at: input.dueAt,
    sent_at: new Date().toISOString(),
  });

  if (error && !String(error.message).includes('duplicate')) {
    console.error('Failed to record the send:', error);
    throw new Error('Could not record that');
  }
  revalidatePath('/automations');
}
