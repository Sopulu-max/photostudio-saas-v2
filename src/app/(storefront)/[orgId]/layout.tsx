import { createAdminClient } from '@/lib/supabase/admin';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { PresentationEngine } from '@/lib/domains/presentation/engine';
import { getFacingConfig } from '@/app/actions/presentation';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';
import styles from './storefront.module.css';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ orgId: string }>;
}

export default async function StorefrontLayout({
  children,
  params,
}: LayoutProps) {
  const { orgId } = await params;
  
  const supabase = createAdminClient();
  const repo = new KernelRepository(supabase);
  
  // 1. Fetch Identity and Config
  const identityRaw = await repo.getIdentity(orgId);
  const facingConfig = await getFacingConfig(orgId).catch(() => ({}));

  if (!identityRaw) {
    notFound();
  }

  // 2. Resolve for Public Audience with Config
  const identity = PresentationEngine.resolve(identityRaw, 'IdentityDTO', { role: 'public', id: 'anonymous' }, facingConfig);

  // 3. Extract Design Tokens from DB config into the CSS variables required by globals.css
  const primaryColor = identity.brandColors?.primary || '#d4af37';
  const onPrimaryColor = identity.brandColors?.secondary || '#ffffff';
  
  return (
    <div 
      className={styles.container}
      style={{
        '--color-brand-primary': primaryColor,
        '--color-brand-on-primary': onPrimaryColor,
      } as React.CSSProperties}
    >
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLogo}>
            {identity.logoUrl ? (
              <img src={identity.logoUrl} alt={identity.name} style={{ height: '40px', width: 'auto', objectFit: 'contain' }} />
            ) : (
              <div className={styles.logoFallback}>
                {identity.name.charAt(0)}
              </div>
            )}
            <span>{identity.name}</span>
          </div>
          
          <nav className={styles.headerNav}>
            <a href={`/${orgId}`} className={styles.navLink}>Services</a>
            <a href={`/${orgId}/portfolio`} className={styles.navLink}>Portfolio</a>
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        {children}
      </main>

      <footer className={styles.footer}>
        <p>&copy; {new Date().getFullYear()} {identity.name}. All rights reserved.</p>
        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.7 }}>Powered by the Studio Infrastructure</p>
      </footer>
    </div>
  );
}
