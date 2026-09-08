import { describe, it, expect } from 'vitest';
import { isUnreachable, dbError, UNREACHABLE_MESSAGE } from '@/kernel/errors';

/**
 * A CONNECTION THAT NEVER OPENED IS NOT A FAILURE OF WHATEVER ASKED FIRST.
 *
 * For an hour the database was unreachable and the New Booking page reported
 * "Failed to load roles". Nothing was wrong with roles — they were simply the
 * first thing to ask. The message named the wrong code, and both the operator
 * and whoever debugs it get sent to the wrong file.
 *
 * The shapes below are copied from what was actually logged during that hour,
 * because supabase-js hands a network failure back in the same PostgrestError
 * shape as a real query error: the transport's complaint stuffed into message
 * and details, with an empty code. The distinction cannot be made on shape, so
 * it is made on content, and content is exactly the kind of thing that rots
 * without a test holding the real strings.
 */

// Verbatim from the server log, mid-outage.
const CONNECT_TIMEOUT = {
  message: 'TypeError: fetch failed',
  details: 'TypeError: fetch failed\n\nCaused by: ConnectTimeoutError: Connect Timeout Error '
    + '(attempted addresses: 104.18.38.10:443, 172.64.149.246:443, timeout: 10000ms) (UND_ERR_CONNECT_TIMEOUT)',
  hint: '',
  code: '',
};

const DNS_GONE = Object.assign(new Error('fetch failed'), {
  cause: Object.assign(new Error('getaddrinfo ENOTFOUND qvscrdunkqkiswxvxbbm.supabase.co'), {
    errno: -3008, code: 'ENOTFOUND', syscall: 'getaddrinfo',
  }),
});

const RESET = Object.assign(new Error('fetch failed'), {
  cause: new Error('read ECONNRESET'),
});

/* A real query error — reached the database, which refused. */
const REAL_QUERY_ERROR = {
  message: 'column packages.asked_for does not exist',
  details: null,
  hint: null,
  code: '42703',
};

describe('telling an unreachable database from a failed query', () => {
  it('recognises what the outage actually looked like', () => {
    expect(isUnreachable(CONNECT_TIMEOUT), 'a connect timeout read as a query failure').toBe(true);
    expect(isUnreachable(DNS_GONE), 'a DNS failure read as a query failure').toBe(true);
    expect(isUnreachable(RESET), 'a dropped socket read as a query failure').toBe(true);
  });

  it('does not claim a genuine query error is a connection problem', () => {
    /*
     * The direction that matters more. Calling a real error a network blip
     * would send somebody to check their wifi while a column is missing —
     * and this one is real: it is the error the booking classification work
     * hit on variables.asked_for.
     */
    expect(isUnreachable(REAL_QUERY_ERROR)).toBe(false);
    expect(isUnreachable(new Error('That answer belongs to a different question.'))).toBe(false);
    expect(isUnreachable(null)).toBe(false);
    expect(isUnreachable(undefined)).toBe(false);
  });

  it('replaces the caller’s message only when the connection is the story', () => {
    expect(dbError('Failed to load roles', CONNECT_TIMEOUT).message).toBe(UNREACHABLE_MESSAGE);
    // A real failure keeps the sentence its caller wrote for the operator.
    expect(dbError('Failed to load roles', REAL_QUERY_ERROR).message).toBe('Failed to load roles');
  });

  it('keeps the cause on the error either way', () => {
    /*
     * The whole point of `cause`: it does not appear in the message, so a
     * toast stays as short as it was, while a stack trace finally names the
     * reason. Database errors are never appended to an operator's sentence.
     */
    expect((dbError('Failed to load roles', REAL_QUERY_ERROR) as any).cause).toBe(REAL_QUERY_ERROR);
    expect((dbError('Failed to load roles', CONNECT_TIMEOUT) as any).cause).toBe(CONNECT_TIMEOUT);
    expect(dbError('Failed to load roles', REAL_QUERY_ERROR).message).not.toMatch(/42703/);
  });

  it('does not loop on an error that causes itself', () => {
    const circular: any = new Error('fetch failed');
    circular.cause = circular;
    expect(() => isUnreachable(circular)).not.toThrow();
    expect(isUnreachable(circular)).toBe(true);
  });
});
