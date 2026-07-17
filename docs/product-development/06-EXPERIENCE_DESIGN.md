# Layer 6: Experience Design

## Purpose

This is the first layer where we talk about screens, buttons, and navigation. It arrives deliberately late — after Vision, Ontology, Capabilities, Workflows, and Data Modeling — so that the UI serves the architecture rather than dictating it.

---

## Design Principles

1. **The dashboard is the home.** The Configurator lands on a unified operations dashboard, not a marketing splash page.
2. **The builder is an overlay, not a destination.** The Visual Engine is summoned over data, not navigated to as a separate app.
3. **No left-hand sidebar.** The system uses an App Grid / Command Palette paradigm. The user teleports to any facet of the Production Engine instantly.
4. **Density for operators, clarity for recipients.** Internal views are data-dense. Client-facing views are designed per-studio via the Visual Engine.
5. **Aesthetic: Quantum Elevation.** Premium, editorial, warm. Not generic SaaS blue. Defined in `08-DESIGN_SYSTEM.md`.

---

## Screen Map

### Configurator Screens

| Screen | Purpose | Data Source |
|---|---|---|
| **Command Center** | Aggregate state of the Organization. Today's tasks, overdue items, active workflows, financial summary. | All entities |
| **Intent Queue** | List of incoming intents, filterable by status, source, date. | Intent |
| **Person Directory** | All people — clients, staff, vendors. Search, filter, view history. | Person |
| **Agreement View** | Detail view of a specific agreement — terms, linked workflow, financial transactions, timeline. | Agreement, Workflow, Financial Transaction |
| **Workflow Board** | Kanban or timeline view of active workflows. Stages as columns, tasks as cards. | Workflow, Task |
| **Resource Inventory** | All resources, current status, availability calendar, maintenance log. | Resource |
| **Financial Ledger** | All financial transactions. Filterable by type, status, date, person. Summary totals. | Financial Transaction |
| **Service Templates** | List and editor for service templates. Workflow stages, pricing, resource/role requirements. | Service Template (Level 3) |
| **Analytics Dashboard** | Charts and tables for operational, financial, and client metrics. | Event Log, all entities |
| **Visual Engine** (overlay) | Heavy design canvas. Opens in context over any data entity. | Layout data + bound entity data |

### Operator Screens

| Screen | Purpose | Data Source |
|---|---|---|
| **My Tasks** | Today's assigned tasks, upcoming tasks, notifications. | Task (filtered by assigned person) |
| **Task Detail** | Instructions, required resources, asset upload, time log, status controls. | Task, Resource, Asset |
| **Resource Checkout** | Check out / check in resources. View what is currently out. | Resource |

### Recipient Screens (Designed via Visual Engine)

These screens are not hardcoded. They are designed per-studio by the Configurator using the Visual Engine. The system provides default templates that can be fully customized.

| Screen | Purpose | Designed By |
|---|---|---|
| **Storefront** | Public website. Service catalog, portfolio, inquiry form. | Configurator via Visual Engine |
| **Proposal Page** | Branded, interactive proposal for a specific Intent. | Configurator via Visual Engine |
| **Approval Portal** | Review produced assets, approve or request revisions. | Configurator via Visual Engine |
| **Delivery Gallery** | Branded gallery for approved deliverables. Includes commerce/upsell. | Configurator via Visual Engine |
| **Payment Page** | Deposit payment, invoice payment, print store checkout. | System default + Visual Engine branding |

---

## Navigation Model

```
┌─────────────────────────────────────────────┐
│                  Top Bar                     │
│  [Logo]  [Search]  [Notifications]  [Grid]  │
└─────────────────────────────────────────────┘
                      │
            ┌─────────┴─────────┐
            │    App Grid       │
            │                   │
            │  Command Center   │
            │  Intents          │
            │  People           │
            │  Workflows        │
            │  Resources        │
            │  Finances         │
            │  Services         │
            │  Analytics        │
            │  Storefront ◄─── opens Visual Engine
            └───────────────────┘
```

- **Top Bar** is persistent. Always visible.
- **App Grid** is a modal/popover accessed from the Top Bar. It is the primary navigation mechanism.
- **Command Palette** (keyboard shortcut) provides instant search-based navigation. Type "Smith" → jump to Person. Type "Invoice #402" → jump to transaction.
- **Visual Engine** opens as a full-screen overlay when the Configurator clicks "Design" on any designable entity.

---

## Permissions Model

| Role | Sees | Can Do |
|---|---|---|
| **Configurator** | Everything | Full CRUD on all entities. Access Visual Engine. Manage team. Configure services. View analytics. |
| **Operator** | Assigned tasks, checked-out resources, own time logs | Execute tasks, upload assets, check out/in resources, log time. Cannot modify agreements, pricing, or financial data. |
| **Recipient** | Their own intents, agreements, deliverables, invoices | Create intents, review proposals, approve deliverables, make payments, purchase from commerce. |

---

## Responsive Strategy

| Context | Experience |
|---|---|
| **Desktop** | Full experience. Command Center, Workflow Board, Visual Engine — all designed for large screens. |
| **Tablet** | Operator-optimized. Task list, resource checkout, asset upload. Configurator can monitor but detailed design work is desktop-first. |
| **Mobile** | Notification-driven. View tasks, approve stages, check messages. No Visual Engine on mobile — design work requires a full screen. |
