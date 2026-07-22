import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PersonDetailsPage({ params }: { params: { id: string } }) {
  const { orgId } = await getAuthOrgId();

  const { data: person } = await supabaseAdmin
    .from('persons')
    .select(`
      *,
      agreements(id, version, status, created_at),
      intents(id, status, created_at)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single();

  if (!person) notFound();

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '64px' }}>
      <header className="q-page-header">
        <div style={{ marginBottom: '16px' }}>
          <Link href="/people" style={{ color: 'var(--q-color-ink-500)', textDecoration: 'none', fontSize: '0.875rem' }}>
            &larr; Back to Directory
          </Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="q-page-title">{person.display_name}</h1>
            <p className="q-page-subtitle">Role: <span style={{ textTransform: 'capitalize' }}>{person.role}</span></p>
          </div>
          <span className={`q-badge ${person.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>
            {person.status.toUpperCase()}
          </span>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        <div className="q-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', fontWeight: 600 }}>Contact Info</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '4px' }}>Email Address</div>
              <div style={{ fontSize: '1rem', fontWeight: 500 }}>{person.email || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '4px' }}>Phone Number</div>
              <div style={{ fontSize: '1rem', fontWeight: 500 }}>{person.phone || '—'}</div>
            </div>
          </div>
        </div>

        <div className="q-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', fontWeight: 600 }}>History</h2>
          
          <h3 style={{ fontSize: '1rem', marginTop: '16px', marginBottom: '8px', color: 'var(--q-color-ink-600)' }}>Agreements</h3>
          {!person.agreements || person.agreements.length === 0 ? (
            <div style={{ color: 'var(--q-color-ink-500)', fontSize: '0.875rem', marginBottom: '16px' }}>No agreements found.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
              {person.agreements.map((agr: any) => (
                <div key={agr.id} style={{ padding: '12px', border: '1px solid var(--q-color-ink-100)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Agreement v{agr.version}</span>
                  <Link href={`/agreements/${agr.id}`} style={{ color: 'var(--q-color-primary)', textDecoration: 'none' }}>View</Link>
                </div>
              ))}
            </div>
          )}

          <h3 style={{ fontSize: '1rem', marginTop: '16px', marginBottom: '8px', color: 'var(--q-color-ink-600)' }}>Intents</h3>
          {!person.intents || person.intents.length === 0 ? (
            <div style={{ color: 'var(--q-color-ink-500)', fontSize: '0.875rem' }}>No intents found.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {person.intents.map((intent: any) => (
                <div key={intent.id} style={{ padding: '12px', border: '1px solid var(--q-color-ink-100)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Intent ({new Date(intent.created_at).toLocaleDateString()})</span>
                  <Link href={`/intents/${intent.id}`} style={{ color: 'var(--q-color-primary)', textDecoration: 'none' }}>View</Link>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
