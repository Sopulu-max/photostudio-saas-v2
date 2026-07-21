import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { LayoutBuilder } from './Builder';

export default async function LayoutEditorPage({
  params
}: {
  params: { id: string }
}) {
  const { data: layout } = await supabaseAdmin
    .from('visual_layouts')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!layout) notFound();

  return <LayoutBuilder initialLayout={layout} />;
}
