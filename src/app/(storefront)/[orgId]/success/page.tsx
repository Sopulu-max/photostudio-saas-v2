import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { PresentationEngine } from '@/lib/domains/presentation/engine';
import { getFacingConfig } from '@/app/actions/presentation';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import styles from '../storefront.module.css';

interface SuccessPageProps {
  params: Promise<{
    orgId: string;
  }>;
}

export default async function SuccessPage({ params }: SuccessPageProps) {
  const { orgId } = await params;
  const supabase = createAdminClient();
  const repo = new KernelRepository(supabase);

  // 1. Fetch Identity and Config
  const rawIdentity = await repo.getIdentity(orgId);
  const facingConfig = await getFacingConfig(orgId).catch(() => ({}));

  if (!rawIdentity) {
    notFound();
  }
  
  // 2. Resolve for Public Audience with Config
  const identity = PresentationEngine.resolve(rawIdentity, 'IdentityDTO', { role: 'public', id: 'anonymous' }, facingConfig);

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className={styles.successContainer}>
        
        <div className={styles.successIconWrapper}>
          <CheckCircle2 className={styles.successIcon} />
        </div>
        
        <h1 className={styles.successTitle}>
          Request Sent!
        </h1>
        
        <p className={styles.successText}>
          Thank you. Your booking request has been securely sent to <strong>{identity.name}</strong>. They will review your details and be in touch shortly to confirm your session.
        </p>
        
        <Link 
          href={`/${orgId}`}
          className={styles.buttonPrimary}
          style={{ textDecoration: 'none', display: 'inline-flex', width: 'auto', padding: '1rem 2rem' }}
        >
          <span>Return to Storefront</span>
          <ArrowRight size={18} />
        </Link>
      </div>
    </div>
  );
}
