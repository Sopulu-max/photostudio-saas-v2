import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { amountInMinorUnits, invoiceBalance, isInvoiceCurrency, priceForInvoice, type InvoiceTerms } from '@/weave/payments/shape';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const options = {
  db: { schema: 'weave' },
  auth: { persistSession: false },
  realtime: { transport: WebSocket as unknown as never },
};
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, options);
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, options);
const studios: string[] = [];

afterAll(async () => {
  if (!studios.length) return;
  const { data } = await db.from('studios').delete().in('id', studios).select('id').throwOnError();
  expect(data).toHaveLength(studios.length);
});

async function studio() {
  const { data } = await db.from('studios').insert({
    name: 'Booking payments test', slug: `booking-payments-test-${randomUUID()}`,
  })
    .select('id').single().throwOnError();
  studios.push(data.id);
  return data.id;
}

it('keeps payment arithmetic in whole minor units and derives the deposit and balance', () => {
  expect(amountInMinorUnits('0.29')).toBe(29);
  expect(amountInMinorUnits('.05')).toBe(5);
  expect(amountInMinorUnits('2.001')).toBeNull();
  expect(amountInMinorUnits('1e2')).toBeNull();
  expect(amountInMinorUnits('1000000000')).toBeNull();
  expect(isInvoiceCurrency('NGN')).toBe(true);
  expect(isInvoiceCurrency('JPY')).toBe(false);

  const terms: InvoiceTerms = {
    number: 1, clientName: 'Test client', description: 'Portrait booking', currency: 'NGN',
    totalMinor: 100_000, depositMinor: 25_000, instructions: null,
    issuedAt: '2026-11-01T00:00:00Z', voidedAt: null, receivedMinor: 10_000,
  };
  expect(invoiceBalance(terms)).toEqual({ balance: 90_000, depositDue: 15_000, status: 'Deposit outstanding' });
  expect(invoiceBalance({ ...terms, receivedMinor: 25_000 })).toEqual({
    balance: 75_000, depositDue: 0, status: 'Balance outstanding',
  });
  expect(invoiceBalance({ ...terms, receivedMinor: 100_000 }).status).toBe('Paid in full');

  const portraits = { unitMinor: 25_000, quantity: 2, currency: 'NGN' };
  expect(priceForInvoice([portraits, { unitMinor: 10_000, quantity: 1, currency: 'NGN' }]))
    .toEqual({ source: 'packages', currency: 'NGN', totalMinor: 60_000 });
  expect(priceForInvoice([portraits, { unitMinor: null, quantity: 1, currency: 'USD' }]))
    .toEqual({ source: 'quote', currency: 'NGN', pricedSubtotal: 50_000, fixedCurrency: true });
  expect(priceForInvoice([portraits, { unitMinor: 10_000, quantity: 1, currency: 'USD' }]).source)
    .toBe('unavailable');
});

