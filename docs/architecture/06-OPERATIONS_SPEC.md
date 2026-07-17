# 06. Operations Specification

This document defines the invariants governing all state mutations in the Production Engine. These are Level 1 engine rules. They apply to every studio regardless of domain.

## Global Invariants

1. **Single-Tenant Scope.** Every operation is scoped to one Organization.
2. **Mandatory Event Emission.** Every state mutation emits an event to the Organization's event log. This is the foundation of organizational memory and Learning.
3. **No Deletion.** Nothing is ever deleted. Entities are archived, versioned, or released. Never erased.
4. **Versioning Over Overwrite.** Modifications (especially to Agreements) create a new version. History is always preserved.
5. **MVR Always Accepted.** Every entity must be constructible at its Minimum Viable Representation. Completeness is never a blocker for creation.
6. **State Machines Enforced.** Operations must enforce legal lifecycle transitions. An Intent cannot skip Agreement and jump to a Workflow. A Financial Transaction cannot go from Created to Voided without passing through Pending.

## Asset-Mediated Dependencies

Dependencies between Workflow stages are handled through Assets, not through a scheduler.

A Workflow stage's `start` transition requires all consumed Assets to exist and be in the `Available` state. If the required Assets do not exist, the stage rests in `Waiting: awaiting_assets`.

Example: An album design stage cannot start until the photography stage produces the required image Assets. The dependency is the data itself.

## Operations as Composition

Complex scenarios are handled by composing primitive operations, not by inventing new ones.

- **Walk-in quick sale:** Compose CreateIntent + CreateAgreement + CreateFinancialTransaction in one UI gesture.
- **B2B outsourcing:** Organization B runs the normal chain with A as the Person. Then Organization A calls RegisterAsset with cross-org provenance. Outsourcing requires no dedicated operation.
