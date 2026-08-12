import { notFound } from 'next/navigation';
import { getInvoiceByToken } from '@/modules/finances/interface';
import { InvoiceDocument } from '@/components/InvoiceDocument';
import { PrintDocumentButton } from '@/components/PrintDocumentButton';
import { DownloadDocumentButton } from '@/components/DownloadDocumentButton';

export const dynamic = 'force-dynamic';

/**
 * The client's own copy, on a share token — the same capability model as a
 * delivery gallery, and the same reason: no account, no session, just the link
 * they were sent. They can save it as a PDF themselves.
 *
 * There is no separate receipt page. Once the payments cover it, this document
 * heads itself Receipt and the outstanding line reads as settled. A second
 * page would be two records of one fact, and one of them would be wrong.
 */
export default async function PublicInvoicePage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const invoice = await getInvoiceByToken(params.token);
  if (!invoice) notFound();

  const org = (invoice as any).organization;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--q-color-paper-subtle)', padding: 'clamp(24px, 5vw, 64px) 20px' }}>
      <div style={{ width: '100%', maxWidth: '720px', margin: '0 auto' }}>
        <div className="q-row q-row-between q-noprint" style={{ marginBottom: '16px' }}>
          <span className="q-meta">{org?.name}</span>
          <div className="q-row">
            <DownloadDocumentButton
              href={`/invoice/${params.token}/pdf`}
              filename={`${invoice.number || 'invoice'}.pdf`}
            />
            <PrintDocumentButton label="Print" />
          </div>
        </div>

        <InvoiceDocument invoice={invoice} studio={org} />

        <p className="q-meta-sm q-noprint" style={{ textAlign: 'center', marginTop: '20px' }}>
          Questions about this? Reply to {org?.name} directly.
        </p>
      </div>
    </div>
  );
}
