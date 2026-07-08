import { createAdminClient } from '@/lib/supabase/admin';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { PresentationEngine } from '@/lib/domains/presentation/engine';
import { getFacingConfig } from '@/app/actions/presentation';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import styles from './storefront.module.css';

interface StorefrontPageProps {
  params: Promise<{ orgId: string }>;
}

export default async function StorefrontPage({ params }: StorefrontPageProps) {
  const { orgId } = await params;
  const supabase = createAdminClient();
  const repo = new KernelRepository(supabase);
  
  // 1. Fetch raw data
  const rawServices = await repo.getServicesByOrganization(orgId);
  const rawIdentity = await repo.getIdentity(orgId);
  const facingConfig = await getFacingConfig(orgId).catch(() => ({}));
  
  if (!rawIdentity) {
    return (
      <div style={{ display: 'flex', height: '50vh', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>Organization not found</p>
      </div>
    );
  }

  // 2. Resolve for Public Audience with the Studio's specific Configuration
  const services = PresentationEngine.resolveCollection(rawServices, 'ServiceDTO', { role: 'public', id: 'anonymous' }, facingConfig);
  const identity = PresentationEngine.resolve(rawIdentity, 'IdentityDTO', { role: 'public', id: 'anonymous' }, facingConfig);

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroBadge}>
          <Sparkles className={styles.heroIcon} />
          <span>Available for Bookings</span>
        </div>

        <h2 className={styles.heroTitle}>
          Capture your story with <br/>
          <span className={styles.heroTitleBrand}>
            {identity.name}
          </span>
        </h2>
        <p className={styles.heroSubtitle}>
          Select a service below to request a booking. We'll review your request and confirm the details.
        </p>
      </section>

      <section className={styles.grid}>
        {services.map((service, idx) => (
          <Link 
            key={service.id} 
            href={`/${orgId}/book/${service.id}`}
            style={{ textDecoration: 'none' }}
          >
            <div className={styles.card} style={{ animationDelay: `${idx * 100}ms` }}>
              <div className={styles.cardImagePlaceholder}>
                <span style={{ fontSize: '3rem', opacity: 0.1 }}>📸</span>
              </div>
              
              <div className={styles.cardContent}>
                <h3 className={styles.cardTitle}>
                  {service.name}
                </h3>
                
                {service.description ? (
                  <p className={styles.cardDescription}>
                    {service.description}
                  </p>
                ) : (
                  <div style={{ flex: 1, marginBottom: '2rem' }} />
                )}
                
                <div className={styles.cardFooter}>
                  <div className={styles.cardPriceBox}>
                    <span className={styles.cardPriceLabel}>Starting from</span>
                    <span className={styles.cardPrice}>
                      {service.pricingRules?.basePrice ? `$${service.pricingRules.basePrice.toLocaleString()}` : 'Custom Quote'}
                    </span>
                  </div>
                  
                  <div className={styles.cardAction}>
                    <ArrowRight size={20} />
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}

        {services.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: '6rem 2rem', textAlign: 'center', backgroundColor: 'var(--color-surface-elevated)', border: '1px solid var(--color-border-subtle)', borderRadius: '12px' }}>
            <Sparkles size={32} style={{ color: 'var(--color-text-tertiary)', margin: '0 auto 1rem auto' }} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>No services available</h3>
            <p style={{ color: 'var(--color-text-secondary)' }}>This studio hasn't listed any public services yet.</p>
          </div>
        )}
      </section>
    </>
  );
}
