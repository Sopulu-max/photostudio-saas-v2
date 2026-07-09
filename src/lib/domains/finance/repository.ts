import { SupabaseClient } from '@supabase/supabase-js';

export class FinanceRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getInvoices(orgId: string) {
    const { data, error } = await this.supabase
      .from('invoices')
      .select('*, agreements(id, customer_id)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getInvoiceById(orgId: string, invoiceId: string) {
    const { data, error } = await this.supabase
      .from('invoices')
      .select('*, payments(*)')
      .eq('id', invoiceId)
      .eq('organization_id', orgId)
      .single();

    if (error) throw error;
    return data;
  }

  async getPayments(orgId: string) {
    const { data, error } = await this.supabase
      .from('payments')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getExpenses(orgId: string) {
    const { data, error } = await this.supabase
      .from('expenses')
      .select('*')
      .eq('organization_id', orgId)
      .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async recordPayment(orgId: string, invoiceId: string, amount: number, method: string) {
    const { data: payment, error: paymentError } = await this.supabase
      .from('payments')
      .insert({
        organization_id: orgId,
        invoice_id: invoiceId,
        amount,
        method,
        status: 'settled'
      })
      .select()
      .single();

    if (paymentError) throw paymentError;

    // Fetch the invoice to see if it's fully paid
    const { data: invoice } = await this.supabase
      .from('invoices')
      .select('total_amount, payments(amount)')
      .eq('id', invoiceId)
      .single();

    if (invoice) {
      const totalPaid = (invoice.payments || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      if (totalPaid >= Number(invoice.total_amount)) {
        await this.supabase
          .from('invoices')
          .update({ status: 'paid' })
          .eq('id', invoiceId);
      }
    }

    return payment;
  }

  async recordExpense(orgId: string, amount: number, description: string) {
    const { data, error } = await this.supabase
      .from('expenses')
      .insert({
        organization_id: orgId,
        amount,
        description
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
