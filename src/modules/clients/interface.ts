/**
 * Clients — public interface. The only door in.
 * Other modules reference a client's contact by id; CRM depth stays inside.
 */
export { createClient, listClients } from './domain';