it('persists multiple package quantities and derives the invoice and gallery promise from those lines', async () => {
  const studioId = await studio();
  const otherStudioId = await studio();
  const { data: operator } = await db.from('people').insert({
    studio_id: studioId, name: 'Test operator', joined_at: new Date().toISOString(),
  }).select('id').single().throwOnError();
  const { data: packages } = await db.from('packages').insert([
    { studio_id: studioId, name: 'Portraits', price: 4_500_000, currency: 'NGN' },
    { studio_id: studioId, name: 'Wedding', price: 25_000_000, currency: 'NGN' },
    { studio_id: otherStudioId, name: 'Outside package', price: 1_000_000, currency: 'NGN' },
  ]).select('id, name').throwOnError();
  const portraits = packages.find((pack) => pack.name === 'Portraits')!;
  const wedding = packages.find((pack) => pack.name === 'Wedding')!;
  const outsider = packages.find((pack) => pack.name === 'Outside package')!;
  const { data: images } = await db.from('deliverables').insert({
    studio_id: studioId, name: 'Edited images', kind: 'digital', fills_gallery: true,
  }).select('id').single().throwOnError();
  await db.from('package_elements').insert([
    { studio_id: studioId, package_id: portraits.id, deliverable_id: images.id, count: 7, type: 'deliverable', mode: 'promised' },
    { studio_id: studioId, package_id: wedding.id, deliverable_id: images.id, count: 40, type: 'deliverable', mode: 'promised' },
  ]).throwOnError();

  const selection = [{ package_id: portraits.id, quantity: 2 }, { package_id: wedding.id, quantity: 1 }];
  const bookingId = randomUUID();
  const draft = {
    p_studio_id: studioId, p_actor_id: operator.id, p_booking_id: bookingId,
    p_booking: {
      client_name: 'Package quantity client', client_email: 'quantities@example.com', client_phone: '+2340000000000',
      packages: selection, crew: [],
    },
    p_invoice: { currency: 'NGN', total_minor: 34_000_000 },
  };
  for (const [packages, error] of [
    [[...selection, { package_id: outsider.id, quantity: 1 }], 'unavailable'],
    [[...selection, selection[0]], 'Invalid package quantities'],
    [[{ package_id: portraits.id, quantity: 100_000 }], 'gallery limit'],
  ] as const) {
    expect((await db.rpc('start_studio_booking', {
      ...draft, p_booking: { ...draft.p_booking, packages },
    })).error?.message).toContain(error);
  }
  expect((await db.rpc('start_studio_booking', {
    ...draft, p_invoice: { ...draft.p_invoice, total_minor: 29_500_000 },
  })).error?.message).toContain('must match the package price');

  expect((await db.rpc('start_studio_booking', draft).throwOnError()).data).toBe(true);
  expect((await db.rpc('start_studio_booking', draft).throwOnError()).data).toBe(false);
  const { data: lines } = await db.from('booking_packages').select('package_id, quantity, unit_price_minor')
    .eq('studio_id', studioId).eq('booking_id', bookingId).order('position').throwOnError();
  expect(lines).toEqual([
    { ...selection[0], unit_price_minor: 4_500_000 }, { ...selection[1], unit_price_minor: 25_000_000 },
  ]);
  expect((await db.rpc('booking_promised_pictures', {
    p_studio_id: studioId, p_booking_id: bookingId,
  }).throwOnError()).data).toBe(54);

  await db.from('packages').delete().eq('studio_id', studioId).eq('id', portraits.id).throwOnError();
  const { data: invoice } = await db.from('booking_invoices').select('total_minor, package_lines')
    .eq('studio_id', studioId).eq('booking_id', bookingId).single().throwOnError();
  expect(invoice).toEqual({
    total_minor: 34_000_000, package_lines: [
      { name: 'Portraits', quantity: 2, unitMinor: 4_500_000 }, { name: 'Wedding', quantity: 1, unitMinor: 25_000_000 },
    ],
  });
  const { data: bookedPortraits } = await db.from('booking_packages').select('name, quantity, package_id')
    .eq('studio_id', studioId).eq('booking_id', bookingId).eq('position', 1).single().throwOnError();
  expect(bookedPortraits).toEqual({ name: 'Portraits', quantity: 2, package_id: null });
});

