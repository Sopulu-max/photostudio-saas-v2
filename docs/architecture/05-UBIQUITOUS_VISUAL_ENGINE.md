# 05. The Ubiquitous Visual Engine

## What It Is

A heavy, Framer/Webflow-grade visual design canvas that can be summoned anywhere in the system. It replaces static forms, hardcoded templates, and third-party website builders.

## The Principle of Ubiquity

The Visual Engine is not a page. It is a mode. It is summoned whenever the studio needs to present data to anyone — clients, staff, or the public.

- Designing the public **Storefront** → open the Engine.
- Designing a custom **Invoice** → open the Engine.
- Designing a private **Client Gallery** → open the Engine.
- Designing a **Booking Proposal** → open the Engine.

One tool. One learning curve. Infinite applications.

## Capabilities

### Data Binding
The core capability. Every visual element can be bound to data from the Production Engine.

A user drags a Text block onto the canvas. Instead of typing static text, they bind it to `{{Agreement.TotalAmount}}`. If the amount changes in the engine, the visual updates automatically.

### Full CSS Control
The canvas supports the full range of modern CSS: Grid, Flexbox, absolute positioning, responsive breakpoints, multi-stop gradients, border-radius, blur, opacity, and physical lighting drop-shadows.

### Block Library
Everything on the canvas is an atomic, reusable block:

- **Structural:** Sections, Containers, Grids.
- **Typography:** Headings, Paragraphs, Rich Text.
- **Media:** Images, Video, Masonry Galleries.
- **Data-Driven:** Pricing Tables, Asset Grids, Payment Gateways, Form Inputs.

Blocks are context-agnostic. A Pricing Table block works the same whether it is placed on a Storefront or inside an Invoice.

### Context-Aware Invocation
When the Engine opens, it knows *what* the studio is designing based on the data context. In a Storefront context, the sidebar shows blocks relevant to public presentation. In an Invoice context, it shows blocks relevant to financial data. The engine is the same; the available data bindings change.
