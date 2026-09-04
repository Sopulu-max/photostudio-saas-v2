import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * A booking gets its own package, whoever made the booking.
 *
 * WHY. The rule — a booking points at a private instance, so the studio can go
 * on editing its catalog without rewriting what a client was already quoted —
 * was written inside NewBookingForm.tsx, a browser component. Only bookings
 * made on that screen obeyed it. The public booking page is a different screen,
 * so a public booking pointed straight at the catalog row and the intake step
 * then wrote back over it: `linePrice` was initialised to `{}`, never
 * reassigned, and `{}` is truthy, so every public booking blanked the price of
 * the package that had just been booked.
 *
 * That is the shape of bug this file exists for. Not "does instancing work" —
 * "do BOTH ways in obey the same rule", which is the question a rule living in
 * one screen can never answer.
 *
 * The public half runs the real public entry point with the organization passed
 * in and no session, because that arrangement is the one that was broken.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'instancing', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'instancing', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import { createService } from '@/modules/services/domain';
import { createPackage, updatePackage, listPackages, instantiatePackageForBooking } from '@/modules/packages/domain';
import { submitBookingForm } from '@/app/book/[slug]/[packageId]/actions';
import { updateBookingLine, giveLineItsOwnPackage, addBookingLine, createBooking } from '@/modules/bookings/domain';
import { PURGE_ORDER } from './purge';

const CATALOG_PRICE = { base_price: 200000, currency: 'NGN' };

let catalogPackageId = '';

/** The catalog row, read raw — the thing that must survive a public booking. */
const readCatalog = async () => {
  const { data } = await supabaseAdmin
    .from('packages').select('name, price, status').eq('id', catalogPackageId).single();
  return data as { name: string; price: any; status: string };
};

