import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listServices } from '@/modules/services/interface';
import type { ServiceDimensionTag } from '@/modules/services/interface';
import { ServicesClient } from './client';

export const dynamic = 'force-dynamic';

/**
 * "Select backwards into their upper classifications": a dimension value
 * tagged on a Service (Context: Outdoor) is a way back up into everything else
 * sharing that classification, not a dead-end label.
 *
 * One parameter does it — ?value= is a dimension_value id, and a value belongs
 * to exactly one dimension of exactly one domain, so it already says which
 * question it answers. ?label= only avoids a second lookup to redisplay what
 * was clicked.
 */
export default async function ServicesPage(props: { searchParams: Promise<{ value?: string; label?: string }> }) {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const sp = await props.searchParams;
  const valueId = sp.value || '';

  const all = await listServices();
  const services = valueId
    ? (all as any[]).filter((s) =>
        ((s.dimensions || []) as ServiceDimensionTag[]).some((d) => d.values.some((v) => v.id === valueId)))
    : all;
  const activeFilter = valueId ? { label: sp.label || 'this classification' } : null;

  return <ServicesClient initialServices={services} activeFilter={activeFilter} />;
}
