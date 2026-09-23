'use server';

import { readBookingsMonth, type BookingsMonth } from '@/modules/bookings/month';

/**
 * WHAT THE BOOKINGS PAGE STILL ASKS THE SERVER FOR, once it has the book.
 *
 * Everything the page reads of its own rows happens in the browser - the tabs,
 * the cut, the grouping, the sort, the search - because the rows arrived with
 * the page and none of those questions needs the database again.
 *
 * Another month is different: which days the studio keeps, and the hours it
 * keeps them, are resolved in Postgres so the precedence between a named date,
 * an nth weekday and the ordinary week is written once (kernel/studioHours).
 * That is a fact the browser does not have, so the calendar fetches it - one
 * small action, not a page load, and the rest of the page stays where it is.
 */
export async function monthFrame(month: string): Promise<BookingsMonth> {
  return readBookingsMonth(month);
}
