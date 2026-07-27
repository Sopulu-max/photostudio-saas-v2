import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getOptionalAuthOrgId } from '@/lib/supabase/getOrgId';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Authenticate and scope to the caller's org. Without this, any caller could
  // overwrite any contract's terms across any tenant (Multi-Tenant Mandate).
  const auth = await getOptionalAuthOrgId();
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  const { data, error } = await supabaseAdmin
    .from('contracts')
    .update({ terms: body.terms })
    .eq('id', id)
    .eq('organization_id', auth.orgId)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  return NextResponse.json(data);
}
