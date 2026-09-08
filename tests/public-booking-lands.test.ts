import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * EVERYTHING A CLIENT SUBMITS, WHERE IT IS SUPPOSED TO LAND.
 *
 * A booking taken on the public page is the one write in this system nobody
 * watches happen. The client fills in a form on their phone and the studio
 * finds a row later; if a field goes nowhere, nothing errors and nobody knows
 * until somebody asks "did they say what occasion it was?" and the answer is
 * gone.
 *
 * Several already have: the package's tasks were not copied onto the booking,
 * the date field did not render at all for a package that fixed everything,
 * and the client's own words never reached bookings.brief. Each was silent.
 *
 * So this walks one real submission with something in every field and checks
 * each one where it is meant to arrive — the contact, the line, the instance,
 * the classification of the instance AND of the booking, the variable answers,
 * the studio's own intake answers, and the date.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();
const SLUG = `lands-${randomUUID().slice(0, 8)}`;

/*
 * No session, exactly as a client has none. Every other suite mocks this to
 * succeed, which is how a reader that quietly needed one shipped before.
 */
vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => {
    throw new Error('No organization found. Please complete studio setup at /create-studio');
  },
  getOptionalAuthOrgId: async () => null,
}));

import { submitBookingForm } from '@/app/book/[slug]/[packageId]/actions';
import { seedStudio, seedRow } from './seed';
import { PURGE_ORDER } from './purge';

const QUESTION = { id: 'q_referral', type: 'text' as const, label: 'How did you hear about us?' };
const WHEN = '2026-11-19T14:00:00.000Z';

let packageId = '';
let birthdayId = '';
let convocationId = '';
let occasionDimId = '';
let hoursVariableId = '';
let bookingId = '';

