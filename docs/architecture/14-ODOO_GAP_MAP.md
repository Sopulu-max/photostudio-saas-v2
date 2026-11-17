# 14. The Odoo gap map: every Odoo app, read against this studio

The vision says "Odoo, but for studios" ([VISION](../VISION.md)), and
[00-FRAMEWORK](00-FRAMEWORK.md) says Odoo is "the inspiration, not a target to
literally reproduce". This document does what neither of those does. It takes
**every app in Odoo's catalogue, plus the shared features under all of them**,
and records for each one:

- what Odoo's core actually does;
- what we have that does the same job, checked against the code and the live
  schema;
- whether a photography studio would use it;
- and, where something is missing, which existing edge it would hang off.

Like [13-FOUNDATIONS](13-FOUNDATIONS.md), it **changes no ruling**. It is the
evidence the next decisions should be made against.

Compiled 2026-11-17.

---

## 0. How far to trust each source

| Source | What was read | Standing |
|---|---|---|
| Odoo's official documentation, `odoo.com/documentation` 19.0 and 20.0 | each app's index page, plus the core sub-pages where the definition depended on them | **primary** for what an Odoo app *is* |
| This codebase: `src/`, `supabase/migrations`, the live schema via `scripts/db-query.mjs` | read by one agent per Odoo category, then **re-checked by a second agent told to refute it** | **primary**; every have/partial claim cites files or tables |
| What a photography studio would use | reasoning about trade practice (weddings, portraits, commercial, schools, events, print) | **anecdotal**: no trade survey was read. Treat the need-strength column as a judgement, not a measurement |

The docs version selector shows 20.0 as current. Most apps were read on 19.0
because their 20.0 pages failed to load. Nothing in this map turns on a
difference between the two versions.

The verifiers made four corrections. Quality was downgraded from *partial* to
*gap*: a tickable workflow step is a to-do, not a quality check. Three apps the
first pass skipped were added: Frontdesk, Lunch and Approvals (HR). I spot-checked
one disagreement myself. The Marketing pass said `workflows` and
`workflow_tasks` are legacy. **They are not**: `src/modules/services/domain.ts`
and `src/modules/packages/domain.ts` read them, as the Services pass found.

---

## 1. The headline

Of **65 distinct Odoo apps and shared features**:

| Status | Count | Meaning |
|---|---|---|
| have | **0** | none matches the full core of its Odoo app |
| partial | **30** | the studio core is there; parts of Odoo's core are missing |
| gap | **25** | nothing equivalent, and a studio would plausibly use it |
| ruled out | **3** | an existing ruling here rejects it |
| not applicable | **7** | a studio would not use it |

"0 have" is less alarming than it sounds. The 30 partials are exactly the
studio's operating loop: enquiry, quote, contract, invoice, payment, production,
delivery, team and attendance. What they lack is mostly the part of each Odoo
app that serves a general business rather than a studio.

The finding that matters is the next one. **Most of the real gaps are not
missing apps. They are missing *readings* of data we already hold.** The same
dozen holes show up independently under many Odoo apps (§3). Most of them close
without a new table.

---

## 2. The full map

Need is how strongly a studio would use the thing: **H**igh, **M**edium, **L**ow or none (–).

### Finance

| Odoo app | Status | Need | What we have → what is missing |
|---|---|---|---|
| Accounting | partial | M | A one-sided money ledger (charge / refund / cost), totals per currency → no profit-and-loss by period, aged receivables, period tax report or accountant export. A full double-entry ledger isn't needed: studios keep their books in Xero or QuickBooks |
| Invoicing | partial | H | Draft → issued → paid, built from booking lines and extras, deposit invoice on signing, partial payments, PDF and token page → no credit notes, no overdue reading, one tax rate per studio, no "sent" record |
| Expenses | partial | M | A Cost row with the studio's own label → the form cannot tie a cost to a booking or to who paid; no receipt file, no reimbursement, no re-billing to the client |
| Documents | partial | M | Files only where an entity owns them (galleries, intake uploads, note images) → no operator-attached file on a booking, client or team member (releases, permits, insurance, scans) |
| Sign | partial | H | Client signs the contract on the portal with a drawn signature and typed name → one signer only, no signed PDF, no document hash / IP / user-agent, no model or property releases |
| Spreadsheet (BI) | ruled out | L | The ruled-for form is the filter + group-by lens. The real hole is that Finances doesn't use it and nothing exports |

