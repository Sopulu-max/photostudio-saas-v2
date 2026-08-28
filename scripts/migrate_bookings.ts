import { supabaseAdmin } from '../src/lib/supabase/admin.js';
import { duplicatePackage } from '../src/modules/packages/domain.js';

async function migrateHistoricalBookings() {
  console.log('Fetching all bookings...');
  
  // Find all booking lines that are currently pointing to an 'active' package
  const { data: lines, error } = await supabaseAdmin
    .from('booking_lines')
    .select('id, package_id, package:packages(status)')
    .not('package_id', 'is', null);

  if (error) {
    console.error('Failed to fetch booking lines:', error);
    process.exit(1);
  }

  const linesToMigrate = lines.filter((line: any) => line.package?.status === 'active');
  console.log(`Found ${linesToMigrate.length} booking lines pointing to active packages.`);

  for (const line of linesToMigrate) {
    console.log(`Migrating booking line ${line.id} (Package: ${line.package_id})...`);
    
    try {
      // Create a private clone of the package
      const { packageId: cloneId } = await duplicatePackage(line.package_id);
      
      // The duplicated package defaults to 'active'. Update it to 'custom' and rename it.
      await supabaseAdmin
        .from('packages')
        .update({ status: 'custom', name: 'Historical Package (Instance)' })
        .eq('id', cloneId);
      
      // Point the booking line to the new clone
      await supabaseAdmin
        .from('booking_lines')
        .update({ package_id: cloneId })
        .eq('id', line.id);
        
      console.log(`  -> Successfully migrated to private clone ${cloneId}`);
    } catch (err) {
      console.error(`  -> Failed to migrate line ${line.id}:`, err);
    }
  }
  
  console.log('Migration complete.');
}

migrateHistoricalBookings().catch(console.error);
