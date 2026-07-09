import React from 'react';
import Link from 'next/link';
import { Layers, Box, CheckSquare, Briefcase, User, CalendarDays, Compass, Zap, DollarSign } from 'lucide-react';
import { SyncStateIndicator } from '@/components/layout/SyncStateIndicator';
import { getSession } from '@/lib/auth';
import { signOut } from '@/app/actions/auth';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { createClient } from '@/lib/supabase/server';
import { SandboxLauncher } from '@/components/sandbox/SandboxLauncher';

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  
  if (!session?.orgId) {
    return <SandboxLauncher />;
  }

  let studioName = 'Studio OS';
  let primaryColor = '';
  
  try {
    const supabase = await createClient();
    const repo = new KernelRepository(supabase);
    const identity = await repo.getIdentity(session.orgId);
    if (identity?.name) {
      studioName = identity.name;
    }
    if (identity?.brandColors && typeof identity.brandColors === 'object' && 'primary' in identity.brandColors) {
      primaryColor = identity.brandColors.primary as string;
    }
  } catch (e) {
    // ignore
  }

  const backgroundStyle = {
    flex: 1, 
    overflowY: 'auto' as 'auto',
    backgroundColor: 'var(--color-surface-base)',
    backgroundImage: `
      radial-gradient(at 100% 0%, rgba(212, 175, 55, 0.05) 0px, transparent 50%),
      radial-gradient(at 0% 100%, rgba(212, 175, 55, 0.03) 0px, transparent 50%)
    `,
    position: 'relative' as 'relative',
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      
      {primaryColor && (
        <style dangerouslySetInnerHTML={{__html: `
          :root {
            --color-brand-primary: ${primaryColor};
            --color-brand-gradient: linear-gradient(135deg, ${primaryColor} 0%, color-mix(in srgb, ${primaryColor} 80%, black) 100%);
            --shadow-glow: 0 0 20px color-mix(in srgb, ${primaryColor} 15%, transparent);
          }
        `}} />
      )}

      {/* PREMIUM SIDEBAR */}
      <nav style={{
        width: '260px',
        background: 'var(--color-surface-elevated)',
        borderRight: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 16px',
        zIndex: 10,
        boxShadow: 'var(--shadow-md)',
      }}>
        {/* BRAND HEADER */}
        <div style={{ 
          marginBottom: '32px', 
          padding: '0 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-brand-gradient)',
            boxShadow: 'var(--shadow-glow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-brand-on-primary)'
          }}>
            <Zap size={16} strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
              {studioName}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Operating System
            </div>
          </div>
        </div>

        {/* NAVIGATION LINKS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 8px 8px' }}>
            Overview
          </div>
          <NavItem href="/" icon={<Compass size={18} />} label="Command Center" />
          <NavItem href="/requests" icon={<CheckSquare size={18} />} label="Inbox" />
          
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '24px 0 8px 8px' }}>
            Operations
          </div>
          <NavItem href="/instances" icon={<Layers size={18} />} label="Pipeline" />
          <NavItem href="/schedule" icon={<CalendarDays size={18} />} label="Schedule" />
          <NavItem href="/finance" icon={<DollarSign size={18} />} label="Ledger" />
          
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '24px 0 8px 8px' }}>
            Configuration
          </div>
          <NavItem href="/catalog" icon={<Box size={18} />} label="Service Catalog" />
          <NavItem href="/identity" icon={<Briefcase size={18} />} label="Identity" />
        </div>

        {/* USER PROFILE FOOTER */}
        <div style={{
          marginTop: 'auto',
          paddingTop: '16px',
          borderTop: '1px solid var(--color-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          {session && (
            <div style={{ 
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface-base)',
              border: '1px solid var(--color-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <div style={{ 
                width: '32px', 
                height: '32px', 
                borderRadius: '50%', 
                background: 'var(--color-text-tertiary)', 
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <User size={16} />
              </div>
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {session.email}
                </div>
                <form action={signOut} style={{ marginTop: '2px' }}>
                  <button type="submit" style={{
                    padding: 0,
                    fontSize: '0.7rem',
                    fontFamily: 'var(--font-family-sans)',
                    color: 'var(--color-text-secondary)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}>
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* MAIN CONTENT AREA */}
      <main style={backgroundStyle}>
        <SyncStateIndicator />
        <div style={{
          minHeight: '100%',
          width: '100%',
          position: 'relative'
        }}>
          {children}
        </div>
      </main>
    </div>
  );
}

function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link 
      href={href} 
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        color: 'var(--color-text-secondary)',
        textDecoration: 'none',
        fontSize: '0.9rem',
        fontWeight: 500,
        transition: 'all var(--transition-fast)',
      }}
      className="nav-item"
    >
      <div style={{ opacity: 0.8 }}>{icon}</div>
      {label}
    </Link>
  );
}
