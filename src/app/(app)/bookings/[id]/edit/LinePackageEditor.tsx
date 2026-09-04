'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PackageFieldsEditor } from '../../../packages/[id]/PackageFieldsEditor';
import { updatePackage } from '@/modules/packages/interface';
import { giveLineItsOwnPackage } from '@/modules/bookings/interface';
import { toast, readableError } from '@/components/Toast';

/**
 * WHAT THIS BOOKING IS ACTUALLY FOR, EDITABLE FROM THE BOOKING.
 *
 * A booking line points at a package INSTANCE — this engagement's own private
 * copy, made so the studio can go on editing its catalogue without rewriting
 * what a client was already quoted. That instance is where everything about
 * what was agreed lives: the services bundled, the deliverables promised, the
 * classifications narrowed, the variables fixed or left open, the price.
 *
 * All of it was reachable in exactly one place — the internal new-booking form,
 * during creation. Once a booking existed, the edit page offered a name
 * dropdown and a variables form, and nothing else. Which meant a booking that
 * arrived through the public link — one that never passed through that form —
 * could never have its classifications answered or corrected at all: whatever
 * the client picked, or nothing, was permanent. The configuration surface
 * belonged to the form that happened to create the booking rather than to the
 * booking, so anything not born there could not be configured.
 *
 * So the editor that already exists for a package is rendered here, against the
 * line's own instance. Not a second editor that would drift from it — the same
 * component /packages/[id]/edit and the new-booking form both use, handed the
 * same catalogues by the same loader.
 *
 * IT ANSWERS RATHER THAN DEFINES, when there is a catalogue package behind it.
 * derivedFrom is what tells the editor so: off the shelf, what the package IS
 * gets stated rather than asked, and what it left open stays editable. That is
 * 02-ONTOLOGY's own line — booking facts are what is true of this one
 * engagement, never used to define the layers above — and editing an instance
 * cannot touch the catalogue row it came from.
 *
 * CLOSED UNTIL ASKED FOR. A booking with three packages would otherwise open
 * three full editors, and the page is mostly used to change a date.
 */
export function LinePackageEditor({
  bookingId,
  lineId,
  isOwnCopy,
  packageId,
  status,
  catalogs,
  initial,
  derivedFrom,
  derivedServiceIds,
}: {
  bookingId: string;
  lineId: string;
  /**
   * Whether the package this line points at is the booking's own copy.
   *
   * False for bookings taken before instancing existed, which point straight at
   * the catalogue row. Editing one of those from here would rewrite the package
   * every future booking is sold from, so the editor does not open on it.
   */
  isOwnCopy: boolean;
  packageId: string;
  status?: string;
  catalogs: {
    allServices: any[];
    allVariables: any[];
    allDeliverables: any[];
    dimensionsByDomain: Record<string, { id: string; name: string; values: { id: string; name: string }[] }[]>;
    roleOptions: string[];
    currencyCode: string;
  };
  initial: any;
  /** The catalogue package this one is an instance of, by name. Null if bespoke. */
  derivedFrom: string | null;
  derivedServiceIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  /*
   * Saved without leaving the booking.
   *
   * The editor's own Save ends with router.push('/packages/<id>') — right when
   * the package IS the page, wrong here: it would drop the operator onto the
   * private instance of a package, a page they never asked for and cannot get
   * back from. onSubmitOverride is the seam the editor already provides for
   * exactly this, so the write is the same one, and only where it lands after
   * differs.
   *
   * Questions are deliberately not passed to this editor and so are not saved
   * here: a package's intake questions are what it asks a client AT booking,
   * and this booking has already been taken. The new-booking form leaves them
   * out for the same reason.
   */
  const save = async (payload: any) => {
    try {
      await updatePackage(payload);
      toast.ok('Saved.');
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.bad(readableError(e, 'That could not be saved.'));
      // Left open on failure: closing would hide the edits that did not land.
      throw e;
    }
  };

  /*
   * A line still pointing at the catalogue is offered its own copy first.
   *
   * Not done silently on page load: it writes a row and freezes a list price,
   * and doing that to every old booking somebody merely LOOKED at would be a
   * migration disguised as a page view. It is offered where it matters, said
   * plainly, and taken only when asked for.
   */
  const makeOwnCopy = () => startTransition(async () => {
    try {
      await giveLineItsOwnPackage({ bookingId, lineId });
      toast.ok('This booking now has its own copy.');
      router.refresh();
    } catch (e) {
      toast.bad(readableError(e, 'That could not be copied.'));
    }
  });

  if (!isOwnCopy) {
    return (
      <div className="q-tile-sub q-stack q-stack-sm" style={{ marginTop: '10px' }}>
        <span className="q-meta-sm">
          This line points at the catalogue package itself, not at a copy of it — so changing
          what it includes would change it for every future booking too. Give this booking its
          own copy and it becomes editable here.
        </span>
        <button
          type="button"
          className="q-btn q-btn-secondary q-btn-sm"
          disabled={isPending}
          onClick={makeOwnCopy}
          style={{ alignSelf: 'flex-start' }}
        >
          {isPending ? 'Copying…' : 'Give this booking its own copy'}
        </button>
      </div>
    );
  }

  return (
    <div className="q-stack q-stack-sm" style={{ marginTop: '10px' }}>
      <button
        type="button"
        className="q-btn-ghost q-btn-sm"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ alignSelf: 'flex-start' }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {open ? 'Done configuring' : 'Configure this package'}
      </button>

      {!open && (
        <span className="q-meta-sm">
          What it includes, promises, is classified as, and leaves open.
        </span>
      )}

      {open && (
        <div className="q-card q-section">
          <p className="q-meta" style={{ marginBottom: '14px' }}>
            {derivedFrom
              ? <>This booking&rsquo;s own copy of <strong className="q-strong">{derivedFrom}</strong>. Changes here apply to this booking only — the catalogue package is untouched.</>
              : <>Put together for this booking. It is not in the catalogue, so nothing else uses it.</>}
          </p>
          <PackageFieldsEditor
            mode="edit"
            packageId={packageId}
            status={status}
            currencyCode={catalogs.currencyCode}
            allServices={catalogs.allServices}
            allVariables={catalogs.allVariables}
            allDeliverables={catalogs.allDeliverables}
            dimensionsByDomain={catalogs.dimensionsByDomain}
            roleOptions={catalogs.roleOptions}
            derivedFrom={derivedFrom}
            derivedServiceIds={derivedServiceIds}
            initial={initial}
            onSubmitOverride={save}
          />
        </div>
      )}
    </div>
  );
}
