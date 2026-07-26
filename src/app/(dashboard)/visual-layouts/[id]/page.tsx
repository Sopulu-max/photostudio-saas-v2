import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { LayoutBuilder } from './Builder';

export default async function LayoutEditorPage(props: {
  params: Promise<{ id: string }>
}) {
  const params = await props.params;
  const { data: layout } = await supabaseAdmin
    .from('visual_layouts')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!layout) notFound();

  // If this layout belongs to a subject (e.g. a service), load the real record
  // so the canvas renders WYSIWYG with actual data.
  let sampleData: Record<string, unknown> = {};
  if (layout.subject_type === 'service' && layout.subject_id) {
    const { data: service } = await supabaseAdmin
      .from('service_templates')
      .select('*')
      .eq('id', layout.subject_id)
      .single();
    if (service) sampleData = { service };
  }

  return <LayoutBuilder initialLayout={layout} sampleData={sampleData} />;
}
