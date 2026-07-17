# Layer 3: Capability Design

## How Capabilities Are Derived

Capabilities are not invented from a feature wishlist. They are derived directly from the Production Lifecycle. Each stage of the lifecycle implies specific things the system must be able to do. If a capability cannot be traced back to a lifecycle stage, it does not belong in the system.

This ensures every capability is structurally connected to every other capability through the lifecycle itself — not bolted on as an afterthought.

---

## Lifecycle-Stage Capabilities

### Stage 1–2: Potential → Intent

The system must be able to capture the moment potential collapses into desire.

| Capability | What It Does |
|---|---|
| **Multi-Channel Intake** | Capture intents from any source — website forms, walk-ins, phone calls, email, social media, referrals. The channel varies; the resulting Intent object is identical. |
| **Service Catalog** | Present the Organization's configured services to the outside world so that potential clients can browse, compare, and self-select. This is rendered by the Visual Engine, not hardcoded. |
| **Intent Recording** | Create and classify an Intent with minimal friction. MVR: a Person + what they want. Progressive enrichment from there. |

---

### Stage 3: Planning

The system must refine raw intent into an executable commitment.

| Capability | What It Does |
|---|---|
| **Discovery & Communication** | Exchange information with the Person — questionnaires, briefs, mood boards, reference material. Understand what they actually need. |
| **Proposal Generation** | Translate intent into a scoped, priced, branded proposal. The proposal is designed using the Visual Engine and pulls pricing/service data from the Production Engine. |
| **Pricing Engine** | Calculate cost based on configured service templates, add-ons, discounts, and custom adjustments. Support multiple pricing models (flat, hourly, tiered, per-deliverable). |
| **Availability Preview** | Show the Person (or the Configurator) what dates, staff, and resources are available before commitment. |

---

### Stage 4: Orchestration

The system must coordinate everything needed to make execution possible.

| Capability | What It Does |
|---|---|
| **Agreement Management** | Generate formal commitments — contracts, terms, scope documents. Support digital signature. Enforce versioning (modification never overwrites). |
| **Financial Transaction Engine** | Generate invoices, process deposits, track payments, handle refunds. Every money movement is a Financial Transaction linked to an Agreement. |
| **Scheduling & Calendar** | Block time for staff, resources, and locations. Prevent double-booking. Visualize availability across the Organization. |
| **Resource Reservation** | Reserve specific resources (gear, spaces, vehicles) for specific workflow stages. Automatically flag conflicts. |
| **Staff Assignment** | Assign Persons (in their Operator role) to specific tasks within the workflow. Match by skill, availability, and workload. |
| **Dependency Resolution** | Map dependencies between workflow stages. Stage B cannot start until Stage A's assets are available. This is asset-mediated, not scheduler-mediated. |

---

### Stage 5: Production

The system must execute configurable workflows and track the creation of value.

| Capability | What It Does |
|---|---|
| **Workflow Engine** | Execute an ordered sequence of stages. Each stage has entry conditions, assigned persons, required resources, and exit conditions. Studios configure the stages; the engine executes them. |
| **Task Management** | Create, assign, and track discrete units of work within each workflow stage. |
| **Resource Checkout** | Track which resources are currently in use, by whom, and for which workflow. Handle check-out and check-in. |
| **Time Tracking** | Log hours worked by each Person on each task. Feed payroll and profitability calculations. |
| **Asset Ingestion** | Upload, tag, and register assets produced during each workflow stage. Assets become available for consumption by downstream stages. |
| **Progress Tracking** | Visualize where each active workflow stands. Which stages are complete, which are in progress, which are blocked. |

---

### Stage 6: Evaluation

The system must enforce quality before value is transferred.

| Capability | What It Does |
|---|---|
| **Internal Review** | Allow Operators and Configurators to review produced assets against the original intent and professional standards. |
| **Approval Chains** | Support configurable, multi-step approval workflows. Some studios need only manager sign-off. Others need client approval, then legal review, then final sign-off. |
| **Client Approval Portal** | Give the external Person a branded interface (designed via the Visual Engine) to review, comment on, request revisions to, and formally approve deliverables. |
| **Revision Tracking** | Track revision requests, their resolution, and the version history of assets as they move through review cycles. |

