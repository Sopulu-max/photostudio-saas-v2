import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AgreementForm } from './form';

export default async function AgreementEditorPage(props: {
  params: Promise<{ id: string }>
}) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = user?.user_metadata?.organization_id;

  const { data: agreement } = await supabaseAdmin
    .from('agreements')
    .select(`
      *,
      person:persons(*),
      intent:intents(
        service_template_id,
        template:service_templates(name, default_workflow_template_id)
      )
    `)
    .eq('id', params.id)
    .single();

  if (!agreement) notFound();

  // Fetch real org slug
  let orgSlug = 'studio';
  if (orgId) {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('slug')
      .eq('id', orgId)
      .single();
    if (org?.slug) orgSlug = org.slug;
  }

  return <AgreementForm agreement={agreement} orgSlug={orgSlug} />;
}
