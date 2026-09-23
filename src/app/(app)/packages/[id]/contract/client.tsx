'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updatePackage } from '@/modules/packages/interface';

export function PackageContractClient({
  packageId,
  packageName,
  initialTerms,
  fallbackTerms,
  isMember,
}: {
  packageId: string;
  packageName: string;
  initialTerms: string | null;
  fallbackTerms: string;
  isMember: boolean;
}) {
  const router = useRouter();
  const [terms, setTerms] = useState(initialTerms || '');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOverridden = typeof initialTerms === 'string';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    try {
      // If it's cleared, we pass an empty string which we'll map to null so it inherits.
      await updatePackage({
        packageId,
        contractTerms: terms.trim() || null,
      });
      router.push(`/packages/${packageId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to save contract terms');
      setIsPending(false);
    }
  };

  const handleRevert = async () => {
    if (!window.confirm('Revert to the default inherited terms? The custom text will be lost.')) return;
    setIsPending(true);
    setError(null);
    try {
      await updatePackage({
        packageId,
        contractTerms: null,
      });
      router.push(`/packages/${packageId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to revert contract terms');
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="q-stack q-stack-xl">
      <section className="q-subsection">
        <h2 className="q-subsection-title">Contract Terms</h2>
        <div className="q-prose" style={{ color: 'var(--q-color-ink-600)', marginBottom: '16px' }}>
          <p>
            {isMember
              ? `A member defaults to its family's contract. If you edit the text below, this member will break away and use its own contract instead.`
              : `A package defaults to the studio's standard contract. If you edit the text below, this package will break away and use its own contract instead.`}
          </p>
        </div>
        
        {error && <div className="q-alert q-alert-error">{error}</div>}

        <div className="q-field">
          <label className="q-label">Agreement Text</label>
          <textarea
            className="q-input"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder={terms ? undefined : fallbackTerms}
            rows={20}
          />
        </div>
      </section>

      <div className="q-bar">
        <button type="submit" className="q-btn q-btn-primary" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save terms'}
        </button>
        {isOverridden && (
          <button type="button" className="q-btn q-btn-secondary" disabled={isPending} onClick={handleRevert}>
            Revert to default
          </button>
        )}
      </div>
    </form>
  );
}
