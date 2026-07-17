# Layer 4: Workflow Design

## Purpose

Capabilities define what the system *can do*. Workflows define how people *actually use it*. This layer maps the capabilities from Layer 3 onto the three personas, producing the concrete sequences of actions each person performs to accomplish their goals.

These workflows are the foundation for UI design, permissions, and onboarding.

---

## Configurator Workflows (Studio Owner / Manager)

### W1: Studio Setup
*First-time configuration. Happens once, refined over time.*

```
Create Organization (name, basics)
    → Define brand identity (logo, colors, typography)
    → Add team members (Persons in Operator role, set permissions)
    → Register resources (gear, spaces, software)
    → Create standard workflow template (stages)
    → Create first service template (name, attach workflow template, pricing)
    → Design storefront (Visual Engine)
    → Publish
```

### W2: Service Design
*Creating or editing a service offering.*

```
Open service configuration
    → Name the service
    → Define reusable workflow templates (e.g., Capture → Edit → Deliver)
    → Attach workflow templates to specific service offerings
    → Set resource requirements per stage
    → Set staff role requirements per stage
    → Configure pricing (base, add-ons, deposit rules)
    → Configure approval rules (internal only? client approval?)
    → Set deliverable format expectations
    → Save as template
```

The service template is Level 3 configuration. The engine stores it as structured metadata. The Visual Engine can later bind to it for storefronts and proposals.

### W3: Intent Triage
*Reviewing and responding to incoming intents.*

```
View Intent queue (sorted by recency, source, urgency)
    → Open an Intent
    → Review Person details and what they want
    → Respond: 
        → Decline (with reason)
        → Request more information (send questionnaire)
        → Advance to Planning (select service template, begin proposal)
```

### W4: Proposal & Commitment
*Converting intent into a formal agreement.*

```
Select service template for this Intent
    → Adjust scope, pricing, timeline for this specific Person
    → Design the proposal (Visual Engine — branded, interactive page)
    → Send proposal link to Person
    → Person reviews, requests changes or accepts
    → On acceptance:
        → Agreement is created (terms locked, versioned)
        → Deposit invoice is generated automatically
        → Payment is processed
        → Workflow is spawned from the service template
        → Resources and staff are reserved
```

### W5: Operations Monitoring
*Day-to-day management of active work.*

```
Open Command Center
    → View active workflows and their current stages
    → View today's scheduled tasks
    → View flagged issues (overdue tasks, resource conflicts, blocked stages)
    → Drill into any workflow for detail
    → Reassign staff or resources as needed
    → Approve completed stages (if approval chain requires it)
```

### W6: Financial Management
*Tracking money in and out.*

```
Open Financial Ledger
    → View outstanding invoices
    → View recent payments received
    → View upcoming expenses
    → Reconcile: match payments to invoices
    → Generate reports: revenue by service, profit margins, overdue receivables
```

### W7: Delivery Setup
*Preparing the client-facing delivery experience.*

```
Workflow reaches Delivery stage
    → Configurator (or Operator) opens Delivery context
    → Opens Visual Engine
    → Designs the delivery experience (gallery layout, branding, commerce blocks)
    → Selects which approved Assets to include
    → Configures access rules (password, expiration, download limits)
    → Publishes delivery link
    → Person is notified
```

### W8: Business Review
*Periodic learning and optimization.*

```
Open Analytics dashboard
    → Review: average turnaround per service type
    → Review: most/least profitable services
    → Review: staff utilization and performance
    → Review: client satisfaction and repeat rates
    → Identify bottlenecks (which workflow stages take longest?)
    → Adjust service templates, pricing, or team structure based on insights
```

---

## Operator Workflows (Studio Staff)

### W9: Daily Dashboard
*Starting the workday.*

```
Log in
    → View assigned tasks for today
    → View upcoming tasks this week
    → View notifications (new assignments, stage approvals, messages)
```

### W10: Production Execution
*Doing the actual work.*

```
Select a task
    → Check out required resources (camera, lens, studio key)
    → Begin work
    → Log time
    → Produce assets (capture photos, record audio, create designs)
    → Upload assets to the system (Asset Ingestion)
    → Tag and organize assets
    → Mark task as complete
    → Check in resources
    → System advances workflow: 
        → Next stage is unblocked (if assets are available)
        → Next assigned Person is notified
```

### W11: Handoff
*Passing work to the next stage or person.*

```
Complete current stage
    → System checks: are all required assets produced?
    → If yes: next stage transitions to In Progress, next Person is notified
    → If no: current stage remains in Waiting, Operator is prompted for missing assets
    → No manual "pass the baton" — the dependency is the data
```

---

## Recipient Workflows (The Client)

### W12: Discovery
*Finding and choosing the studio.*

```
Land on studio's storefront (designed via Visual Engine)
    → Browse services (rendered from service templates in the Production Engine)
    → View portfolio (rendered from archived Assets)
    → View pricing
    → Decide to inquire
```

### W13: Inquiry
*Expressing intent.*

```
Fill out inquiry form (on storefront, or via other channel)
    → System creates an Intent object
    → Person receives confirmation
    → Waits for studio response
```

### W14: Proposal Review
*Evaluating and committing.*

```
Receive proposal link
    → View branded, interactive proposal (designed via Visual Engine)
    → Review scope, timeline, pricing
    → Request changes (loops back to Configurator) or accept
    → Sign agreement (digital signature)
    → Pay deposit
    → Receive confirmation: work will begin
```

### W15: Approval
*Reviewing produced work before delivery.*

```
Receive review link (branded approval portal via Visual Engine)
    → View produced assets
    → Approve, request revisions, or flag issues
    → Revisions loop back to Operator
    → Final approval triggers Delivery stage
```

### W16: Delivery & Commerce
*Receiving value and optional purchasing.*

```
Receive delivery link
    → View deliverables in branded gallery/portal
    → Download approved assets
    → Optionally: browse print store / upsell products
    → Purchase prints, albums, licensing
    → Payment processed → Financial Transaction created
    → Physical orders routed to fulfillment partner
```

---

## Workflow Summary by Lifecycle Stage

| Lifecycle Stage | Configurator | Operator | Recipient |
|---|---|---|---|
| Potential → Intent | — | — | W12 Discovery, W13 Inquiry |
| Planning | W3 Triage, W4 Proposal | — | W14 Proposal Review |
| Orchestration | W4 Commitment (auto-reserve) | — | W14 Sign & Pay |
| Production | W5 Monitoring | W9 Dashboard, W10 Execution | — |
| Evaluation | W5 Approve stages | W11 Handoff | W15 Approval |
| Delivery | W7 Delivery Setup | — | W16 Delivery & Commerce |
| Archive | Automatic | Automatic | — |
| Learning | W8 Business Review | — | — |
