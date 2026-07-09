import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { PresentationEngine } from '@/lib/domains/presentation/engine';
import { getFacingConfig } from '@/app/actions/presentation';
import { submitPublicRequest } from '../../actions';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import styles from '../../storefront.module.css';

interface BookPageProps {
  params: Promise<{
    orgId: string;
    serviceId: string;
  }>;
}

export default async function BookPage({ params }: BookPageProps) {
  const { orgId, serviceId } = await params;
  const supabase = createAdminClient();
  const repo = new KernelRepository(supabase);

  // 1. Resolve Identity & Config
  const rawIdentity = await repo.getIdentity(orgId);
  const facingConfig = await getFacingConfig(orgId).catch(() => ({} as any));

  if (!rawIdentity) {
    notFound();
  }
  const identity = PresentationEngine.resolve(rawIdentity, 'IdentityDTO', { role: 'public', id: 'anonymous' }, facingConfig);

  // 2. Fetch Services and Resolve with Config
  const rawServices = await repo.getServicesByOrganization(orgId);
  const services = PresentationEngine.resolveCollection(rawServices, 'ServiceDTO', { role: 'public', id: 'anonymous' }, facingConfig);
  
  const service = services.find((s: any) => s.id === serviceId);
  if (!service) {
    notFound();
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      
      <Link href={`/${orgId}`} style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--color-text-secondary)', textDecoration: 'none', marginBottom: '2rem', fontSize: '0.875rem', fontWeight: 500 }}>
        <ArrowRight size={16} style={{ marginRight: '0.5rem', transform: 'rotate(180deg)' }} />
        Back to Services
      </Link>

      <div className={styles.formContainer}>
        <div className={styles.formHeader}>
          <h1 className={styles.formTitle}>
            Book your {service.name}
          </h1>
          <p className={styles.formSubtitle}>
            You are requesting this service from <strong>{identity.name}</strong>. Fill out the details to secure your spot.
          </p>
        </div>

        {service.description && (
          <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: 'var(--color-surface-base)', borderRadius: '12px' }}>
            <p style={{ color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6 }}>{service.description}</p>
          </div>
        )}

        <form action={submitPublicRequest}>
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="serviceId" value={serviceId} />

          <div className={styles.formGroup}>
            <label htmlFor="clientName" className={styles.formLabel}>Full Name</label>
            <input
              type="text"
              name="clientName"
              id="clientName"
              required
              className={styles.formInput}
              placeholder="Jane Doe"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="clientEmail" className={styles.formLabel}>Email Address</label>
            <input
              type="email"
              name="clientEmail"
              id="clientEmail"
              required
              className={styles.formInput}
              placeholder="jane@example.com"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="desiredDate" className={styles.formLabel}>Desired Date</label>
            <input
              type="date"
              name="desiredDate"
              id="desiredDate"
              required
              className={styles.formInput}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="message" className={styles.formLabel}>Additional Details</label>
            <textarea
              name="message"
              id="message"
              rows={4}
              className={styles.formInput}
              placeholder="Tell us about your event or any specific requests..."
              style={{ resize: 'vertical' }}
            />
          </div>

          <button type="submit" className={styles.buttonPrimary}>
            Submit Request
            <ArrowRight size={18} />
          </button>
          
          <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.75rem', marginTop: '1rem' }}>
            No payment required to request a booking.
          </p>
        </form>
      </div>
    </div>
  );
}
