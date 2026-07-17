# 04. System Architecture

The system is a two-layer stack.

## Layer 1: The Production Engine

A PostgreSQL database (via Supabase) that holds the Level 1 immutable primitives and their relationships. It is the single source of truth.

- **No UI data.** This layer knows nothing about colors, fonts, or layouts. It knows business truth: prices, schedules, asset locations, relationships.
- **State Machine.** This layer enforces the rules of reality. A Resource cannot be double-booked. An Agreement cannot skip from Proposed to Completed. A Financial Transaction cannot be silently deleted.
- **The API.** Secure, typed Server Actions that expose the engine's data to the frontend. The API is domain-agnostic — it serves Intents, Agreements, Workflows, and Assets. What those things *mean* in a specific studio is determined by configuration.
- **Three-Level Model.** The database schema implements the three levels from the Ontology: Level 1 tables for immutable primitives, Level 2 extension mechanisms (type/category columns, custom fields), and Level 3 configuration storage (workflow templates, pricing models, business rules stored as structured metadata).

## Layer 2: The Ubiquitous Visual Engine

The entire user interface. Completely decoupled from the Production Engine.

- **Headless.** There are no hardcoded pages. The system is a library of visual components (blocks) that bind to data from Layer 1.
- **Heavy.** This is not a lite editor. It is a Framer/Webflow-grade canvas with full CSS control — Grid, Flexbox, gradients, typography, physical lighting effects.
- **Ubiquitous.** The same engine is summoned whether the studio is designing a public storefront, a private invoice, or a client gallery.
- **Data Binding.** Any visual block can be bound to a query against the Production Engine. A text element can display `{{Agreement.TotalAmount}}`. If the data changes, the visual updates.

## How They Connect

1. The studio defines its reality in Layer 1 (services, prices, team, gear).
2. The studio uses Layer 2 to visually express that reality to the world (or to specific clients).
3. Layer 2 never owns data. It only reads from and writes to Layer 1.
