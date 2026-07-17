# Product Requirements Document: The Ubiquitous Visual Engine

## Objective

The single most important frontend interface in the Production OS. A heavy, Framer/Webflow-grade visual design engine that allows the studio to design any outward-facing touchpoint by binding visual components to data from the Production Engine.

It replaces static forms, hardcoded templates, and third-party design tools.

## Technical Foundation

- **Canvas.** High-fidelity drag-and-drop workspace. Supports absolute positioning, CSS Grid, Flexbox, responsive breakpoints.
- **Block Registry.** A library of atomic UI components that can be dropped onto the canvas.
- **Data Binding.** Any component can be bound to a data query against the Production Engine.

## Features

### The Canvas
- Visual panels for padding, margin, border-radius, typography, and flex alignment.
- Multi-stop gradient editor for backgrounds and text fills.
- Physical lighting presets for premium glassmorphic effects.
- Responsive breakpoint editor (desktop, tablet, mobile).

### The Block Library
- **Structural:** Sections, Containers, Grids, Dividers.
- **Typography:** Headings, Paragraphs, Rich Text.
- **Media:** Images, Video, Masonry Galleries.
- **Data-Driven:** Pricing Tables, Asset Grids, Payment Gateways, Form Inputs, Calendar Embeds.

Blocks are context-agnostic. A Pricing Table works the same on a Storefront as inside an Invoice.

### Context-Aware Invocation
The Engine is summoned in different contexts across the app:

- **Storefront Context.** Design the public website. Bind to public services, portfolio assets.
- **Proposal Context.** Design a branded quote for a specific Intent. Bind to Agreement terms and pricing.
- **Invoice Context.** Design a financial document. Bind to Financial Transaction data.
- **Gallery Context.** Design the delivery experience. Bind to workflow output Assets. Include print store upsell blocks.

## Acceptance Criteria

1. A user can drag a Section and a Heading onto the canvas, apply a 4-stop gradient, and set 24px padding — all visually.
2. A user can bind a Heading block to `{{Person.FirstName}}`. When viewed by that person, it renders their actual name.
3. This drag-and-drop binding flow works identically whether the user is designing a Storefront or an Invoice.
