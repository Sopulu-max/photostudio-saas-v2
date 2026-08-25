-- Add current_task_id to booking_lines
alter table booking_lines add column current_task_id uuid references booking_line_tasks(id) on delete set null;

-- Drop current_label_id and service_domain_labels
alter table booking_lines drop column current_label_id;
drop table service_domain_labels cascade;
