import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listServices, getEnabledDimensions } from '@/modules/services/interface';
import type { Dimension } from '@/modules/services/interface';
import { ServicesClient } from './client';

export const dynamic = 'force-dynamic';

const DIM_KEY: Record<Dimension, string> = {
  subject: 'subject', occasion: 'occasion', context: 'context', purpose: 'purpose', client: 'client_type',
};

/**
 * "Select backwards into their upper classifications": a dimension value
 * tagged on a Service (Context: Outdoor) is a way back up into everything
 * else sharing that classification, not a dead-end label. ?dim=&id= filters
 * to that; ?label= just avoids a second lookup to redisplay what was clicked.
 */
export default async function ServicesPage(props: { searchParams: Promise<{ dim?: string; id?: string; label?: string }> }) {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const sp = await props.searchParams;
  const dim = (sp.dim || '') as Dimension;
  const filterId = sp.id || '';
  const isFiltered = !!(dim && filterId && DIM_KEY[dim]);

  const [all, enabledDimensions] = await Promise.all([listServices(), getEnabledDimensions()]);
  const services = isFiltered ? (all as any[]).filter((s) => s[DIM_KEY[dim]]?.id === filterId) : all;
  const activeFilter = isFiltered ? { dim, label: sp.label || '' } : null;

  return <ServicesClient initialServices={services} enabledDimensions={enabledDimensions} activeFilter={activeFilter} />;
}
