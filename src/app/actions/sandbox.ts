"use server";

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { KernelOperations } from '@/lib/domains/kernel/operations';

export async function launchSandboxAction() {
  try {
    const admin = createAdminClient();
    const serverClient = await createClient(); // For auth sign-in

    // 1. Create a dummy user using Admin API (auto-confirms)
    const email = `sandbox_${Date.now()}@studio.local`;
    const password = "sandboxPassword123!";
    
    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (userError || !userData.user) {
      throw new Error(`Auth failed: ${userError?.message}`);
    }

    const userId = userData.user.id;

    // 2. Initialize the repo with the admin client to bypass RLS initially for seeding
    const repo = new KernelRepository(admin);
    const ops = new KernelOperations(admin, repo);

    // 3. Create Organization & Identity baseline
    const orgId = await ops.createOrganization({ 
      name: `Demo Studio ${Date.now()}`, 
      ownerId: userId 
    });

    // 4. Link User to Org (via app_metadata/user_metadata for JWT claim)
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: { org_id: orgId }
    });

    // 5. Seed Identity
    await ops.enrichIdentity(orgId, {
      name: "The Sandbox Studio",
      brandColors: { primary: "#d4af37" }
    });

    // 6. Seed a Service
    const serviceId = await ops.defineService(orgId, {
      name: "Premium Headshots",
      description: "A 45-minute studio session perfect for professionals.",
      pricingRules: { basePrice: 250, currency: "USD" }
    });
    
    // Make sure the storefront has portfolio enabled
    const { error: surfaceError } = await admin.from('surface_configurations').insert({
      organization_id: orgId,
      facing_config: { portfolioEnabled: true }
    });
    
    if (surfaceError) throw new Error(`Surface config failed: ${surfaceError.message}`);

    // 7. Seed an Instance (to show in the Pipeline)
    // We create a fake customer first so foreign key constraints pass
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
    
    await ops.resolveRequest(orgId, reqId, 'accept');

    // 8. Log the user in to get the cookie set for this session
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
