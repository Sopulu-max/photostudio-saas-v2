/**
 * OVERVIEW - the studio read across its parts.
 *
 * A reading module: it owns no table and decides nothing. Every fact comes
 * from the module that owns it, through that module's own interface, which is
 * why this one may import the others while none of them imports it.
 */
export { readStudioOverview, readStudioOwed } from './studio';
export type { StudioOverview, StudioPart, StudioToday } from './studio';
