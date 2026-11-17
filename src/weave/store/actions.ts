'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type { BasketLine, Order, PriceList, ProductKind } from './shape';

/* ------------------------------------------------------------ the studio's */

export async function priceLists(): Promise<PriceList[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db
    .from('price_lists')
    .select('id, name, is_default, products(id, name, kind, price, currency, position)')
    .eq('studio_id', who.studioId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to read the price lists:', error);
    throw new Error('Could not read what is for sale');
  }

  return ((data ?? []) as unknown as {
    id: string; name: string; is_default: boolean;
    products: { id: string; name: string; kind: ProductKind; price: number; currency: string; position: number }[];
  }[]).map((l) => ({
    id: l.id,
    name: l.name,
    isDefault: l.is_default,
    products: (l.products ?? []).sort((a, b) => a.position - b.position),
  }));
}

export async function addPriceList(input: { name: string }): Promise<{ id: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const name = input.name.trim();
  if (!name) throw new Error('A price list needs a name');

  const { data, error } = await db
    .from('price_lists')
    .insert({ studio_id: who.studioId, name })
    .select('id')
    .single();

  if (error) throw new Error('Could not make that price list');
  revalidatePath('/store');
  return { id: data.id };
}

export async function addProduct(input: {
  priceListId: string;
  name: string;
  kind: ProductKind;
  price: number;
  currency?: string;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const name = input.name.trim();
  if (!name) throw new Error('Something for sale needs a name');
  if (!Number.isFinite(input.price) || input.price < 0) throw new Error('That price is not a price');

  const { count } = await db
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('price_list_id', input.priceListId);

  const { error } = await db.from('products').insert({
    studio_id: who.studioId,
    price_list_id: input.priceListId,
    name,
    kind: input.kind,
    price: Math.round(input.price),
    currency: input.currency ?? 'NGN',
    position: count ?? 0,
  });

  if (error) {
    console.error('Failed to add the product:', error);
    throw new Error('Could not add that');
  }
  revalidatePath('/store');
}

export async function removeProduct(input: { productId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  await db.from('products').delete()
    .eq('id', input.productId).eq('studio_id', who.studioId);
  revalidatePath('/store');
}

/** Point a gallery at a price list, or take the shop out of it. */
export async function sellFrom(input: {
  galleryId: string; jobId: string; priceListId: string | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { error } = await db
    .from('galleries')
    .update({ price_list_id: input.priceListId })
    .eq('id', input.galleryId)
    .eq('studio_id', who.studioId);

  if (error) throw new Error('Could not change that');
  revalidatePath(`/jobs/${input.jobId}`);
}

/* ------------------------------------------------------------- the client's */

/** What is for sale in this gallery, read by token and with no session. */
export async function whatIsForSale(token: string): Promise<PriceList | null> {
  const { data: gallery } = await db
    .from('galleries')
    .select('price_list_id, shared_at')
    .eq('token', token)
    .maybeSingle();

  if (!gallery?.shared_at || !gallery.price_list_id) return null;

  const { data, error } = await db
    .from('price_lists')
    .select('id, name, is_default, products(id, name, kind, price, currency, position)')
    .eq('id', gallery.price_list_id)
    .maybeSingle();

  if (error || !data) return null;

  const l = data as unknown as {
    id: string; name: string; is_default: boolean;
    products: { id: string; name: string; kind: ProductKind; price: number; currency: string; position: number }[];
  };

  return {
    id: l.id,
    name: l.name,
    isDefault: l.is_default,
    products: (l.products ?? []).sort((a, b) => a.position - b.position),
  };
}

/**
 * Place an order from a gallery.
 *
 * Every line's name and price are SNAPSHOT at this moment. Re-pricing the list
 * next season must not rewrite what somebody was charged today, and renaming a
 * product must not rewrite what their receipt said.
 */
export async function placeOrder(input: {
  token: string;
  email: string;
  name?: string;
  shipTo?: string;
  note?: string;
  lines: BasketLine[];
}): Promise<{ id: string }> {
  if (input.lines.length === 0) throw new Error('There is nothing in the basket');

  const { data: gallery } = await db
    .from('galleries')
    .select('id, studio_id, job_id, price_list_id, shared_at')
    .eq('token', input.token)
    .maybeSingle();

  if (!gallery?.shared_at) throw new Error('That gallery is not open');
  if (!gallery.price_list_id) throw new Error('Nothing is for sale in this gallery');

  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw new Error('An email is needed to send the order');

  // Only products from THIS gallery's list, priced as that list prices them.
  // Taking a price from the request would let anybody buy at any figure.
  const { data: products } = await db
    .from('products')
    .select('id, name, kind, price, currency')
    .eq('price_list_id', gallery.price_list_id);

  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const lines = input.lines
    .filter((l) => byId.has(l.productId) && l.quantity > 0)
    .map((l) => ({ line: l, product: byId.get(l.productId)! }));

  if (lines.length === 0) throw new Error('Nothing in that basket is for sale here');

  const { data: found } = await db
    .from('people').select('id')
    .eq('studio_id', gallery.studio_id).eq('email', email).maybeSingle();

  let personId = found?.id ?? null;
  if (!personId) {
    const { data: made, error } = await db
      .from('people')
      .insert({ studio_id: gallery.studio_id, name: input.name?.trim() || email, email })
      .select('id').single();
    if (error) throw new Error('Could not take that order');
    personId = made.id;
  }

  const { data: order, error: orderError } = await db
    .from('orders')
    .insert({
      studio_id: gallery.studio_id,
      gallery_id: gallery.id,
      job_id: gallery.job_id,
      person_id: personId,
      ship_to: input.shipTo?.trim() || null,
      note: input.note?.trim() || null,
      currency: lines[0].product.currency,
    })
    .select('id')
    .single();

  if (orderError) {
    console.error('Failed to place the order:', orderError);
    throw new Error('Could not take that order');
  }

  const { error: itemsError } = await db.from('order_items').insert(
    lines.map(({ line, product }) => ({
      studio_id: gallery.studio_id,
      order_id: order.id,
      product_id: product.id,
      file_id: line.fileId,
      name: product.name,
      kind: product.kind,
      unit_price: product.price,
      quantity: line.quantity,
    })),
  );

  if (itemsError) {
    // The order without its lines is worse than no order: it would show as an
    // empty sale somebody has to guess at. Take it back out.
    await db.from('orders').delete().eq('id', order.id);
    console.error('Failed to record the order lines:', itemsError);
    throw new Error('Could not take that order');
  }

  await db.from('events').insert({
    studio_id: gallery.studio_id,
    subject_type: 'order',
    subject_id: order.id,
    action: 'placed',
    actor_id: personId,
    payload: { gallery: gallery.id, lines: lines.length },
  });

  revalidatePath(`/g/${input.token}`);
  if (gallery.job_id) revalidatePath(`/jobs/${gallery.job_id}`);
  return { id: order.id };
}

/* ---------------------------------------------------------- back at the desk */

export async function ordersForJob(jobId: string): Promise<Order[]> {
  const who = await whoIsAsking();
  if (!who) return [];
  return readOrders({ studioId: who.studioId, jobId });
}

export async function allOrders(): Promise<Order[]> {
  const who = await whoIsAsking();
  if (!who) return [];
  return readOrders({ studioId: who.studioId });
}

async function readOrders(q: { studioId: string; jobId?: string }): Promise<Order[]> {
  let query = db
    .from('orders')
    .select('id, gallery_id, job_id, ship_to, note, currency, placed_at, paid_at, fulfilled_at, '
      + 'person:people(name, email), '
      + 'items:order_items(id, name, kind, unit_price, quantity, file_id, file:files(name))')
    .eq('studio_id', q.studioId)
    .order('placed_at', { ascending: false });

  if (q.jobId) query = query.eq('job_id', q.jobId);

  const { data, error } = await query;
  if (error) {
    console.error('Failed to read the orders:', error);
    throw new Error('Could not read the orders');
  }

  return ((data ?? []) as unknown as {
    id: string; gallery_id: string | null; job_id: string | null;
    ship_to: string | null; note: string | null; currency: string;
    placed_at: string; paid_at: string | null; fulfilled_at: string | null;
    person: { name: string; email: string | null } | null;
    items: {
      id: string; name: string; kind: ProductKind; unit_price: number;
      quantity: number; file_id: string | null; file: { name: string } | null;
    }[];
  }[]).map((o) => ({
    id: o.id,
    galleryId: o.gallery_id,
    jobId: o.job_id,
    who: o.person?.name ?? o.person?.email ?? null,
    shipTo: o.ship_to,
    note: o.note,
    currency: o.currency,
    placedAt: o.placed_at,
    paidAt: o.paid_at,
    fulfilledAt: o.fulfilled_at,
    lines: (o.items ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      kind: i.kind,
      unitPrice: i.unit_price,
      quantity: i.quantity,
      fileId: i.file_id,
      fileName: i.file?.name ?? null,
    })),
  }));
}

/**
 * Mark an order paid or made.
 *
 * By hand, because no payment processor is wired - that was a deliberate
 * decision carried over, and manual settlement is how this studio already
 * works. When a processor arrives it sets the same column and nothing else
 * about this changes.
 */
export async function markOrder(input: {
  orderId: string;
  paid?: boolean;
  fulfilled?: boolean;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const patch: Record<string, string | null> = {};
  if (input.paid !== undefined) patch.paid_at = input.paid ? new Date().toISOString() : null;
  if (input.fulfilled !== undefined) {
    patch.fulfilled_at = input.fulfilled ? new Date().toISOString() : null;
  }
  if (Object.keys(patch).length === 0) return;

  const { data, error } = await db
    .from('orders')
    .update(patch)
    .eq('id', input.orderId)
    .eq('studio_id', who.studioId)
    .select('job_id')
    .maybeSingle();

  if (error) {
    console.error('Failed to mark the order:', error);
    throw new Error('Could not record that');
  }

  await db.from('events').insert({
    studio_id: who.studioId,
    subject_type: 'order',
    subject_id: input.orderId,
    action: 'marked',
    actor_id: who.personId,
    payload: patch,
  });

  revalidatePath('/orders');
  if (data?.job_id) revalidatePath(`/jobs/${data.job_id}`);
}
