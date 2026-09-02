import { describe, it, expect } from 'vitest';
import { carriedClassifications } from '@/app/(app)/bookings/NewBookingForm';

/**
 * THE FILTER THAT FOUND A PACKAGE ANSWERS THE QUESTION IT WAS FOUND BY.
 *
 * An operator narrows the booking form's catalogue to Birthday, picks the
 * package that comes back, and is then asked "What occasion is it for?" with
 * nothing filled in. They just said. Left untouched the booking saved
 * classified as nothing — not a failure to save, a failure to have asked once.
 *
 * The dangerous half is the exclusion. Narrowing happens twice on the way down:
 * the studio declares six occasions, a package is for three of them, and a
 * booking is for one. A filtered value that the package excludes must not carry
 * — and not merely because it would be wrong. The select only offers what the
 * package permits, so an excluded id would render as an empty box while
 * submitting as Birthday. A control showing one thing and sending another is
 * worse than the gap this closes, which is why that case is pinned first.
 */

const occasion = 'dim-occasion';
const context = 'dim-context';

/** A package for weddings and convocations. It is not for birthdays. */
const openOccasion = {
  dimensionId: occasion,
  values: [{ id: 'val-wedding' }, { id: 'val-convocation' }],
};

describe('carrying the catalogue filter into the booking’s answers', () => {
  it('refuses a value the package does not permit', () => {
    // Filtered by Birthday; this package is not for birthdays. It can happen —
    // the filter matches on what a package's services allow, and a package can
    // come back for reasons other than the dimension being narrowed.
    const carried = carriedClassifications({ [occasion]: 'val-birthday' }, [openOccasion]);
    expect(carried, 'a value the package excludes was carried into the booking').toEqual({});
  });

  it('carries a value the package does permit', () => {
    const carried = carriedClassifications({ [occasion]: 'val-wedding' }, [openOccasion]);
    expect(carried, 'the question the operator already answered was left blank')
      .toEqual({ [occasion]: 'val-wedding' });
  });

  it('carries nothing when nothing was filtered', () => {
    expect(carriedClassifications({}, [openOccasion])).toEqual({});
    // An empty string is the "Any" option, not an answer.
    expect(carriedClassifications({ [occasion]: '' }, [openOccasion])).toEqual({});
  });

  it('ignores classifications the package already fixed', () => {
    /*
     * A package that settled its Context is not asked about it, so it is not in
     * the open list at all. The filter having a value for it is irrelevant —
     * the instance already carries the package's own answer, and inventing a
     * second one here would be the booking overruling the package.
     */
    const carried = carriedClassifications(
      { [occasion]: 'val-wedding', [context]: 'val-outdoor' },
      [openOccasion],
    );
    expect(carried).toEqual({ [occasion]: 'val-wedding' });
  });

  it('carries each open classification independently', () => {
    const openContext = { dimensionId: context, values: [{ id: 'val-outdoor' }] };
    const carried = carriedClassifications(
      { [occasion]: 'val-birthday', [context]: 'val-outdoor' },
      [openOccasion, openContext],
    );
    // Occasion is excluded, Context is permitted. One being refused must not
    // take the other down with it.
    expect(carried).toEqual({ [context]: 'val-outdoor' });
  });

  it('survives a package that offers no answers, and an absent list', () => {
    expect(carriedClassifications({ [occasion]: 'val-wedding' },
      [{ dimensionId: occasion, values: [] }])).toEqual({});
    expect(carriedClassifications({ [occasion]: 'val-wedding' },
      undefined as any)).toEqual({});
    expect(carriedClassifications({ [occasion]: 'val-wedding' },
      [{ dimensionId: occasion } as any])).toEqual({});
  });

  it('does not carry a narrower value in place of the one offered', () => {
    /*
     * Beach may well be a kind of Outdoor, and a studio that nested them meant
     * something by it. But the package offers Outdoor, so Outdoor is the answer
     * it can represent — quietly turning a filter into a different word is a
     * decision for whoever is taking the booking, not for this.
     */
    const carried = carriedClassifications({ [context]: 'val-beach' },
      [{ dimensionId: context, values: [{ id: 'val-outdoor' }] }]);
    expect(carried).toEqual({});
  });
});
