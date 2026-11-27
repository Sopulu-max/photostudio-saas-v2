import type { InvoicePackageLine } from '@/weave/payments/shape';
import { money } from '@/weave/store/shape';

export function PackageLines({ lines, currency }: {
  lines: (InvoicePackageLine & { currency?: string })[];
  currency?: string;
}) {
  return (
    <ul className="q-invoice-history">
      {lines.map((line, index) => {
        const code = line.currency ?? currency;
        const unit = line.unitMinor;
        return (
          <li className="q-invoice-payment" key={index}>
            <span className="q-stack q-stack-xs">
              <strong className="q-strong q-invoice-text">{line.name}</strong>
              <span className="q-meta">Qty {line.quantity}{unit !== null && code && ` · ${money(unit, code)} each`}</span>
            </span>
            <span className="q-num">{unit !== null && code
              ? money(unit * line.quantity, code)
              : currency ? 'Included in agreed total' : 'No price set'}</span>
          </li>
        );
      })}
    </ul>
  );
}
