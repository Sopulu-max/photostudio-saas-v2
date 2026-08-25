import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://qvscrdunkqkiswxvxbbm.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2c2NyZHVua3FraXN3eHZ4YmJtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzAyODMxMSwiZXhwIjoyMDk4NjA0MzExfQ.q3rkOEcpOjjqOcv_KoqWATQlUVr1WOfJUQe-gOH02i8";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, title, scheduled_for, duration_minutes, created_at, stage_id,
      stage:booking_stages(id, name, kind, color),
      contact:contacts(id, display_name, email),
      booking_lines(
        id, title, price, quantity, package_id, status, created_at, current_label_id,
        current_label:service_domain_labels(id, name, color),
        package:packages(
          id,
          package_services(service:services(service_domain_id))
        ),
        assignments(
          id, employee_id, role_id,
          employee:employees(id, contact:contacts(display_name)),
          role:roles(id, name)
        )
      ),
      contracts(id, version, status, terms, created_at),
      financial_transactions(id, type, amount, currency, status, direction)
    `)
    .limit(10);

  if (error) {
    console.error("ERROR:", JSON.stringify(error, null, 2));
  } else {
    console.log("SUCCESS, found", data.length, "bookings");
  }
}

run();