### Sales

| Odoo app | Status | Need | What we have → what is missing |
|---|---|---|---|
| CRM | partial | H | Enquiry = a booking in an enquiry-kind stage; pipeline counts and time in stage → no lost reasons, no open-pipeline value, the Board can't drag between stages, no duplicate-client merge |
| Sales (quotes & orders) | partial | H | The booking is the order; packages act as templates; sign-then-deposit on the portal → no quote expiry, signing doesn't read as "agreed" on the booking, client can't pick extras on a shared quote |
| Point of Sale | gap | L | Only a passport or walk-in print studio would use it; a counter sale = a booking created already completed |
| Subscriptions | gap | M | Retainers, school-year contracts, first-year baby plans → waits on 13-FOUNDATIONS gap #2 |
| Rental | gap | M | Hiring out the daylight room or cyclorama; double-booking is the failure → waits on 13-FOUNDATIONS gap #4 |

### Websites

| Odoo app | Status | Need | What we have → what is missing |
|---|---|---|---|
| Website builder | partial | H | One public catalogue at `/book/[slug]` with branding and OpenGraph → no studio home, team, portfolio or contact page; address and hours held but never shown; no custom domain or sitemap. The drag-and-drop editor is ruled out |
| eCommerce | partial | M | The catalogue doubles as the shop; one package per checkout → no cart (several items in one order), no shipping, no client-chosen extras |
| Blog | gap | M | Studios blog real shoots → best shaped as a published reading of a gallery |
| Forum | n/a | – | No community to host |
| Live Chat | gap | L | Studios answer on WhatsApp; a "message the studio" wa.me link covers most of it |
| eLearning | n/a | L | Courses are an educator business; a workshop is already a bookable package |
| Customer Portal | partial | H | One link per document (booking, invoice, receipt, gallery, contract) → no single page per client showing everything and what is owed; the contract link is a bare UUID, not a revocable token |

### Supply chain

| Odoo app | Status | Need | What we have → what is missing |
|---|---|---|---|
| Inventory | gap | M | Only studios selling frames or albums from their own stock; on-hand = received − consumed, a reading |
| Purchase | partial | M | A Cost row → no supplier on the cost, no booking on the cost, no due date; so no margin per job and no "owed to the lab" |
| Manufacturing | partial | H | The booking line is the production order; booking tasks are its work orders; roles route them → no time per step, no job cost, no dependencies |
| PLM | n/a | – | A booking line's private package copy plus the events trail already answers "what did it contain then" |
| Maintenance | gap | L | Camera and lens servicing, "body #2 is at repair before Saturday" → waits on gap #4 |
| Quality | gap | L | Pass / send-back on a review step, recorded on `booking_tasks` |
| Repairs | n/a | – | A remake is another booking line; gear repair is Maintenance |

### Human resources

| Odoo app | Status | Need | What we have → what is missing |
|---|---|---|---|
| Employees | partial | M | Contact-backed team, roles, crewing, profile → no staff-vs-freelancer, start/end date or emergency contact |
| Attendances | partial | M | Door register with lateness, used daily (325 rows) → no hours-per-person-per-month report, no overtime |
| Time Off | gap | M | No dated absence per person, so a crew member on holiday can be crewed and reads as "late" |
| Recruitment | gap | L | Shaped like an employee not yet engaged |
| Appraisals | gap | L | The track record on the profile is a reading; private notes = notes about an employee |
| Payroll | gap | M | Mostly per-shoot fees: put a rate on `assignments`, so "owed to crew" becomes a reading |
| Referrals | n/a | – | Client referrals are `clients.source`, not a job-referral game |
| Fleet | gap | L | A van is one more resource → gap #4 |
| Skills / Certifications | partial | M | Skills are roles (one vocabulary, by ruling) → no expiry on a held role (drone licence, background check) |
| Frontdesk | gap | L | "Client arrived" = an event on today's booking |
| Lunch | n/a | – | – |
| Approvals | gap | L | Only once crew have accounts |

