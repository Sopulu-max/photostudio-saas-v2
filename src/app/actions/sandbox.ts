"use server";

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { KernelOperations } from '@/lib/domains/kernel/operations';

export async function launchSandboxAction() {
  try {
    const admin = createAdminClient();
    const serverClient = await createClient();

    const email = `sandbox_${Date.now()}@studio.local`;
    const password = "sandboxPassword123!";
    
    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (userError || !userData.user) throw new Error(`Auth failed: ${userError?.message}`);
    const userId = userData.user.id;

    const repo = new KernelRepository(admin);
    const ops = new KernelOperations(admin, repo);

    const orgId = await ops.createOrganization({ 
      name: `Demo Studio ${Date.now()}`, 
      ownerId: userId 
    });

    await admin.auth.admin.updateUserById(userId, {
      user_metadata: { org_id: orgId }
    });

    await ops.enrichIdentity(orgId, {
      name: "The Sandbox Studio",
      brandColors: { primary: "#d4af37" }
    });

    const serviceId = await ops.defineService(orgId, {
      name: "Premium Headshots",
      description: "A 45-minute studio session perfect for professionals.",
      pricingRules: { basePrice: 250, currency: "USD" }
    });
    
    await admin.from('surface_configurations').insert({
      organization_id: orgId,
      facing_config: { portfolioEnabled: true }
    });

    const customerId = await ops.createCustomer(orgId, "client@example.com", {
      name: "Demo Client",
      email: "client@example.com",
      source: "sandbox"
    });

    // Create the request
    const reqId = await ops.submitRequest(orgId, customerId, [{
      serviceId,
      notes: "Looking forward to this!",
    }]);
    
    // Resolve the request, this creates a proposed agreement
    await ops.resolveRequest(orgId, reqId, 'accept');

    // Get the proposed agreement and activate it to trigger the invoice creation
    const agreements = await repo.getAgreementsByOrganization(orgId);
    if (agreements.length > 0) {
      await ops.activateAgreement(orgId, agreements[0].id);
      
      // Mark the invoice as paid to give us some Net Revenue
      const { data } = await admin.from('invoices' as any).select('id').eq('agreement_id', agreements[0].id);
      const invoices = data as any[];
      if (invoices && invoices.length > 0) {
        await admin.from('invoices' as any).update({ status: 'paid' }).eq('id', invoices[0].id);
      }
    }

    // Seed Staff & Capabilities
    const { data: cap1Data } = await admin.from('capabilities' as any).insert({ organization_id: orgId, name: 'Studio Lighting', description: 'Expert in studio strobes' }).select().single();
    const { data: cap2Data } = await admin.from('capabilities' as any).insert({ organization_id: orgId, name: 'Retouching', description: 'High-end beauty retouching' }).select().single();
    
    const { data: staff1Data } = await admin.from('staff' as any).insert({ organization_id: orgId, name: 'Alice (Lead)', email: 'alice@studio.local', role: 'admin' }).select().single();
    const { data: staff2Data } = await admin.from('staff' as any).insert({ organization_id: orgId, name: 'Bob (Assistant)', email: 'bob@studio.local', role: 'staff' }).select().single();

    const cap1 = cap1Data as any;
    const cap2 = cap2Data as any;
    const staff1 = staff1Data as any;
    const staff2 = staff2Data as any;

    if (cap1 && cap2 && staff1 && staff2) {
      await admin.from('staff_capabilities' as any).insert([
        { staff_id: staff1.id, capability_id: cap1.id },
        { staff_id: staff1.id, capability_id: cap2.id },
        { staff_id: staff2.id, capability_id: cap1.id }
      ]);
    }

    // Seed an Expense to make the ledger interesting
    await admin.from('expenses' as any).insert({
      organization_id: orgId,
      amount: 45.50,
      currency: 'USD',
      description: 'Backdrop paper roll'
    });

    const { error: signInError } = await serverClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) throw new Error(`SignIn failed: ${signInError.message}`);

    return { success: true };
  } catch (e) {
    console.error("Sandbox Launch Error:", e);
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