describe('a booking taken on the public page', () => {
  beforeAll(async () => {
    await seedStudio({
      orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Landing Studio', slug: SLUG,
    });

    const domain = await seedRow('service_domains', { organization_id: TEST_ORG_ID, name: 'Photography' });
    const service = await seedRow('services', {
      organization_id: TEST_ORG_ID, service_domain_id: domain.id, name: 'Sitting', status: 'active',
    });

    /* Something the package leaves open for the client to answer. */
    const hours = await seedRow('variables', {
      organization_id: TEST_ORG_ID, service_id: service.id,
      key: 'hours', label: 'Coverage hours', kind: 'number', options: [], position: 0,
    });
    hoursVariableId = hours.id;

    /* A classification the package narrows to TWO values — still a question. */
    const dimension = await seedRow('dimensions', {
      organization_id: TEST_ORG_ID, service_domain_id: domain.id,
      name: 'Occasion', question: 'What occasion is it for?', position: 0,
    });
    occasionDimId = dimension.id;
    await seedRow('service_domain_dimensions', {
      organization_id: TEST_ORG_ID, service_domain_id: domain.id,
      dimension_id: dimension.id, position: 0, is_active: true,
    });
    birthdayId = (await seedRow('dimension_values', {
      organization_id: TEST_ORG_ID, dimension_id: dimension.id, name: 'Birthday', position: 0,
    })).id;
    convocationId = (await seedRow('dimension_values', {
      organization_id: TEST_ORG_ID, dimension_id: dimension.id, name: 'Convocation', position: 1,
    })).id;
    for (const id of [birthdayId, convocationId]) {
      await seedRow('service_dimension_values', {
        organization_id: TEST_ORG_ID, service_id: service.id, dimension_value_id: id,
      });
    }

    const pkg = await seedRow('packages', {
      organization_id: TEST_ORG_ID, name: 'A sitting', status: 'active',
      price: { base_price: 50000, currency: 'NGN' },
      form_schema: [QUESTION],
    });
    packageId = pkg.id;
    const bundle = await seedRow('package_services', {
      organization_id: TEST_ORG_ID, package_id: pkg.id, service_id: service.id, position: 0,
    });
    /* Narrowed to both, so the client is still asked which. */
    for (const id of [birthdayId, convocationId]) {
      await seedRow('package_service_dimension_values', {
        organization_id: TEST_ORG_ID, package_service_id: bundle.id, dimension_value_id: id,
      });
    }
    /* Declared open, so the client answers it rather than the studio. */
    await seedRow('package_variable_values', {
      organization_id: TEST_ORG_ID, package_service_id: bundle.id,
      variable_id: hours.id, answered_by: 'client',
    });

    const made = await submitBookingForm(TEST_ORG_ID, packageId, {
      firstName: 'Ada', lastName: 'Obi',
      email: `ada+${randomUUID().slice(0, 8)}@example.com`,
      phone: '08030000000',
      customFields: { [QUESTION.id]: 'A friend' },
      variableAnswers: [{ serviceVariableId: hours.id, value: 3 }],
      chosenClassifications: [birthdayId],
      scheduledFor: WHEN,
    } as any);
    bookingId = made.bookingId;
  }, 240000);

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('records the client, the date and the package', async () => {
    const { data: booking } = await supabaseAdmin
      .from('bookings')
      .select('scheduled_for, metadata, contact:contacts(display_name, email, phone), booking_lines(package_id, price)')
      .eq('id', bookingId).single();
    const b = booking as any;

    expect(b.contact?.display_name).toBe('Ada Obi');
    expect(b.contact?.phone, 'the phone number went nowhere').toBe('08030000000');
    /* The date field lived inside a step that only rendered when the package
       had questions — a package that fixed everything took no date at all. */
    expect(b.scheduled_for, 'the booking took no date').toBeTruthy();
    expect(new Date(b.scheduled_for).toISOString()).toBe(WHEN);
    expect(b.booking_lines.length, 'nothing was put on the booking').toBe(1);
    expect(b.metadata?.source).toBe('public_booking_page');
  }, 120000);

  it('points the line at its own copy, priced as sold', async () => {
    const { data: line } = await supabaseAdmin
      .from('booking_lines')
      .select('package_id, package:packages(name, status, instance_of, price)')
      .eq('organization_id', TEST_ORG_ID).eq('booking_id', bookingId).single();
    const instance = (line as any).package;

    expect((line as any).package_id, 'the booking shares the catalogue row').not.toBe(packageId);
    expect(instance.status, 'the instance would show in the catalogue').toBe('custom');
    expect(instance.instance_of).toBe(packageId);
    expect(Number(instance.price?.base_price), 'the instance lost the price').toBe(50000);
  }, 120000);

  it('classifies BOTH the instance and the booking by what they chose', async () => {
    const { data: line } = await supabaseAdmin
      .from('booking_lines').select('package_id')
      .eq('organization_id', TEST_ORG_ID).eq('booking_id', bookingId).single();

    /* The instance, narrowed one step further down the same chain. */
    const { data: onInstance } = await supabaseAdmin
      .from('package_service_dimension_values')
      .select('dimension_value_id, package_service:package_services!inner(package_id)')
      .eq('organization_id', TEST_ORG_ID)
      .eq('package_service.package_id', (line as any).package_id);
    expect(
      (onInstance || []).map((r: any) => r.dimension_value_id),
      'the instance was not narrowed to what the client chose',
    ).toEqual([birthdayId]);

    /*
     * AND THE BOOKING ITSELF. This is the one that was missing:
     * booking_dimension_values was seeded only from answers.dimensions, which
     * the custom path fills and the package path does not — so a client who
     * chose Birthday while booking a package narrowed the instance correctly
     * and left the booking classified as nothing. The edit page then showed
     * "Not said" for a question they had just answered.
     */
    const { data: onBooking } = await supabaseAdmin
      .from('booking_dimension_values')
      .select('dimension_id, dimension_value_id')
      .eq('organization_id', TEST_ORG_ID).eq('booking_id', bookingId);
    expect((onBooking || []).length, 'the booking carries no classification of its own').toBe(1);
    expect((onBooking as any)[0].dimension_value_id).toBe(birthdayId);
    expect((onBooking as any)[0].dimension_id).toBe(occasionDimId);
  }, 120000);

  it('keeps what they answered of what the package left open', async () => {
    const { data: held } = await supabaseAdmin
      .from('booking_line_variable_values')
      .select('variable_id, value, source')
      .eq('organization_id', TEST_ORG_ID);
    const hours = (held || []).find((h: any) => h.variable_id === hoursVariableId) as any;
    expect(hours, 'the open variable’s answer went nowhere').toBeTruthy();
    expect(Number(hours.value)).toBe(3);
    expect(hours.source, 'the client’s answer was not attributed to them').toBe('client');
  }, 120000);

  it('keeps the studio’s own intake answer', async () => {
    const { data: booking } = await supabaseAdmin
      .from('bookings').select('metadata').eq('id', bookingId).single();
    expect(
      (booking as any).metadata?.form_responses?.[QUESTION.id],
      'the answer to the studio’s own question was dropped',
    ).toBe('A friend');
  }, 120000);
});
