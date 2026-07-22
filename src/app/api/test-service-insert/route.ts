import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('service_templates')
      .insert([{
        organization_id: 'c9e52878-5c9e-4453-a431-cca333d2ba28',
        name: 'Test Service',
        default_workflow_template_id: null,
        pricing: {},
        resource_requirements: {},
        role_requirements: {},
        deliverable_spec: {},
        form_schema: [],
        status: 'active',
      }])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message, details: error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, stack: err.stack }, { status: 500 });
  }
}