it('scopes invoices, serializes payments, and preserves corrected entries', async () => {
  const studioId = await studio();
  const otherStudioId = await studio();
  const date = '2026-11-01';
  const { data: person } = await db.from('people').insert({ studio_id: studioId, name: 'Test client' })
    .select('id').single().throwOnError();
  const { data: bookings } = await db.from('bookings').insert([
    { studio_id: studioId, client_id: person.id, accepted_at: `${date}T00:00:00Z`, occasion: 'Client portrait session' },
    { studio_id: studioId, client_id: person.id, accepted_at: null },
  ]).select('id, accepted_at').throwOnError();
  const bookingId = bookings.find((booking) => booking.accepted_at)!.id;
  const pendingId = bookings.find((booking) => !booking.accepted_at)!.id;
  const scope = { p_studio_id: studioId, p_booking_id: bookingId, p_actor_id: person.id };
  const draft = {
    ...scope, p_description: 'Portrait booking', p_currency: 'NGN',
    p_total_minor: 100_000, p_deposit_minor: 25_000, p_instructions: 'Test transfer instructions',
  };
  expect((await anon.rpc('issue_booking_invoice', draft)).error).not.toBeNull();
  expect((await db.rpc('issue_booking_invoice', { ...draft, p_booking_id: pendingId })).error?.code).toBe('P0001');
  expect((await db.rpc('issue_booking_invoice', { ...draft, p_studio_id: otherStudioId })).error?.code).toBe('P0001');
  await db.rpc('issue_booking_invoice', draft).throwOnError();
  expect((await db.rpc('issue_booking_invoice', draft)).error?.code).toBe('P0001');

  const { data: invoice } = await db.from('booking_invoices')
    .select('id, number, share_token, client_id, client_name, description, invoice_received_minor, payments:booking_payments(id)')
    .eq('studio_id', studioId).eq('booking_id', bookingId).single().throwOnError();
  expect(invoice).toMatchObject({
    number: 1, client_id: person.id, client_name: 'Test client', description: 'Client portrait session',
    invoice_received_minor: 0, payments: [],
  });
  const { data: secondClient } = await db.from('people').insert({ studio_id: studioId, name: 'Test client' })
    .select('id').single().throwOnError();
  await db.from('bookings').update({ client_id: secondClient.id })
    .eq('studio_id', studioId).eq('id', bookingId).throwOnError();
  const { data: originalInvoices } = await db.from('booking_invoices').select('id')
    .eq('studio_id', studioId).eq('client_id', person.id).throwOnError();
  const { data: reassignedInvoices } = await db.from('booking_invoices').select('id')
    .eq('studio_id', studioId).eq('client_id', secondClient.id).throwOnError();
  expect(originalInvoices).toEqual([{ id: invoice.id }]);
  expect(reassignedInvoices).toEqual([]);
  const invoiceScope = { ...scope, p_invoice_id: invoice.id };
  const deposit = {
    ...invoiceScope, p_payment_id: randomUUID(), p_amount_minor: 25_000,
    p_received_on: date, p_reference: 'DEPOSIT-TEST',
  };
  await db.rpc('record_booking_payment', deposit).throwOnError();
  await db.rpc('record_booking_payment', deposit).throwOnError();
  expect((await db.rpc('record_booking_payment', { ...deposit, p_amount_minor: 25_001 })).error?.code).toBe('P0001');
  expect((await db.rpc('record_booking_payment', { ...deposit, p_studio_id: otherStudioId })).error?.code).toBe('P0001');

  const settlements = [randomUUID(), randomUUID()];
  const results = await Promise.all(settlements.map((id) => db.rpc('record_booking_payment', {
    ...deposit, p_payment_id: id, p_amount_minor: 75_000, p_reference: null,
  })));
  const accepted = results.findIndex((result) => !result.error);
  expect(results.filter((result) => !result.error)).toHaveLength(1);
  expect(results.find((result) => result.error)?.error?.message).toBe('Payment exceeds the outstanding balance.');
  expect((await db.rpc('void_booking_invoice', invoiceScope)).error?.code).toBe('P0001');

  const readBalance = () => db.from('booking_invoices').select('invoice_received_minor, voided_at')
    .eq('studio_id', studioId).eq('id', invoice.id).single().throwOnError();
  expect((await readBalance()).data.invoice_received_minor).toBe(100_000);
  for (const id of [settlements[accepted], deposit.p_payment_id]) {
    await db.rpc('void_booking_payment', { ...invoiceScope, p_payment_id: id }).throwOnError();
  }
  expect((await db.rpc('record_booking_payment', deposit)).error?.message)
    .toBe('This payment entry was voided. Reload the booking.');
  expect((await readBalance()).data.invoice_received_minor).toBe(0);
  const { data: voided } = await db.from('booking_payments').select('id, amount_minor, voided_at')
    .eq('studio_id', studioId).eq('invoice_id', invoice.id).throwOnError();
  expect(voided).toHaveLength(2);
  expect(voided.every((payment) => payment.voided_at !== null)).toBe(true);

  await db.rpc('void_booking_invoice', invoiceScope).throwOnError();
  expect((await readBalance()).data.voided_at).not.toBeNull();
  await db.rpc('issue_booking_invoice', { ...draft, p_total_minor: 120_000 }).throwOnError();
  const { data: replacement } = await db.from('booking_invoices').select('number, share_token, client_id')
    .eq('studio_id', studioId).eq('booking_id', bookingId).is('voided_at', null).single().throwOnError();
  expect(replacement.number).toBe(2);
  expect(replacement.client_id).toBe(secondClient.id);
  expect(replacement.share_token).not.toBe(invoice.share_token);
});

