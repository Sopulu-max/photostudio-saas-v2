# Layer 5: Information Architecture (Data Model)

## Purpose

This layer answers: What data exists? How is it organized? Which entities own which information? How do entities relate?

This is the database-level truth. It translates the Level 1 kernel primitives and the Level 2 extensions into a concrete data model that the Production Engine stores and the Visual Engine reads from.

---

## The Entity-Relationship Model

### Core Entities (Level 1)

These are the immutable database tables. Every Organization has them.

```
┌──────────────┐
│ Organization │
└──────┬───────┘
       │ has many
       ├──────────────► Person
       ├──────────────► Resource
       ├──────────────► Intent
       ├──────────────► Agreement
       ├──────────────► Workflow
       ├──────────────► Asset
       ├──────────────► Financial Transaction
       └──────────────► Event Log
```

### Entity Ownership Rules

| Entity | Owned By | Created By |
|---|---|---|
| Organization | — (root) | System |
| Person | Organization | Configurator or self-registration |
| Resource | Organization | Configurator |
| Intent | Organization | Recipient (Person in client role) |
| Agreement | Organization | System (from accepted Intent) |
| Workflow | Organization | System (spawned by Agreement) |
| Task | Workflow | System (from workflow template) |
| Asset | Organization | Operator (produced) or Recipient (provided) |
| Deliverable | Organization | System (from approved Asset) |
| Financial Transaction | Organization | System (from Agreement rules) |

### Key Relationships

```
Person ── creates ──► Intent
Intent ── references ──► Service Template (Level 3 config)
Intent ── accepted as ──► Agreement
Agreement ── commits ──► Organization + Person
Agreement ── spawns ──► Workflow(s)
Agreement ── generates ──► Financial Transaction(s)
Workflow ── contains ──► Task(s)
Task ── assigned to ──► Person
Task ── reserves ──► Resource(s)
Task ── produces ──► Asset(s)
Asset ── approved as ──► Deliverable
Deliverable ── transferred to ──► Person
```

---

## Entity Data Structures

### Organization
```
id                  UUID (primary key)
name                text (required — MVR)
slug                text (unique, for URLs)
status              enum: active | suspended | archived
created_at          timestamp
```

### Person
```
id                  UUID
organization_id     UUID (foreign key)
type                text (Level 2 extension: client, employee, freelancer, vendor...)
display_name        text (required — MVR)
email               text
phone               text
status              enum: active | archived
metadata            jsonb (progressive enrichment: address, preferences, notes)
created_at          timestamp
```

### Resource
```
id                  UUID
organization_id     UUID
type                text (Level 2 extension: camera, lens, studio_space, vehicle...)
name                text (required — MVR)
status              enum: available | reserved | in_use | maintenance | retired
metadata            jsonb (serial number, purchase date, value, notes)
created_at          timestamp
```

### Intent
```
id                  UUID
organization_id     UUID
person_id           UUID (who wants it)
source              text (website, walk-in, referral, social...)
description         text
service_template_id UUID (nullable — may not reference a specific service yet)
status              enum: created | reviewed | accepted | declined | withdrawn | expired
metadata            jsonb (questionnaire answers, attachments, notes)
created_at          timestamp
```

### Agreement
```
id                  UUID
organization_id     UUID
intent_id           UUID
person_id           UUID
version             integer (starts at 1, increments on modification)
terms               jsonb (scope, pricing, timeline, deliverable expectations)
status              enum: proposed | active | modified | completed | cancelled
signed_at           timestamp (nullable)
created_at          timestamp
```

### Workflow
```
id                  UUID
organization_id     UUID
agreement_id        UUID
template_id         UUID (Level 3 — which service template was used)
status              enum: created | in_progress | completed | halted
created_at          timestamp
```

### Task
```
id                  UUID
workflow_id         UUID
stage_name          text (from the workflow template)
stage_order         integer
assigned_person_id  UUID (nullable)
status              enum: created | assigned | in_progress | blocked | completed
due_date            timestamp (nullable)
metadata            jsonb (instructions, notes)
created_at          timestamp
```

### Asset
```
id                  UUID
organization_id     UUID
workflow_id         UUID (nullable — provided assets may not have one)
origin              enum: produced | provided
type                text (Level 2 extension: raw_photo, edited_jpeg, audio_master...)
file_reference      text (storage URL or path)
status              enum: registered | available | in_use | retained | released
metadata            jsonb (dimensions, format, tags, EXIF)
created_at          timestamp
```

### Deliverable
```
id                  UUID
asset_id            UUID
agreement_id        UUID
person_id           UUID (recipient)
status              enum: produced | reviewed | delivered | archived
delivered_at        timestamp (nullable)
created_at          timestamp
```

### Financial Transaction
```
id                  UUID
organization_id     UUID
agreement_id        UUID (nullable — expenses may not tie to an agreement)
person_id           UUID (nullable)
direction           enum: inbound | outbound
type                text (Level 2: invoice, deposit, payment, expense, refund, commission)
amount              decimal
currency            text
status              enum: created | pending | settled | voided
due_date            timestamp (nullable)
settled_at          timestamp (nullable)
metadata            jsonb (payment method, reference numbers, line items)
created_at          timestamp
```

### Event Log
```
id                  UUID
organization_id     UUID
entity_type         text (which entity was mutated)
entity_id           UUID
action              text (created, updated, status_changed, etc.)
actor_id            UUID (which Person performed the action)
payload             jsonb (what changed)
created_at          timestamp
```

---

## Level 2 Extension Mechanism

Level 2 extensions (Person types, Resource types, Asset types, Transaction types) are handled through the `type` column on each entity. The engine does not need new tables for "Client" vs "Employee." They are both `Person` rows with different `type` values.

Studios can add custom types through Level 3 configuration without schema changes.

## Level 3 Configuration Storage

Studio-specific configuration (service templates, workflow definitions, pricing models, business rules, automation triggers, visual engine layouts) is stored as structured JSON in dedicated configuration tables:

```
Service Template
    id                  UUID
    organization_id     UUID
    name                text
    default_workflow_template_id  UUID (references Workflow Template)
    pricing             jsonb (base price, add-ons, deposit rules)
    resource_requirements  jsonb (per-stage resource needs)
    role_requirements   jsonb (per-stage staff role needs)
    deliverable_spec    jsonb (expected output format/quantity)
    status              enum: active | retired
    created_at          timestamp

Workflow Template
    id                  UUID
    organization_id     UUID
    name                text
    stages              jsonb (ordered list of stage definitions)
    created_at          timestamp

Visual Layout
    id                  UUID
    organization_id     UUID
    context             text (storefront, invoice, gallery, proposal)
    layout_data         jsonb (the block tree from the Visual Engine)
    status              enum: draft | published
    created_at          timestamp
    published_at        timestamp (nullable)
```

---

## The Data Flow

```
Person creates Intent
    → Configurator reviews, selects Service Template
    → System creates Agreement (terms from template + adjustments)
    → System creates Financial Transaction (deposit)
    → System spawns Workflow (stages from template)
    → System creates Tasks (from workflow stages)
    → Operators execute Tasks, produce Assets
    → Assets approved as Deliverables
    → Deliverables transferred to Person
    → Financial Transactions settle
    → Event Log captures everything
    → Analytics query Event Log + entity tables for Learning
```
