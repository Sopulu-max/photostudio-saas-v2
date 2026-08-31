'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setContractTermsTemplate } from '@/modules/contracts/interface';
import { toast, readableError } from '@/components/Toast';

/**
 * The studio's own standard contract language — payment schedule,
 * cancellation policy, usage rights, whatever their business actually runs
 * on. Snapshotted onto every new contract when it's drafted; editing this
 * only changes what future contracts start from.
 */
export function TermsTemplateForm({ initialText }: { initialText: string }) {
  const [text, setText] = useState(initialText);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = text !== initialText;

  const save = () =>
    startTransition(async () => {
      try {
        await setContractTermsTemplate(text);
        toast.ok('The standard terms are saved.');
        router.refresh();
      } catch (e: any) {
        toast.bad(readableError(e, 'Could not save.'));
      }
    });

  return (
    <div className="q-stack q-stack-sm">
      <textarea
        className="q-textarea"
        rows={14}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"e.g.\n\nPayment: 50% deposit is due to confirm this booking; the remaining balance is due 7 days before the session.\n\nCancellation: Deposits are non-refundable within 14 days of the session date.\n\nUsage: All final images remain the property of the studio until payment is received in full."}
      />
      {dirty && (
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending} onClick={save}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" disabled={isPending} onClick={() => setText(initialText)}>
            Cancel
          </button>
        </div>
      )}
      <span className="q-meta-sm">
        This is what new contracts start from. Changing it doesn&rsquo;t touch contracts that already exist.
      </span>
    </div>
  );
}
