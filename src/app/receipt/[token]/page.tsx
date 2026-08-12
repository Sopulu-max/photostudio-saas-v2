import { notFound } from 'next/navigation';
import { getReceiptByToken } from '@/modules/finances/interface';
import { ReceiptDocument } from '@/components/ReceiptDocument';
import { PrintDocumentButton } from '@/components/PrintDocumentButton';
import { DownloadDocumentButton } from '@/components/DownloadDocumentButton';

export const dynamic = 'force-dynamic';

/** The client's copy of a receipt, on a share token. Same model as the gallery. */
export default async function PublicReceiptPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const payment = await getReceiptByToken(params.token);
  if (!payment) notFound();

  const org = payment.organization;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--q-color-paper-subtle)', padding: 'clamp(24px, 5vw, 64px) 20px' }}>
      <div style={{ width: '100%', maxWidth: '720px', margin: '0 auto' }}>
        <div className="q-row q-row-between q-noprint" style={{ marginBottom: '16px' }}>
          <span className="q-meta">{org?.name}</span>
          <div className="q-row">
            <DownloadDocumentButton
              href={`/receipt/${params.token}/pdf`}
              filename={`${payment.receipt_number}.pdf`}
            />
            <PrintDocumentButton label="Print" />
          </div>
        </div>

        <ReceiptDocument payment={payment} studio={org} />
      </div>
    </div>
  );
}
