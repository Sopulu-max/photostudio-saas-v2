import { SupabaseClient } from '@supabase/supabase-js';

type NotificationRule = {
  eventType: string;
  evaluate: (eventPayload: any, context: any) => Promise<{ shouldNotify: boolean; customerId?: string; staffId?: string; message: string }>;
};

// A lightweight rule engine for generating notifications from events
export class NotificationEngine {
  private rules: NotificationRule[] = [];

  constructor(private readonly supabase: SupabaseClient) {
    this.registerDefaultRules();
  }

  private registerDefaultRules() {
    this.rules.push({
      eventType: 'service_instance.waiting',
      evaluate: async (payload, context) => {
        // Example logic: if an instance enters waiting state, maybe notify customer
        return {
          shouldNotify: true,
          customerId: payload.customerId,
          message: 'Your service instance requires your attention.'
        };
      }
    });

    this.rules.push({
      eventType: 'agreement.active',
      evaluate: async (payload, context) => {
        return {
          shouldNotify: true,
          customerId: payload.customerId,
          message: `Agreement AGR-${payload.id?.slice(0,8).toUpperCase()} is now active. An invoice has been generated.`
        };
      }
    });
  }

  async processEvent(orgId: string, eventType: string, entityId: string, payload: any = {}) {
    const matchingRules = this.rules.filter(r => r.eventType === eventType);
    
    for (const rule of matchingRules) {
      try {
        const result = await rule.evaluate(payload, { entityId, orgId });
        if (result.shouldNotify) {
          await this.supabase.from('notifications').insert({
            organization_id: orgId,
            customer_id: result.customerId,
            staff_id: result.staffId,
            trigger_event: eventType,
            message: result.message,
            status: 'queued'
          });
        }
      } catch (err) {
        console.error(`Error processing notification rule for ${eventType}:`, err);
      }
    }
  }

  async getNotifications(orgId: string, customerId?: string) {
    let query = this.supabase
      .from('notifications')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
}