it('uses the booked package price and holds it after issue', async () => {
  const studioId = await studio();
  const { data: pack } = await db.from('packages').insert({
    studio_id: studioId, name: 'Portrait package', price: 18_000_000, currency: 'NGN',
  }).select('id').single().throwOnError();
  const { data: booking } = await db.from('bookings').insert({
    studio_id: studioId, package_id: pack.id, accepted_at: new Date().toISOString(),
  }).select('id').single().throwOnError();
  const draft = {
    p_studio_id: studioId, p_booking_id: booking.id, p_actor_id: null,
    p_description: null, p_total_minor: 18_000_000, p_currency: 'NGN',
    p_deposit_minor: 6_000_000, p_instructions: null,
  };

  for (const changes of [{ p_total_minor: 1 }, { p_currency: 'USD' }]) {
    const { error } = await db.rpc('issue_booking_invoice', { ...draft, ...changes });
    expect(error?.message).toContain('must match the package price');
  }

  await db.rpc('issue_booking_invoice', draft).throwOnError();
  await db.from('packages').update({ price: 20_000_000 })
    .eq('studio_id', studioId).eq('id', pack.id).throwOnError();
  const { data: invoice } = await db.from('booking_invoices')
    .select('total_minor, deposit_minor, currency, description').eq('studio_id', studioId)
    .eq('booking_id', booking.id).single().throwOnError();
  expect(invoice).toEqual({ total_minor: 18_000_000, deposit_minor: 6_000_000, currency: 'NGN', description: 'Portrait package' });
});

