/**
 * Remove a test organization and everything under it.
 *
 * Not every org-scoped table cascades from `organizations` — `events` and
 * `contacts` both refuse the delete, which is defensible in production (the app
 * archives studios, it never deletes them) but means a test must clean up after
 * itself explicitly. The previous cleanup ignored the delete's result, so it had
 * silently never worked and left an organization behind on every single run.
 *
 * Order is child-first. Tables that do cascade are harmless to include.
 */
export const PURGE_ORDER = [
  'events',
  'assignments', 'booking_tasks', 'booking_line_variable_values', 'booking_lines',
  // financial_transactions before contracts: a transaction points at the
  // contract it settles, so contracts cannot go first. Invoices go after the
  // transactions that pay them for the same reason.
  'financial_transactions', 'invoice_lines', 'invoices',
  'delivery_deliverables', 'delivery_assets', 'assets', 'deliveries', 'contracts',
  'bookings',
  'package_tasks', 'package_deliverables', 'package_delivery_containers', 'package_services',
  // Narrowings hang off package_services and go with it, so they need no line.
  'package_variable_values',
  'packages',
  'service_deliverables', 'variables', 'service_dimension_values',
  'services',
  // Was 'blueprints', which no longer exists — that table became these three in
  // the workflow rework, and a delete against a missing table fails silently, so
  // this line had been cleaning up nothing at all.
  'workflow_tasks', 'workflows', 'workflow_templates',
  'employee_roles', 'employees', 'clients',
  'contacts',
  'attendance', 'studio_hours',
  'roles', 'booking_stages', 'delivery_containers', 'deliverables',
  // Values before dimensions before domains: a value points at a dimension,
  // and a dimension at the domain that owns it.
  'dimension_values', 'dimensions', 'service_domains',
] as const;
