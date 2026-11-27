'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import {
  assertVisitorCanUseGalleryFile, visitorCanAccessGallery, visitorPersonForGallery, type GalleryVisitorGate,
} from '@/weave/galleries/actions';
import type { BasketLine, Order, PriceList, ProductKind, ShownAs, Size } from './shape';

/** Both measurements or neither — the table enforces it, this honours it. */
function asSize(w: number | null, h: number | null): Size | null {
  return w !== null && h !== null ? { widthMm: w, heightMm: h } : null;
}

/* ------------------------------------------------------------ the studio's */

export async function priceLists(): Promise<PriceList[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db
    .from('price_lists')
    .select('id, name, is_default, products(id, name, kind, price, currency, position, shown_as, width_mm, height_mm, variants:product_variants(id, name, price_delta, position, width_mm, height_mm))')
    .eq('studio_id', who.studioId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to read the price lists:', error);
    throw new Error('Could not read what is for sale');
  }

  return ((data ?? []) as unknown as {
    id: string; name: string; is_default: boolean;
    products: {
      id: string; name: string; kind: ProductKind; price: number; currency: string; position: number;
      shown_as: ShownAs; width_mm: number | null; height_mm: number | null;
      variants: { id: string; name: string; price_delta: number; position: number;
        width_mm: number | null; height_mm: number | null }[];
    }[];
  }[]).map((l) => ({
    id: l.id,
    name: l.name,
    isDefault: l.is_default,
    products: (l.products ?? []).sort((a, b) => a.position - b.position).map((product) => ({
      ...product,
      shownAs: product.shown_as,
      size: asSize(product.width_mm, product.height_mm),
      variants: (product.variants ?? []).sort((a, b) => a.position - b.position).map((variant) => ({
        id: variant.id, name: variant.name, priceDelta: variant.price_delta, position: variant.position,
        size: asSize(variant.width_mm, variant.height_mm),
      })),
    })),
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
  /** Stated, never parsed from the name. Omitted means it cannot be previewed. */
  widthMm?: number | null;
  heightMm?: number | null;
  shownAs?: ShownAs;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const name = input.name.trim();
  if (!name) throw new Error('Something for sale needs a name');
  if (!Number.isFinite(input.price) || input.price < 0) throw new Error('That price is not a price');

  /*
   * Both measurements or neither. Half a size cannot be drawn, and letting
   * one through would put a row in the table the preview has to guess about.
   */
  const w = input.widthMm ?? null;
  const h = input.heightMm ?? null;
  if ((w === null) !== (h === null)) throw new Error('Give both measurements, or neither');
  if (w !== null && (w < 10 || w > 10_000 || h! < 10 || h! > 10_000)) {
    throw new Error('Those measurements are not a print');
  }

  const { count } = await db
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('price_list_id', input.priceListId);

  const { error } = await db.from('products').insert({
    studio_id: who.studioId,
    price_list_id: input.priceListId,
    width_mm: w,
    height_mm: h,
    shown_as: input.shownAs ?? 'print',
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

/** Add a sellable expression of one product, with a delta from its base price. */
export async function addProductVariant(input: {
  productId: string; name: string; priceDelta: number;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  const name = input.name.trim();
  if (!name) throw new Error('A variant needs a name');
  if (!Number.isFinite(input.priceDelta)) throw new Error('That price change is not a price');
  const [{ data: product }, { count }] = await Promise.all([
    db.from('products').select('id').eq('id', input.productId).eq('studio_id', who.studioId).maybeSingle(),
    db.from('product_variants').select('id', { count: 'exact', head: true }).eq('product_id', input.productId),
  ]);
  if (!product) throw new Error('That product is not in this studio');
  const { error } = await db.from('product_variants').insert({
    studio_id: who.studioId, product_id: input.productId, name,
    price_delta: Math.round(input.priceDelta), position: count ?? 0,
  });
  if (error) throw new Error('Could not add that variant');
  revalidatePath('/store');
}

export async function removeProductVariant(input: { variantId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  await db.from('product_variants').delete().eq('id', input.variantId).eq('studio_id', who.studioId);
  revalidatePath('/store');
}

/** Point a gallery at a price list, or take the shop out of it. */
export async function sellFrom(input: {
  galleryId: string; bookingId: string; priceListId: string | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { error } = await db
    .from('galleries')
    .update({ price_list_id: input.priceListId })
    .eq('id', input.galleryId)
    .eq('studio_id', who.studioId);

  if (error) throw new Error('Could not change that');
  revalidatePath(`/bookings/${input.bookingId}`);
}

/* ------------------------------------------------------------- the client's */

/** What is for sale in this gallery, read by token and with no session. */
export async function whatIsForSale(token: string): Promise<PriceList | null> {
  const { data: gallery } = await db
    .from('galleries')
    .select('id, price_list_id, token, shared_at, expires_on, access_mode, access_code_hash')
    .eq('token', token)
    .maybeSingle();

  if (!gallery || !gallery.price_list_id || !await visitorCanAccessGallery(gallery as GalleryVisitorGate)) {
    return null;
  }

  const { data, error } = await db
    .from('price_lists')
    .select('id, name, is_default, products(id, name, kind, price, currency, position, shown_as, width_mm, height_mm, variants:product_variants(id, name, price_delta, position, width_mm, height_mm))')
    .eq('id', gallery.price_list_id)
    .maybeSingle();

  if (error || !data) return null;

  const l = data as unknown as {
    id: string; name: string; is_default: boolean;
    products: {
      id: string; name: string; kind: ProductKind; price: number; currency: string; position: number;
      shown_as: ShownAs; width_mm: number | null; height_mm: number | null;
      variants: { id: string; name: string; price_delta: number; position: number;
        width_mm: number | null; height_mm: number | null }[];
    }[];
  };

  return {
    id: l.id,
    name: l.name,
    isDefault: l.is_default,
    products: (l.products ?? []).sort((a, b) => a.position - b.position).map((product) => ({
      ...product,
      shownAs: product.shown_as,
      size: asSize(product.width_mm, product.height_mm),
      variants: (product.variants ?? []).sort((a, b) => a.position - b.position).map((variant) => ({
        id: variant.id, name: variant.name, priceDelta: variant.price_delta, position: variant.position,
        size: asSize(variant.width_mm, variant.height_mm),
      })),
    })),
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
  code?: string;
  lines: BasketLine[];
}): Promise<{ id: string }> {
  if (input.lines.length === 0) throw new Error('There is nothing in the basket');

  const { data: gallery } = await db
    .from('galleries')
    .select('id, studio_id, booking_id, price_list_id, token, shared_at, expires_on, access_mode, access_code_hash')
    .eq('token', input.token)
    .maybeSingle();

  if (!gallery || !await visitorCanAccessGallery(gallery as GalleryVisitorGate)) {
    throw new Error('That gallery is not available');
  }
  if (!gallery.price_list_id) throw new Error('Nothing is for sale in this gallery');
  await Promise.all([...new Set(input.lines.flatMap((line) => line.fileId ? [line.fileId] : []))]
    .map((fileId) => assertVisitorCanUseGalleryFile(gallery as GalleryVisitorGate, fileId)));

  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw new Error('An email is needed to send the order');

  // Only products from THIS gallery's list, priced as that list prices them.
  // Taking a price from the request would let anybody buy at any figure.
  const { data: products } = await db
    .from('products')
    .select('id, name, kind, price, currency, variants:product_variants(id, name, price_delta)')
    .eq('price_list_id', gallery.price_list_id);

  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const lines = input.lines.flatMap((line) => {
    const product = byId.get(line.productId);
    if (!product || line.quantity <= 0) return [];
    const variants = (product.variants ?? []) as { id: string; name: string; price_delta: number }[];
    const variant = line.variantId ? variants.find((candidate) => candidate.id === line.variantId) ?? null : null;
    if ((line.variantId && !variant) || product.price + (variant?.price_delta ?? 0) < 0) return [];
    return [{ line, product, variant }];
  });

  if (lines.length === 0) throw new Error('Nothing in that basket is for sale here');

  const personId = await visitorPersonForGallery(
    gallery as GalleryVisitorGate & { studio_id: string }, email, input.name,
  );

  /*
   * The discount is worked out HERE, from the studio's own row, and never from
   * anything the basket said. A code is only ever a claim; what it is worth is
   * the studio's to decide.
   *
   * What it took off is stored ON THE ORDER, not left to be recomputed from the
   * code. Deleting or re-valuing a code next month must not rewrite what
   * somebody was charged today - the same rule the lines already follow.
   */
  const gross = lines.reduce(
    (n, { line, product, variant }) =>
      n + (product.price + (variant?.price_delta ?? 0)) * line.quantity,
    0,
  );

  let discountCode: string | null = null;
  let discountOff = 0;
  const claimed = input.code?.trim().toUpperCase();

  if (claimed) {
    const today = new Date().toLocaleDateString('en-CA');
    const { data: found } = await db
      .from('discounts')
      .select('id, code, kind, value, expires_on, max_uses, times_used')
      .eq('studio_id', gallery.studio_id)
      .eq('code', claimed)
      .maybeSingle();

    if (!found) throw new Error('That code is not one of ours');
    if (found.expires_on && found.expires_on < today) throw new Error('That code has expired');
    if (found.max_uses !== null && found.times_used >= found.max_uses) {
      throw new Error('That code has been used up');
    }

    const off = found.kind === 'percent'
      ? Math.round((gross * found.value) / 100)
      : found.value;
    discountOff = Math.min(off, gross);
    discountCode = found.code;
  }

  const { data: order, error: orderError } = await db
    .from('orders')
    .insert({
      studio_id: gallery.studio_id,
      gallery_id: gallery.id,
      booking_id: gallery.booking_id,
      person_id: personId,
      ship_to: input.shipTo?.trim() || null,
      note: input.note?.trim() || null,
      currency: lines[0].product.currency,
      discount_code: discountCode,
      discount_off: discountOff,
    })
    .select('id')
    .single();

  if (orderError) {
    console.error('Failed to place the order:', orderError);
    throw new Error('Could not take that order');
  }

  const { error: itemsError } = await db.from('order_items').insert(
    lines.map(({ line, product, variant }) => ({
      studio_id: gallery.studio_id,
      order_id: order.id,
      product_id: product.id,
      product_variant_id: variant?.id ?? null,
      file_id: line.fileId,
      name: product.name,
      variant_name: variant?.name ?? null,
      kind: product.kind,
      unit_price: product.price + (variant?.price_delta ?? 0),
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

  // Counted only once the order and its lines are both down, so an order that
  // failed halfway does not silently consume somebody's code.
  if (discountCode) {
    const { data: current } = await db
      .from('discounts').select('id, times_used')
      .eq('studio_id', gallery.studio_id).eq('code', discountCode).maybeSingle();
    if (current) {
      await db.from('discounts')
        .update({ times_used: current.times_used + 1 }).eq('id', current.id);
    }
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
  if (gallery.booking_id) revalidatePath(`/bookings/${gallery.booking_id}`);
  return { id: order.id };
}

/* ---------------------------------------------------------- back at the desk */

export async function ordersForJob(bookingId: string): Promise<Order[]> {
  const who = await whoIsAsking();
  if (!who) return [];
  return readOrders({ studioId: who.studioId, bookingId });
}

export async function allOrders(): Promise<Order[]> {
  const who = await whoIsAsking();
  if (!who) return [];
  return readOrders({ studioId: who.studioId });
}

async function readOrders(q: { studioId: string; bookingId?: string }): Promise<Order[]> {
  let query = db
    .from('orders')
    .select('id, gallery_id, booking_id, ship_to, note, currency, discount_code, discount_off, '
      + 'placed_at, paid_at, fulfilled_at, '
      + 'person:people(name, email), '
      + 'items:order_items(id, name, variant_name, kind, unit_price, quantity, file_id, file:files(name))')
    .eq('studio_id', q.studioId)
    .order('placed_at', { ascending: false });

  if (q.bookingId) query = query.eq('booking_id', q.bookingId);

  const { data, error } = await query;
  if (error) {
    console.error('Failed to read the orders:', error);
    throw new Error('Could not read the orders');
  }

  return ((data ?? []) as unknown as {
    id: string; gallery_id: string | null; booking_id: string | null;
    ship_to: string | null; note: string | null; currency: string;
    discount_code: string | null; discount_off: number;
    placed_at: string; paid_at: string | null; fulfilled_at: string | null;
    person: { name: string; email: string | null } | null;
    items: {
      id: string; name: string; variant_name: string | null; kind: ProductKind; unit_price: number;
      quantity: number; file_id: string | null; file: { name: string } | null;
    }[];
  }[]).map((o) => ({
    id: o.id,
    galleryId: o.gallery_id,
    bookingId: o.booking_id,
    who: o.person?.name ?? o.person?.email ?? null,
    shipTo: o.ship_to,
    note: o.note,
    currency: o.currency,
    discountCode: o.discount_code,
    discountOff: o.discount_off ?? 0,
    placedAt: o.placed_at,
    paidAt: o.paid_at,
    fulfilledAt: o.fulfilled_at,
    lines: (o.items ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      variantName: i.variant_name,
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
    .select('booking_id')
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
  revalidatePath('/dashboard');
  if (data?.booking_id) revalidatePath(`/bookings/${data.booking_id}`);
}