### Marketing

| Odoo app | Status | Need | What we have → what is missing |
|---|---|---|---|
| Email Marketing | gap | M | Audience = a reading over clients and bookings; needs an opt-out fact and a sending decision |
| SMS Marketing | gap | L | Clients here are on WhatsApp, not SMS |
| Social Marketing | gap | L | `clients.source` is captured but never read (0 of 100 set) |
| Marketing Automation | gap | M | Enquiry gone quiet, pre-shoot guide, review request, one-year rebook → conflicts with Principle 3 (§5) |
| Events | partial | M | Mini-session packages with a date → no slot capacity, so two clients can take the same 10:20 slot |
| Surveys | partial | M | Package intake questions → can only be asked at booking; no later questionnaire, no post-delivery feedback |

### Services

| Odoo app | Status | Need | What we have → what is missing |
|---|---|---|---|
| Project | partial | H | Booking = project, booking tasks from the live workflow, the `/tasks` lens → no step deadlines (the calendar's Deadlines layer is unfed), no revision rounds, no profitability |
| Timesheets | gap | M | Minutes on `booking_tasks` for costing; hourly billing is already an Extra |
| Planning | partial | M | Crew per booking, working days, the calendar → no per-person clash reading, no who-is-where-by-person view |
| Appointments | partial | H | Public self-booking with hours enforced → time is typed freely, no offered free slots; double-booking is not caught |
| Field Service | partial | M | A location shoot is a booking → no venue (Location facet unresolved), no call sheet |
| Helpdesk | gap | L | A client request = a client-authored note on the booking (13-FOUNDATIONS gap #7) |

### Productivity

| Odoo app | Status | Need | What we have → what is missing |
|---|---|---|---|
| Discuss | partial | M | The bell, notes on bookings and clients, the activity feed → no per-record history, no @mentions |
| Knowledge | partial | M | The notes wall → a note cannot be about a service or package (standard procedures, client prep guides) |
| Approvals | gap | L | Duplicate of HR Approvals; a discount needing owner sign-off is the one real case |
| To-do | partial | M | Booking tasks + note checklists → a loose to-do has no owner or done state; a note can't be promoted to a task |
| WhatsApp | partial | H | `wa.me` share on invoices only, not addressed to the client → nothing on booking, contract or gallery; 110 of 111 contacts have a phone number |
| VoIP | gap | L | A `tel:` link + "log a call" event is enough |
| IoT | n/a | – | – |

### Framework (the features under every app)

| Odoo feature | Status | Need | What we have → what is missing |
|---|---|---|---|
| Odoo Studio | ruled out | L | Bounded configurability: stages, dimensions, the 8 field types |
| Chatter + Activities | partial | H | `events` logs every mutation → **no record shows its own history**; no dated follow-up with an owner |
| Email templates | partial | M | One hardcoded invoice/receipt draft → the studio can't word its own messages; no send hand-off on other documents |
| Automated actions | ruled out | M | 09-SYSTEM_CONTRACTS Principle 3; surface what is due instead |
| Access rights | gap | H | One kind of operator; crew have no accounts; everyone sees finances |
| Multi-company | gap | L | One login, one studio |
| Reporting views | partial | M | Bookings Workspace lenses, `Analysis` on `/tasks` → no money measure anywhere, no cross-tab, no cohort |
| Import / export | gap | H | No CSV in or out anywhere |
| Multi-currency & taxes | partial | M | One studio currency, one tax rate → can't invoice a client in a different currency; no tax report |
| Notifications | partial | H | Bell projected from events, realtime → nothing reaches the operator when the app is closed |

---

## 3. The gaps underneath the apps

Read across the rows and the same holes recur under unrelated Odoo apps. Each
appearance is an independent confirmation, because each verifier found it from
a different direction. Ranked by confirmations, then by need, then by cost.

| # | The gap | Found under | Need | Cost |
|---|---|---|---|---|
| 1 | **A record's own history.** `events` already logs every mutation with its actor. Nothing reads it per booking, client, invoice or contract | Chatter, Discuss, CRM, Invoicing, WhatsApp, VoIP, Email templates (7) | H | **reading only**: a sibling of `listRecentActivity` filtered by `entity_id` |
| 2 | **Money as a lens, and out as a file.** No view sums money by package, client or month; Finances has no lens; nothing exports | Accounting, Reporting, Spreadsheet, Import/export, Multi-currency, Expenses, CRM (7) | H | **reading only**: a measure on `AnalysisRow` + a finances sheet + CSV of the current view |
| 3 | **Staff accounts and access levels.** One kind of operator; crew can't sign in; anyone signed in sees revenue | Access rights, Approvals ×2, Notifications, Planning, Attendance, Employees, Discuss (8) | H | **schema + auth + RLS**: a closed access level on `employees`, an invite, a second RLS predicate. The largest item here |
| 4 | **Cost on the booking (margin per job).** `financial_transactions` already has `booking_id`, `contact_id` and `due_date`; the cost form sends none of them | Expenses, Purchase, Payroll, Timesheets, Project, Manufacturing (6) | M–H | **mostly form work**; a rate on `assignments` for crew pay is schema |
| 5 | **The studio's own wording, and a send hand-off on every document.** Only invoices can be sent, in fixed words, to an unaddressed `wa.me` | Email templates, WhatsApp, Notifications, Invoicing, Sales, Portal (6) | H | wording in `organizations.metadata`; generalise `SendInvoice`; log a `shared` event |
| 6 | **The client's one link.** Every document is a separate link; nothing shows a client everything and what they owe | Portal, Helpdesk, Surveys, Knowledge, Sales (5) | H | a `share_token` on `clients` + one page reading existing edges |
| 7 | **Time readings: free slots and clashes.** Nothing compares one booking's `[scheduled_for, + duration]` with another's, for the studio or for a crew member | Appointments, Events, Planning, Rental, Time Off (5) | H | **reading only** for one-at-a-time; capacity > 1 waits on gap #4 |
| 8 | **The public face as readings.** Studio home, team, portfolio, contact, from data we hold | Website, Blog, Live Chat, Social (4) | H | public flags on `employees` and galleries; no page entity |
| 9 | **The attachment edge, generalised.** Intake proves a file can hang off a record; operators can't attach one | Documents, Expenses, Sign, Knowledge (4) | M | one attachment shape over booking / contact / employee / contract |
| 10 | **Contract evidence and more signers.** Hash, IP and user-agent at signing; a signed PDF; a second signer; releases | Sign, Sales, Documents (3) | H | inside the existing `terms.signature` + a `/contract/[token]/pdf` route |
| 11 | **A person's dated absence** | Time Off, Planning, Attendance (3) | M | an employee-keyed row shaped like `studio_hours` |
| 12 | **The enquiry book: lost reasons, open value, drag-to-move, quote expiry** | CRM, Sales (2) | H | a reason on `stage_changed` + a value reading; no new entity |
| 13 | **Invoices: overdue and credit notes** | Invoicing, Accounting (2) | H | overdue is a reading; a credit note is an invoice pointing at the one it corrects |
| 14 | **Out-of-app notification to the operator** (web push) | Notifications, Discuss (2) | H | a push subscription beside `notifications_seen_at`; the projection stays |
| 15 | **Client import** | Import/export (1) | H | a dry-run CSV import through the clients module's create command. The main barrier to a studio switching in |
| 16 | Role validity (certifications) and staff-vs-freelancer | Skills, Employees (2) | M | `valid_until` on `employee_roles`; optional columns on `employees` |
| 17 | Questions asked later (after agreement, after delivery) | Surveys, Field Service (2) | M | a "when asked" on package questions, answered on `/booking/[token]` |
| 18 | A note about a service or package (procedures, prep guides) | Knowledge, To-do (2) | M | widen `notes.about_type`; this needs a migration and an impact check on `NotesFor` |

Gaps 1, 2, 7 and 13 need **no schema change at all**. Gap 4 is mostly a form
that sends columns which already exist.

---

## 4. Waiting on a decision, not a build

These are the strongest structural signals in the map, but each one sits behind
a ruling only the operator can make. They are listed here so nobody builds them
by accident.

| Decision | What waits on it | Odoo apps pointing at it |
|---|---|---|
| **The resource layer**: equipment, rooms, the one printer (13-FOUNDATIONS gap #4; the Scheduling module was dropped "unless resources collide") | room hire, gear servicing, a van, frame stock, slot capacity > 1, borrowing gear | Rental, Maintenance, Fleet, Inventory, Events, Planning, Approvals, Manufacturing (**8**: the most-confirmed hole in the map) |
| **Outbound sending and a scheduler.** Principle 3 says side effects are never automatic; `SendInvoice` says client messages are "sent from you, not from the app" | reminders, review requests, enquiry chasers, newsletters, WhatsApp Business API | Email Marketing, Marketing Automation, SMS, WhatsApp, Appointments (5) |
| **Commitment without transformation** (13-FOUNDATIONS gap #2) | retainers, school-year contracts, baby-plan subscriptions | Subscriptions |
| **Deposit is a payment schedule** (designed, parked) | payment terms, instalments, down payments | Invoicing, Sales, Subscriptions |
| **Workflow timing** (parked in the workflow rulings) | step deadlines, task durations, the unfed Deadlines layer | Project, Chatter, Manufacturing, Timesheets |
| **The Location facet** (02-ONTOLOGY §Location, "a bundle wearing one name") | a venue on a booking, the call sheet | Field Service |

## 5. Ruled out, and why

| What | Ruling |
|---|---|
| Odoo Studio (user-defined models, fields, views) | the Builder was built and removed (2026-07-26); bounded configurability |
| Automated actions / server actions | 09-SYSTEM_CONTRACTS Principle 3; the "not planned" row in its known-gaps table |
| An in-app spreadsheet / pivot builder | bounded configurability; dashboards are questions, lists are lenses |
| A drag-and-drop page or theme editor | the Builder removal |
| Online payment anywhere (checkout, portal, card terminals) | no payment processor, manual settlement (2026-08-03) |
| Separate leads, orders, appointments, tickets or applicants tables | an enquiry is a booking not yet agreed; an order is a booking; edges, not entities |
| A skills list beside roles | `20260826000000_capability_is_one_vocabulary.sql` |
| Frozen per-booking plans (MO-style BoM snapshots, PLM versions) | the workflow is live; bookings hold only what happened |

Not applicable: Forum, eLearning, PLM, Repairs, Referrals, Lunch, IoT.

## 6. Things found broken along the way

These are not Odoo gaps. They are places where the app already promises
something it doesn't do. I re-checked each one myself:

- **The calendar's Deadlines layer has nothing feeding it.**
  `CalendarClient.tsx:40` offers the toggle, and no code anywhere produces a
  `kind: 'deadline'` item.
- **`analytics/page.tsx:29` hardcodes `activeTasks = 0`** and displays it.
- **`bookings/BookingsDayBook.tsx` is orphaned**: nothing imports it.
- **Unread legacy tables**: `service_templates`, `visual_layouts` and
  `workflow_templates` are live in the schema with zero reads in `src/`.
- **`clients.source` is captured and never read**: no page groups by it, and
  0 of 100 clients have one set (agent-reported SQL).
- **The contract portal link is the contract's UUID**, not a revocable token
  like every other client link.

## 7. What this document does not do

It rules nothing, builds nothing and changes no schema. It does not choose
between the gaps in §3 or settle the decisions in §4. Those are the operator's
to make, and this is the evidence to make them against.
