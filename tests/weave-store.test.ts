import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { money, orderTotal, sayOrder, standingOf, type Order } from '@/weave/store/shape';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    db: { schema: 'weave' },
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  },
);

let studioId: string;
let listId: string;

beforeAll(async () => {
  const { data: studio, error } = await db
    .from('studios').insert({ name: `Test Studio ${Date.now()}` }).select('id').single();
  if (error) throw error;
  studioId = studio.id;

  const { data: list } = await db
    .from('price_lists').insert({ studio_id: studioId, name: 'Prints' })
    .select('id').single();
  listId = list!.id;
});

afterAll(async () => {
  if (studioId) await db.from('studios').delete().eq('id', studioId);
});

describe('the store', () => {
  it('refuses a price that is not a price', async () => {
    const { error } = await db.from('products').insert({
      studio_id: studioId, price_list_id: listId, name: 'Free lunch',
      kind: 'physical', price: -500,
    });
    expect(error, 'a negative price was accepted').not.toBeNull();
  });

  it('knows only two kinds, because it only does two things', async () => {
    const { error } = await db.from('products').insert({
      studio_id: studioId, price_list_id: listId, name: 'Hologram',
      kind: 'hologram', price: 1000,
    });
    expect(error, 'a third kind was accepted').not.toBeNull();
  });

  it('a line keeps the price it was sold at, however the list changes', async () => {
    const { data: product } = await db.from('products').insert({
      studio_id: studioId, price_list_id: listId, name: '8x10 print',
      kind: 'physical', price: 500000,
    }).select('id').single();

    const { data: order } = await db.from('orders')
      .insert({ studio_id: studioId, currency: 'NGN' }).select('id').single();

    await db.from('order_items').insert({
      studio_id: studioId, order_id: order!.id, product_id: product!.id,
      name: '8x10 print', kind: 'physical', unit_price: 500000, quantity: 2,
    });

    // The studio re-prices and renames next season.
    await db.from('products')
      .update({ price: 900000, name: '8x10 lustre print' })
      .eq('id', product!.id);

    const { data: line } = await db.from('order_items')
      .select('name, unit_price').eq('order_id', order!.id).single();

    expect(line!.unit_price, 'a past order was re-priced').toBe(500000);
    expect(line!.name, 'a past order was renamed').toBe('8x10 print');
  });

  it('keeps the order when the product is deleted', async () => {
    const { data: product } = await db.from('products').insert({
      studio_id: studioId, price_list_id: listId, name: 'Retired thing',
      kind: 'digital', price: 100000,
    }).select('id').single();

    const { data: order } = await db.from('orders')
      .insert({ studio_id: studioId, currency: 'NGN' }).select('id').single();
    await db.from('order_items').insert({
      studio_id: studioId, order_id: order!.id, product_id: product!.id,
      name: 'Retired thing', kind: 'digital', unit_price: 100000, quantity: 1,
    });

    await db.from('products').delete().eq('id', product!.id);

    const { data: line } = await db.from('order_items')
      .select('name, product_id').eq('order_id', order!.id).maybeSingle();

    expect(line, 'an order line vanished with its product').not.toBeNull();
    expect(line!.product_id, 'the dead product was still referenced').toBeNull();
    expect(line!.name).toBe('Retired thing');
  });
});

describe('how an order says itself', () => {
  const order = (over: Partial<Order> = {}): Order => ({
    id: 'o', galleryId: null, bookingId: null, who: 'Ada', shipTo: null, note: null,
    discountCode: null, discountOff: 0,
    currency: 'NGN', placedAt: '', paidAt: null, fulfilledAt: null,
    lines: [{
      id: 'l', name: '8x10', variantName: null, kind: 'physical', unitPrice: 500000,
      quantity: 2, fileId: null, fileName: null,
    }],
    ...over,
  });

  it('derives where it stands from timestamps, never a column', () => {
    expect(standingOf(order())).toBe('unpaid');
    expect(standingOf(order({ paidAt: 'x' }))).toBe('to make');
    expect(standingOf(order({ paidAt: 'x', fulfilledAt: 'y' }))).toBe('done');
  });

  it('totals in minor units and says it in major ones', () => {
    expect(orderTotal(order().lines)).toBe(1000000);
    expect(money(1000000, 'NGN')).toContain('10,000');
    expect(sayOrder(order())).toContain('not paid yet');
    expect(sayOrder(order({ paidAt: 'x' }))).toContain('waiting to be made');
    expect(sayOrder(order({ paidAt: 'x', fulfilledAt: 'y' }))).toContain('sent');
  });
});