describe('A booking gets its own package', () => {
  beforeAll(async () => {
    await supabaseAdmin.from('organizations').insert({
      id: TEST_ORG_ID, name: 'Instancing Studio', slug: `instancing-${randomUUID().slice(0, 8)}`, status: 'active',
    });
    await supabaseAdmin.from('contacts').insert({
      id: TEST_PERSON_ID, organization_id: TEST_ORG_ID, display_name: 'Instancing Owner',
    });
    // Same keys in every object, or PostgREST answers PGRST102 and the failure
    // surfaces much later as "this studio has no booking stages configured".
    const { error: stageError } = await supabaseAdmin.from('booking_stages').insert([
      { organization_id: TEST_ORG_ID, name: 'Enquiry', kind: 'enquiry', position: 0, is_default: true },
      { organization_id: TEST_ORG_ID, name: 'Booked', kind: 'booked', position: 1, is_default: false },
    ]);
    if (stageError) throw new Error(`Could not seed booking stages: ${stageError.message}`);

    const { serviceId } = await createService({
      name: 'Portrait Session', serviceDomain: 'Photography', primaryDeliverable: 'Edited image',
    });
    const { packageId } = await createPackage({
      name: 'Golden Hour Portrait',
      serviceIds: [serviceId],
      price: CATALOG_PRICE,
    });
    catalogPackageId = packageId;
  });

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('leaves the catalog package untouched when the public books it', async () => {
    const before = await readCatalog();
    expect(Number(before.price?.base_price), 'the fixture was not priced').toBe(200000);

    const { bookingId } = await submitBookingForm(TEST_ORG_ID, catalogPackageId, {
      firstName: 'Adaeze', lastName: 'Nwoke',
      email: `adaeze+${randomUUID().slice(0, 8)}@example.com`,
      phone: '', customFields: {},
    });
    expect(bookingId, 'the public form made no booking').toBeTruthy();

    // The regression, stated plainly. Before the fix this read `{}`.
    const after = await readCatalog();
    expect(Number(after.price?.base_price), 'a public booking blanked the catalog price').toBe(200000);
    expect(after.name, 'a public booking renamed the catalog package').toBe(before.name);
    expect(after.status, 'a public booking took the package out of the catalog').toBe('active');
  }, 60000);

  it('points that booking at an instance, not at the catalog row', async () => {
    const { data: line } = await supabaseAdmin
      .from('booking_lines')
      .select('package_id, package:packages(name, price, status)')
      .eq('organization_id', TEST_ORG_ID)
      .not('package_id', 'is', null)
      .limit(1)
      .maybeSingle();

    expect(line, 'the public booking produced no line with a package').toBeTruthy();
    // The whole point: a different row, so editing the catalog later cannot
    // reach back into a booking that has already been quoted.
    expect(line!.package_id, 'the booking shares the catalog row').not.toBe(catalogPackageId);

    const instance = line!.package as any;
    expect(instance.status, 'the instance would show up in the catalog').toBe('custom');
    // Named exactly as it was sold, because this name is what prints on the
    // client's invoice. Status is what makes it an instance, not a suffix.
    expect(instance.name, 'the instance renamed what the client booked').toBe('Golden Hour Portrait');
    // duplicatePackage never copied price, so this is the assertion that the
    // instance carries the quote rather than being silently free.
    expect(Number(instance.price?.base_price), 'the instance lost the price').toBe(200000);
  }, 60000);

  it('keeps instances out of the catalog listing', async () => {
    const listed = await listPackages();
    expect(listed.map((p: any) => p.name), 'the catalog lost the package it sells')
      .toContain('Golden Hour Portrait');
    // Counted rather than matched on the name: an instance is named identically
    // to what it came from, so only the number of rows can tell them apart.
    expect(listed.length, 'the instance turned up in the catalog alongside its source').toBe(1);

    const { count } = await supabaseAdmin
      .from('packages').select('id', { count: 'exact', head: true })
      .eq('organization_id', TEST_ORG_ID);
    expect(count, 'there should be the catalog package and one instance of it').toBe(2);
  }, 60000);

  /*
   * The isolation, stated as the studio stated it: nothing done to a package
   * inside a booking may change the catalog, and nothing done to the catalog may
   * change a booking that has already been taken.
   *
   * Both directions, because they fail for different reasons. Forward fails when
   * a booking writes to the row it merely pointed at. Backward fails when a
   * booking only ever REFERENCED the catalog, so the catalog moving underneath
   * it silently reprices work already agreed. Instancing is what makes both
   * impossible, and these are the two assertions that keep it that way.
   */
  describe('a booking and the catalog cannot reach each other', () => {
    it('editing the booking’s package leaves the catalog alone', async () => {
      const { data: line } = await supabaseAdmin
        .from('booking_lines').select('id, booking_id, package_id')
        .eq('organization_id', TEST_ORG_ID).not('package_id', 'is', null).limit(1).maybeSingle();
      expect(line?.package_id, 'no instanced line to test with').toBeTruthy();

      // Exactly what an operator does on the booking: rename the line and change
      // what it costs.
      await updateBookingLine({
        lineId: line!.id,
        bookingId: line!.booking_id,
        title: 'Renamed inside the booking',
        basePrice: 999,
      });

      const catalog = await readCatalog();
      expect(catalog.name, 'the booking renamed the catalog package').toBe('Golden Hour Portrait');
      expect(Number(catalog.price?.base_price), 'the booking repriced the catalog package').toBe(200000);

      // And the change did land — otherwise this passes by doing nothing.
      const { data: instance } = await supabaseAdmin
        .from('packages').select('name, price').eq('id', line!.package_id!).single();
      expect((instance as any).name).toBe('Renamed inside the booking');
      expect(Number((instance as any).price?.base_price)).toBe(999);
    }, 60000);

    it('editing the catalog leaves a booking already taken alone', async () => {
      const { data: line } = await supabaseAdmin
        .from('booking_lines').select('id, package_id')
        .eq('organization_id', TEST_ORG_ID).not('package_id', 'is', null).limit(1).maybeSingle();

      const before = await supabaseAdmin
        .from('packages').select('name, price').eq('id', line!.package_id!).single();

      // The studio puts its prices up, months after this booking was taken.
      await updatePackage({
        packageId: catalogPackageId,
        name: 'Golden Hour Portrait (2027 rates)',
        price: { base_price: 350000, currency: 'NGN' },
      });

      const after = await supabaseAdmin
        .from('packages').select('name, price').eq('id', line!.package_id!).single();
      expect((after.data as any).name, 'a catalog rename reached into a taken booking')
        .toBe((before.data as any).name);
      expect(Number((after.data as any).price?.base_price), 'a catalog price rise repriced a taken booking')
        .toBe(Number((before.data as any).price?.base_price));

      // Put it back so the earlier assertions in this file stay meaningful if
      // the order ever changes.
      await updatePackage({
        packageId: catalogPackageId,
        name: 'Golden Hour Portrait',
        price: CATALOG_PRICE,
      });
    }, 60000);
  });




  it('a package added to an existing booking gets its own copy too', async () => {
    /*
     * THE THIRD TIME THIS RULE WAS MISSED.
     *
     * It was written inside NewBookingForm, so only bookings made on that
     * screen obeyed it. Then again in the public booking path. addBookingLine —
     * the ordinary way to correct a booking after the fact, and the only way
     * available on the edit page — obeyed neither, and pointed the line
     * straight at the catalogue row. A later catalogue edit then rewrote what a
     * client had already been quoted, which is the exact failure this whole
     * file exists to prevent.
     */
    const { bookingId } = await createBooking({ brief: 'Corrected after the fact' });
    await addBookingLine({ bookingId, packageId: catalogPackageId, title: 'Golden Hour Portrait' });

    const { data: line } = await supabaseAdmin
      .from('booking_lines')
      .select('package_id, package:packages(status, instance_of, price)')
      .eq('booking_id', bookingId).single();

    expect(line!.package_id, 'a package added later still points at the catalogue row')
      .not.toBe(catalogPackageId);
    expect((line!.package as any).instance_of, 'the copy does not say what it came from')
      .toBe(catalogPackageId);
    expect((line!.package as any).status).toBe('custom');
    // And it was sold at the catalogue's price, not at nothing.
    expect(Number((line!.package as any).price?.base_price))
      .toBe(Number(CATALOG_PRICE.base_price));

    // A second line of the same package is its own copy again, not a shared one.
    await addBookingLine({ bookingId, packageId: catalogPackageId, title: 'Second sitting' });
    const { data: both } = await supabaseAdmin
      .from('booking_lines').select('package_id').eq('booking_id', bookingId);
    const ids = (both || []).map((l: any) => l.package_id);
    expect(new Set(ids).size, 'two lines ended up sharing one package').toBe(2);
  }, 120000);

  it('gives a line pointing at the catalogue its own copy, on request', async () => {
    /*
     * BOOKINGS TAKEN BEFORE THE RULE EXISTED.
     *
     * A line is supposed to point at a private instance. Bookings made before
     * that point straight at the catalogue row, and this database still holds
     * one. Harmless while nothing could edit a booking's package — and not
     * harmless at all now that the booking's own edit page can, because
     * changing "what this booking includes" would rewrite the package every
     * future booking is sold from.
     *
     * So the editor refuses to open on a catalogue row and offers this, which
     * has to leave the catalogue untouched while making the line editable.
     */
    const { bookingId } = await createBooking({ brief: 'An old booking' });
    /*
     * Written straight into the table, because addBookingLine will not make one
     * of these any more — that is the fix. This is what the rows left behind by
     * the old behaviour look like, and they are the reason this operation
     * exists at all.
     */
    const { error: legacyError } = await supabaseAdmin.from('booking_lines').insert({
      organization_id: TEST_ORG_ID,
      booking_id: bookingId,
      package_id: catalogPackageId,
      title: 'Golden Hour Portrait',
      price: {},
    });
    expect(legacyError, 'could not seed a legacy catalogue-pointing line').toBeFalsy();

    const { data: before } = await supabaseAdmin
      .from('booking_lines').select('id, package_id').eq('booking_id', bookingId).single();
    expect(before!.package_id, 'the line did not start on the catalogue row').toBe(catalogPackageId);

    const { packageId: instanceId, alreadyPrivate } = await giveLineItsOwnPackage({
      bookingId, lineId: before!.id,
    });
    expect(alreadyPrivate, 'a catalogue row was mistaken for a private copy').toBe(false);
    expect(instanceId, 'the line was left on the catalogue row').not.toBe(catalogPackageId);

    const { data: after } = await supabaseAdmin
      .from('booking_lines').select('package_id').eq('id', before!.id).single();
    expect(after!.package_id, 'the line was not repointed at its own copy').toBe(instanceId);

    const { data: copy } = await supabaseAdmin
      .from('packages').select('status, instance_of').eq('id', instanceId).single();
    expect(copy!.status, 'the copy went into the catalogue').toBe('custom');
    expect(copy!.instance_of, 'the copy does not say what it came from').toBe(catalogPackageId);

    // The catalogue row is untouched, which is the entire point.
    const catalog = await readCatalog();
    expect(catalog.status, 'the catalogue package was altered').toBe('active');
    expect(catalog.name).toBe('Golden Hour Portrait');

    // And asking twice is not an error — two operators clicking it at once is
    // not a failure, and the second one gets what they wanted.
    const again = await giveLineItsOwnPackage({ bookingId, lineId: before!.id });
    expect(again.alreadyPrivate, 'a private copy was copied again').toBe(true);
    expect(again.packageId).toBe(instanceId);
  }, 120000);

  it('refuses to instantiate a package from another studio', async () => {
    const otherOrg = randomUUID();
    await supabaseAdmin.from('organizations').insert({ id: otherOrg, name: 'Not Ours', status: 'active' });
    try {
      // The public path passes an org id from a URL slug, so this is the check
      // that a hand-edited request cannot clone someone else's catalog.
      await expect(instantiatePackageForBooking({
        packageId: catalogPackageId, organizationId: otherOrg,
      })).rejects.toThrow();
    } finally {
      await supabaseAdmin.from('packages').delete().eq('organization_id', otherOrg);
      await supabaseAdmin.from('organizations').delete().eq('id', otherOrg);
    }
  }, 60000);
});
