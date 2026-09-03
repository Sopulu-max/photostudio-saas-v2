/**
 * Deliverables — public interface. The only door in.
 *
 * Owns the studio's vocabulary of DELIVERABLES: the kinds of thing its work
 * produces, each belonging to one service domain.
 *
 * The blueprint calls this level an "output type" and reserves "deliverable"
 * for the quantified promise a package makes. That distinction is real in the
 * model — a package still specifies quantity, unit and spec on top of a kind —
 * but it is not the word a studio says out loud, and the interface speaks the
 * studio's language. One word, on every page and in every error.
 *
 * It also owns delivery containers — the vessels that carry finished work to a
 * client without transforming it.
 */
import {
  listDeliverables, listDeliverablesByDomain, createDeliverable, renameDeliverable,
  deleteDeliverable, getDeliverable, updateDeliverableConfig,
  listDeliveryContainers, createDeliveryContainer, renameDeliveryContainer,
  deleteDeliveryContainer,
  listDeliverableIdsForService, setDeliverablesForService,
  copyDeliverablesBetweenServices,
} from './domain';
export type { Deliverable } from './domain';
export {
  listDeliverables, listDeliverablesByDomain, createDeliverable, renameDeliverable,
  deleteDeliverable, getDeliverable, updateDeliverableConfig,
  listDeliveryContainers, createDeliveryContainer, renameDeliveryContainer,
  deleteDeliveryContainer,
  // The service edge. Services says WHICH deliverables one of its services
  // offers; this module is what attaches them, because it is what defines them.
  listDeliverableIdsForService, setDeliverablesForService,
  copyDeliverablesBetweenServices,
};
