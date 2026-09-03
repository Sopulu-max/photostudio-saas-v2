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
  listVariablesForDeliverables, declareDeliverableVariable, removeDeliverableVariable,
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
  /*
   * What a deliverable needs settling. The THIRD owner of a variable, beside a
   * service and a classification — not a third mechanism. A jsonb spec_schema
   * was that third mechanism, and it was smaller and worse than the one that
   * already existed.
   */
  listVariablesForDeliverables, declareDeliverableVariable, removeDeliverableVariable,
};