it('saves a new booking, invoice and first payment together and retries safely', async () => {
  const studioId = await studio();
  const { data: operator } = await db.from('people').insert({
    studio_id: studioId, name: 'Test operator', joined_at: new Date().toISOString(),
  }).select('id').single().throwOnError();
  const { data: pack } = await db.from('packages').insert({
    studio_id: studioId, name: 'Booking package', price: 18_000_000, currency: 'NGN',
  }).select('id').single().throwOnError();
  const bookingId = randomUUID();
  const draft = {
    p_studio_id: studioId, p_actor_id: operator.id, p_booking_id: bookingId,
    p_booking: {
      client_name: 'Combined booking test', client_email: 'combined@example.com', client_phone: '+2340000000000',
      package_id: pack.id, crew: [{ person_id: operator.id, role: 'Photographer' }],
    },
    p_invoice: {
      currency: 'NGN', total_minor: 18_000_000, deposit_minor: 6_000_000,
      receipt: { amount_minor: 6_000_000, received_on: '2026-11-01', reference: 'TEST-DEPOSIT' },
    },
  };
  expect((await anon.rpc('start_studio_booking', draft)).error).not.toBeNull();
  expect((await db.rpc('start_studio_booking', {
    ...draft, p_invoice: { ...draft.p_invoice, total_minor: 17_000_000 },
  })).error?.message).toContain('must match the package price');
  expect((await db.rpc('start_studio_booking', {
    ...draft, p_invoice: { ...draft.p_invoice, receipt: { ...draft.p_invoice.receipt, amount_minor: 19_000_000 } },
  })).error?.message).toBe('Payment exceeds the outstanding balance.');
  const [unsaved, clientsAfterFailure] = await Promise.all([
    db.from('bookings').select('id').eq('studio_id', studioId).eq('id', bookingId).maybeSingle().throwOnError(),
    db.from('people').select('id').eq('studio_id', studioId).eq('name', draft.p_booking.client_name).throwOnError(),
  ]);
  expect(unsaved.data).toBeNull();
  expect(clientsAfterFailure.data).toEqual([]);

  expect((await db.rpc('start_studio_booking', draft).throwOnError()).data).toBe(true);
  expect((await db.rpc('start_studio_booking', draft).throwOnError()).data).toBe(false);
  expect((await db.rpc('start_studio_booking', { ...draft, p_invoice: null })).error?.message)
    .toBe('The booking was already saved. Open it to make changes.');

  const { data: invoice } = await db.from('booking_invoices')
    .select('total_minor, deposit_minor, invoice_received_minor, client_id, client_name, description, payments:booking_payments(reference)')
    .eq('studio_id', studioId).eq('booking_id', bookingId).single().throwOnError();
  expect(invoice).toMatchObject({
    total_minor: 18_000_000, deposit_minor: 6_000_000, invoice_received_minor: 6_000_000,
    client_name: draft.p_booking.client_name, description: 'Booking package', payments: [{ reference: 'TEST-DEPOSIT' }],
  });
  const { data: originalClient } = await db.from('people').select('id, email').eq('studio_id', studioId)
    .eq('id', invoice.client_id).single().throwOnError();
  expect(originalClient.email).toBe(draft.p_booking.client_email);

  const { data: crew } = await db.from('crew').select('person_id').eq('studio_id', studioId)
    .eq('booking_id', bookingId).throwOnError();
  expect(crew).toEqual([{ person_id: operator.id }]);

  const withoutInvoice = randomUUID();
  expect((await db.rpc('start_studio_booking', {
    ...draft,
    p_booking_id: withoutInvoice,
    p_booking: { ...draft.p_booking, package_id: null, crew: [], client_email: 'new@example.com' },
    p_invoice: null,
  }).throwOnError()).data).toBe(true);
  const { count } = await db.from('booking_invoices').select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId).eq('booking_id', withoutInvoice).throwOnError();
  expect(count).toBe(0);
  const { data: secondClient } = await db.from('bookings').select('client_id').eq('studio_id', studioId)
    .eq('id', withoutInvoice).single().throwOnError();
  expect(secondClient.client_id).not.toBe(originalClient.id);

  const otherStudioId = await studio();
  const { data: outsider } = await db.from('people').insert({ studio_id: otherStudioId, name: 'Outside client' })
    .select('id').single().throwOnError();
  const repeatBooking = {
    ...draft,
    p_booking_id: randomUUID(),
    p_booking: { client_id: originalClient.id, package_id: pack.id, crew: [] },
  };
  expect((await db.rpc('start_studio_booking', {
    ...repeatBooking, p_booking: { ...repeatBooking.p_booking, client_id: outsider.id },
  })).error?.message).toBe('The selected client is unavailable.');
  expect((await db.rpc('start_studio_booking', repeatBooking).throwOnError()).data).toBe(true);
  const { data: repeatInvoice } = await db.from('booking_invoices').select('client_id, client_name')
    .eq('studio_id', studioId).eq('booking_id', repeatBooking.p_booking_id).single().throwOnError();
  expect(repeatInvoice).toEqual({ client_id: originalClient.id, client_name: draft.p_booking.client_name });
});
