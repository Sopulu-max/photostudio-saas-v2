-- Add package_service_id to booking_line_tasks to group tasks by bundled service
alter table booking_line_tasks add column package_service_id uuid references package_services(id) on delete set null;

-- Remove the old status column (this might have been dropped by 20260914000001, but we'll use IF EXISTS just in case)
alter table booking_line_tasks drop column if exists status;

-- Add completed_at timestamp
alter table booking_line_tasks add column completed_at timestamptz;

-- Also, remove current_task_id from booking_lines since we are using inferred progression
alter table booking_lines drop column if exists current_task_id;