---

### Stage 7: Delivery

The system must transfer value to the recipient in a premium, branded experience.

| Capability | What It Does |
|---|---|
| **Deliverable Packaging** | Organize approved assets into a coherent delivery — a gallery, a download package, a streaming page, a physical shipment order. |
| **Delivery Experience Design** | The Configurator uses the Visual Engine to design the delivery interface. This is not a generic file-sharing link. It is a branded, designed experience. |
| **Secure Sharing** | Password protection, expiration dates, download limits, watermarking for unpurchased assets. |
| **Commerce & Upsell** | Embed purchasing capabilities directly into the delivery experience — prints, albums, licensing, additional edits. Every purchase generates a Financial Transaction in the same ledger. |
| **Fulfillment Routing** | Route physical product orders (prints, albums) to external fulfillment partners (print labs, manufacturers) automatically. |

---

### Stage 8: Archive

The system must preserve organizational memory.

| Capability | What It Does |
|---|---|
| **Project Archival** | Store the complete record of every production cycle — who was involved, what was produced, what was paid, how long it took, what resources were used. |
| **Asset Storage** | Long-term storage and organization of all produced and provided assets — RAW files, finals, project files, contracts. |
| **Relational Preservation** | Maintain the full graph of relationships. Two years later, the system knows that Person X had Agreement Y, fulfilled by Workflow Z, producing Assets A, B, C. |
| **Compliance & Legal** | Retain contracts, consent forms, financial records for legal and tax compliance. |

---

### Stage 9: Learning

The system must surface insights that improve future production cycles.

| Capability | What It Does |
|---|---|
| **Operational Analytics** | Average turnaround time per service. Workflow stage bottlenecks. Resource utilization rates. Staff productivity. |
| **Financial Analytics** | Revenue per service type. Profit margins. Outstanding receivables. Cost per production cycle. |
| **Client Analytics** | Lifetime value. Repeat booking rate. Satisfaction indicators. Referral tracking. |
| **Insight Surfacing** | Proactively surface patterns: "Wedding packages with Photographer A average 12 days faster than with Photographer B." "Your most profitable service is Headshots at 73% margin." |
| **Feedback Integration** | Capture client feedback (surveys, NPS, reviews) and link it to specific production cycles for contextual analysis. |

---

## Cross-Cutting Capabilities

These capabilities span the entire lifecycle. They are not tied to a single stage.

| Capability | What It Does |
|---|---|
| **Identity & Access Management** | Roles, permissions, and authentication. The Configurator sees everything. The Operator sees their assignments. The Recipient sees their deliverables. |
| **Unified Financial Ledger** | Every Financial Transaction — from initial deposit to print store purchase to expense reimbursement — lives in one ledger. No separate "accounting system." |
| **People Management (CRM)** | The complete, progressively enriched record of every Person who has ever interacted with the Organization. History, preferences, lifetime value, communication log. |
| **Resource Management** | The unified inventory of all non-human resources. Availability, maintenance schedules, depreciation, utilization rates. |
| **Notification & Communication** | System-generated notifications (intent received, payment processed, task assigned) and direct communication (messaging, email) — all logged and linked to the relevant entities. |
| **The Ubiquitous Visual Engine** | The heavy design canvas. Available at any stage where presentation is needed — proposals, storefronts, galleries, invoices. |
| **Event System** | Every state mutation emits an event. This is the audit trail, the organizational memory, and the foundation for automation triggers. |
| **Search & Navigation** | Fast, global search across all entities. The studio must be able to find any Person, Agreement, Asset, or Workflow instantly. |
| **Automation Engine** | Configurable triggers and actions. "When an Agreement is activated, automatically generate an Invoice for the deposit amount." "11 months after Delivery, send the Person a promotional email." |
