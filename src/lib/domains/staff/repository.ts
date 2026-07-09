import { SupabaseClient } from '@supabase/supabase-js';

export class StaffRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getStaffMembers(orgId: string) {
    const { data, error } = await this.supabase
      .from('staff')
      .select('*, staff_capabilities(capabilities(*))')
      .eq('organization_id', orgId);

    if (error) throw error;
    return data || [];
  }

  async getCapabilities(orgId: string) {
    const { data, error } = await this.supabase
      .from('capabilities')
      .select('*')
      .eq('organization_id', orgId);

    if (error) throw error;
    return data || [];
  }

  async assignCapability(staffId: string, capabilityId: string) {
    const { data, error } = await this.supabase
      .from('staff_capabilities')
      .insert({ staff_id: staffId, capability_id: capabilityId })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async removeCapability(staffId: string, capabilityId: string) {
    const { error } = await this.supabase
      .from('staff_capabilities')
      .delete()
      .eq('staff_id', staffId)
      .eq('capability_id', capabilityId);

    if (error) throw error;
  }
}
