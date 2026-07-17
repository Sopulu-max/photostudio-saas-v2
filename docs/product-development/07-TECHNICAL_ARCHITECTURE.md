# Layer 7: Technical Architecture

## Purpose

This layer defines the engineering decisions: what technologies we use, how the system is structured, and how it scales. Every decision here serves the architecture defined in the layers above.

---

## Technology Stack

| Concern | Technology | Why |
|---|---|---|
| **Framework** | Next.js (App Router) | Server-side rendering for storefront SEO. Server Actions for secure data mutations. React for the Visual Engine. |
| **Database** | PostgreSQL via Supabase | Relational integrity for the ERP Core. Row-Level Security for multi-tenancy. Real-time subscriptions for live updates. |
| **Authentication** | Supabase Auth | Handles Configurator, Operator, and Recipient authentication. Supports magic links, OAuth, and password. |
| **Storage** | Supabase Storage | Asset storage (photos, videos, files). Signed URLs for secure access. |
| **Payments** | Stripe | Deposit collection, invoice payments, print store checkout. Stripe Connect for platform-level payment routing. |
| **Visual Engine** | React + @dnd-kit | Heavy drag-and-drop canvas. Block rendering. Layout serialization to JSON. |
| **Styling** | Vanilla CSS (Quantum Elevation) | `.q-` namespace. No CSS modules. No Tailwind. Full control over the premium aesthetic. |
| **Email** | Resend or Postmark | Transactional emails: confirmations, notifications, reminders. |
| **Deployment** | Vercel | Edge-optimized. Automatic previews. Aligns with Next.js. |

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Client Browser                    │
│                                                     │
│   ┌──────────────┐    ┌──────────────────────────┐  │
│   │  ERP Dashboard│    │   Visual Engine (Canvas)  │  │
│   │  (React SSR)  │    │   (React Client-Side)    │  │
│   └──────┬───────┘    └──────────┬───────────────┘  │
└──────────┼───────────────────────┼──────────────────┘
           │                       │
           ▼                       ▼
┌─────────────────────────────────────────────────────┐
│              Next.js Server (App Router)             │
│                                                     │
│   Server Actions          API Routes                │
│   (mutations)             (webhooks, external APIs)  │
│                                                     │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                    Supabase                          │
│                                                     │
│   PostgreSQL    Auth    Storage    Realtime          │
│   (ERP Core)    (IAM)   (Assets)  (Subscriptions)   │
│                                                     │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              External Services                       │
│                                                     │
│   Stripe         Print Lab API      Email Service   │
│   (Payments)     (Fulfillment)      (Notifications) │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Database Design

### Multi-Tenancy
Every table has an `organization_id` column. Supabase Row-Level Security (RLS) policies ensure that queries are always scoped to the authenticated user's Organization. No data leaks between tenants.

### Schema Structure
The schema directly implements the entities from Layer 5 (Information Architecture):

- **Level 1 tables:** `organizations`, `persons`, `resources`, `intents`, `agreements`, `workflows`, `tasks`, `assets`, `deliverables`, `financial_transactions`, `events`
- **Level 3 tables:** `service_templates`, `visual_layouts`, `automation_rules`

### Migrations
Schema changes are managed through Supabase migrations. The database schema is version-controlled alongside application code.

---

## API Design

### Server Actions (Mutations)
All state mutations go through Next.js Server Actions. Each action:
1. Validates the input.
2. Checks permissions (is this Person allowed to do this?).
3. Enforces state machine rules (is this transition legal?).
4. Mutates the database.
5. Emits an event to the Event Log.
6. Returns the result.

### Data Fetching (Reads)
Server Components fetch data directly from Supabase using the server client. No REST API layer needed for internal reads. The Visual Engine (client-side) uses Supabase's real-time subscriptions for live data binding.

---

## Event System

Every state mutation emits an event. Events are the foundation for:

- **Audit trail:** Who did what, when, to which entity.
- **Automation triggers:** "When an Agreement becomes Active, create a deposit Invoice."
- **Real-time updates:** Supabase Realtime pushes changes to connected clients.
- **Analytics:** Aggregate queries over the Event Log for Learning dashboards.

---

## Permissions Implementation

| Role | RLS Policy |
|---|---|
| **Configurator** | Full read/write on all rows where `organization_id` matches. |
| **Operator** | Read/write on Tasks assigned to them. Read on Resources. Write on Assets (upload). Read on own time logs. |
| **Recipient** | Read on own Intents, Agreements, Deliverables, Financial Transactions. Write on Intent creation and Approval actions. |

---

## Asset Storage

- Assets are uploaded to Supabase Storage in organization-scoped buckets.
- File references (URLs) are stored in the `assets` table.
- Signed URLs provide time-limited, secure access for Recipients.
- Thumbnails and previews are generated on upload for gallery rendering.

---

## Scalability Considerations

- **Database:** Supabase handles connection pooling and can scale PostgreSQL vertically. For extreme scale, partition by `organization_id`.
- **Storage:** Supabase Storage scales horizontally. Large studios with terabytes of assets are handled natively.
- **Compute:** Vercel serverless functions scale automatically with traffic.
- **Visual Engine:** All rendering happens client-side. The server only stores and serves the JSON layout definitions.
