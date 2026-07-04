import { createClient } from '@supabase/supabase-js';
import { KernelRepository } from './src/lib/domains/kernel/repository';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables (ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set)
dotenv.config({ path: resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Using admin key to bypass RLS for the simulation script

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local (need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const repo = new KernelRepository(supabase as any);

const ORG_ID = '11111111-2222-3333-4444-555555555555'; // Lumiere Studios Lagos

// Real services seeded in the database
const SERVICES = {
  PASSPORT: '00000000-0000-0000-0000-000000000001',
  PORTRAIT: '00000000-0000-0000-0000-000000000002',
  WEDDING_TRADITIONAL: '00000000-0000-0000-0000-000000000003',
  WEDDING_WHITE: '00000000-0000-0000-0000-000000000004',
  PHOTOBOOK: '00000000-0000-0000-0000-000000000005',
  FRAME: '00000000-0000-0000-0000-000000000006'
};

async function simulateWeek() {
  console.log("==================================================");
  console.log(" Lumiere Studios Lagos: A Week in the Life");
  console.log("==================================================\n");

  try {
    // ---------------------------------------------------------
    // MONDAY: A Walk-in Passport Photo
    // ---------------------------------------------------------
    console.log("📅 MONDAY: Walk-in customer needs a passport photo for a visa application.");
    const customer1 = await repo.createCustomer(ORG_ID, '+2348031111111', { name: 'Emeka Uzo' });
    const req1 = await repo.createRequest(ORG_ID, customer1.id, { serviceId: SERVICES.PASSPORT, name: 'Visa Passport Photo' });
    const agr1 = await repo.createAgreement(ORG_ID, customer1.id, req1.id, { price: 5000, currency: 'NGN' });
    const inst1 = await repo.createServiceInstance(ORG_ID, agr1.id, SERVICES.PASSPORT, { origin: 'Walk-in' });
    
    // Shoot happens immediately, delivered 15 mins later
    await repo.transitionInstance(ORG_ID, inst1.id, 'completed');
    await repo.transitionInstance(ORG_ID, inst1.id, 'delivered');
    console.log(`✅ Emeka's passport photos delivered. ₦5,000 earned.\n`);

    // ---------------------------------------------------------
    // WEDNESDAY: A couple books a Traditional Wedding
    // ---------------------------------------------------------
    console.log("📅 WEDNESDAY: A couple comes in to book their Traditional Wedding.");
    const customer2 = await repo.createCustomer(ORG_ID, '+2348052222222', { name: 'Aisha & Tunde' });
    const req2 = await repo.createRequest(ORG_ID, customer2.id, { serviceId: SERVICES.WEDDING_TRADITIONAL, name: 'Traditional Wedding Booking' });
    const agr2 = await repo.createAgreement(ORG_ID, customer2.id, req2.id, { price: 350000, currency: 'NGN', note: 'Deposit paid 150k' });
    const inst2 = await repo.createServiceInstance(ORG_ID, agr2.id, SERVICES.WEDDING_TRADITIONAL, { date: '2026-08-15', location: 'Ikeja' });
    
    // Instance goes to scheduled
    await repo.transitionInstance(ORG_ID, inst2.id, 'scheduled');
    console.log(`✅ Aisha & Tunde's wedding scheduled. ₦350,000 agreement active.\n`);

    // ---------------------------------------------------------
    // FRIDAY: An old customer returns to print a Wall Frame
    // ---------------------------------------------------------
    console.log("📅 FRIDAY: An old customer wants a 24x36 Canvas frame from a previous shoot.");
    const customer3 = await repo.createCustomer(ORG_ID, '+2348093333333', { name: 'Mrs. Folashade' });
    const req3 = await repo.createRequest(ORG_ID, customer3.id, { serviceId: SERVICES.FRAME, name: '24x36 Canvas Frame' });
    const agr3 = await repo.createAgreement(ORG_ID, customer3.id, req3.id, { price: 85000, currency: 'NGN' });
    const inst3 = await repo.createServiceInstance(ORG_ID, agr3.id, SERVICES.FRAME, { size: '24x36', type: 'Canvas' });
    
    // Instance is waiting on the printer
    await repo.transitionInstance(ORG_ID, inst3.id, 'waiting');
    console.log(`✅ Mrs. Folashade's frame order recorded. Instance is 'waiting' on production.\n`);

    console.log("==================================================");
    console.log(" 🌟 WEEK SUMMARY");
    console.log("==================================================");
    console.log(" Total Walk-ins Recorded: 1");
    console.log(" Total Weddings Booked: 1");
    console.log(" Total Products Ordered: 1");
    console.log(" Total Pipeline Value: ₦440,000");
    console.log(" The memory is intact. The studio remembers.");

  } catch (error) {
    console.error("❌ Simulation Failed:", error);
  }
}

simulateWeek();
