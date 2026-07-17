import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation */}
      <nav className="q-glass-panel" style={{ position: 'sticky', top: 0, zIndex: 50, padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--q-color-ink-900)', letterSpacing: '-0.02em' }}>
          Weave
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <Link href="/login" className="q-btn q-btn-secondary">
            Log In
          </Link>
          <Link href="/signup" className="q-btn q-btn-primary">
            Start Your Studio
          </Link>
        </div>
      </nav>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* 1. Hero Section */}
        <section style={{ 
          padding: '160px 32px 120px', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          textAlign: 'center',
          background: 'linear-gradient(180deg, var(--q-color-paper-subtle) 0%, var(--q-color-paper-base) 100%)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Abstract background elements */}
          <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '50%', background: 'var(--q-jewel-indigo)', opacity: 0.05, filter: 'blur(100px)', borderRadius: '50%' }}></div>
          <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '40%', height: '50%', background: 'var(--q-jewel-emerald)', opacity: 0.05, filter: 'blur(100px)', borderRadius: '50%' }}></div>

          <h1 className="q-page-title" style={{ fontSize: '5rem', maxWidth: '1000px', lineHeight: 1.05, marginBottom: '24px', letterSpacing: '-0.03em' }}>
            The operating system for modern production studios.
          </h1>
          <p className="q-page-subtitle" style={{ fontSize: '1.5rem', maxWidth: '650px', marginBottom: '48px', lineHeight: 1.5 }}>
            Not just a CRM. Not just a website builder. A unified engine to turn your intent into value through coordinated people, resources, and workflows.
          </p>
          <div style={{ display: 'flex', gap: '16px' }}>
            <Link href="/signup" className="q-btn q-btn-primary" style={{ padding: '18px 40px', fontSize: '1.125rem' }}>
              Weave Your Studio
            </Link>
          </div>
        </section>

        {/* 2. Visual Interface Preview (Abstract but beautiful) */}
        <section style={{ padding: '0 32px 120px', display: 'flex', justifyContent: 'center' }}>
          <div className="q-card" style={{ 
            width: '100%', 
            maxWidth: '1200px', 
            height: '600px', 
            padding: 0, 
            display: 'flex', 
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: 'var(--q-shadow-glass)'
          }}>
            <div style={{ height: '60px', borderBottom: '1px solid var(--q-color-ink-100)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: '12px', background: 'var(--q-color-paper-subtle)' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--q-color-ink-300)' }}></div>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--q-color-ink-300)' }}></div>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--q-color-ink-300)' }}></div>
              <div style={{ marginLeft: 'auto', fontSize: '0.875rem', fontWeight: 500, color: 'var(--q-color-ink-500)' }}>Command Center</div>
            </div>
            <div style={{ flex: 1, display: 'flex', background: 'var(--q-color-paper-base)' }}>
              {/* Sidebar equivalent layout inside the mock */}
              <div style={{ width: '280px', borderRight: '1px solid var(--q-color-ink-100)', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ height: '24px', width: '60%', background: 'var(--q-color-ink-100)', borderRadius: '4px' }}></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ height: '16px', width: '80%', background: 'var(--q-color-ink-100)', borderRadius: '4px' }}></div>
                  <div style={{ height: '16px', width: '50%', background: 'var(--q-color-ink-100)', borderRadius: '4px' }}></div>
                  <div style={{ height: '16px', width: '90%', background: 'var(--q-color-ink-100)', borderRadius: '4px' }}></div>
                  <div style={{ height: '16px', width: '70%', background: 'var(--q-color-ink-100)', borderRadius: '4px' }}></div>
                </div>
              </div>
              {/* Main content area in mock */}
              <div style={{ flex: 1, padding: '48px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ height: '40px', width: '300px', background: 'var(--q-color-ink-100)', borderRadius: '8px' }}></div>
                    <div style={{ height: '20px', width: '200px', background: 'var(--q-color-ink-100)', borderRadius: '4px' }}></div>
                  </div>
                  <div style={{ height: '40px', width: '120px', background: 'var(--q-jewel-indigo)', borderRadius: '8px', opacity: 0.8 }}></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                  <div style={{ height: '160px', background: 'var(--q-color-paper-subtle)', borderRadius: '12px', border: '1px solid var(--q-color-ink-100)' }}></div>
                  <div style={{ height: '160px', background: 'var(--q-color-paper-subtle)', borderRadius: '12px', border: '1px solid var(--q-color-ink-100)' }}></div>
                  <div style={{ height: '160px', background: 'var(--q-color-paper-subtle)', borderRadius: '12px', border: '1px solid var(--q-color-ink-100)' }}></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. The Two Pillars */}
        <section style={{ padding: '120px 32px', background: 'var(--q-color-paper-subtle)', borderTop: '1px solid var(--q-color-ink-100)', borderBottom: '1px solid var(--q-color-ink-100)' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '80px' }}>
            <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
              <h2 className="q-page-title" style={{ fontSize: '3rem', marginBottom: '24px' }}>Built on two immutable pillars.</h2>
              <p className="q-page-subtitle" style={{ fontSize: '1.25rem' }}>Weave separates what is universal from what is configurable, giving you a shared language with ultimate flexibility.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
              <div className="q-card q-card-interactive" style={{ padding: '48px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--q-jewel-indigo)', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '24px' }}>1</div>
                <h3 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '16px', color: 'var(--q-color-ink-900)' }}>Data Singularity</h3>
                <p style={{ fontSize: '1.125rem', color: 'var(--q-color-ink-500)', lineHeight: 1.6 }}>
                  Data is entered once. It flows everywhere it is needed. Weave acts as a single source of truth for your entire business. If the price of a service changes, it updates the public booking page, the internal dashboard, and future invoices instantly.
                </p>
              </div>

              <div className="q-card q-card-interactive" style={{ padding: '48px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--q-jewel-emerald)', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '24px' }}>2</div>
                <h3 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '16px', color: 'var(--q-color-ink-900)' }}>The Ubiquitous Visual Engine</h3>
                <p style={{ fontSize: '1.125rem', color: 'var(--q-color-ink-500)', lineHeight: 1.6 }}>
                  A heavy, Framer-grade visual design canvas summoned anywhere in the system. Drag components onto a canvas to visually design storefronts, galleries, proposals, and invoices—all bound directly to your singular data.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Feature Highlights */}
        <section style={{ padding: '120px 32px' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <h2 className="q-page-title" style={{ fontSize: '3rem', marginBottom: '80px', textAlign: 'center' }}>One unified workflow.</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--q-color-ink-900)' }}>Orchestration</h4>
                <p style={{ color: 'var(--q-color-ink-500)', lineHeight: 1.6 }}>Convert intents into agreements with versioned terms and automatic deposit invoices. The system instantly spawns workflows and reserves resources.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--q-color-ink-900)' }}>Production</h4>
                <p style={{ color: 'var(--q-color-ink-500)', lineHeight: 1.6 }}>Check out gear, execute tasks, and upload assets. Data unblocks the next stage automatically—no manual passing the baton.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--q-color-ink-900)' }}>Delivery</h4>
                <p style={{ color: 'var(--q-color-ink-500)', lineHeight: 1.6 }}>Design beautiful, branded galleries for client approval. Generate outstanding invoices and handle print store commerce seamlessly.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. CTA Section */}
        <section style={{ padding: '120px 32px', background: 'var(--q-color-ink-900)', color: 'white', textAlign: 'center' }}>
          <h2 style={{ fontSize: '3.5rem', fontWeight: 600, marginBottom: '24px', letterSpacing: '-0.03em' }}>Ready to weave it all together?</h2>
          <p style={{ fontSize: '1.25rem', color: 'var(--q-color-ink-300)', maxWidth: '600px', margin: '0 auto 48px' }}>
            Join the most ambitious studios in the world running on the ultimate production operating system.
          </p>
          <Link href="/signup" className="q-btn" style={{ background: 'white', color: 'var(--q-color-ink-900)', padding: '18px 40px', fontSize: '1.125rem' }}>
            Start Your Studio
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ padding: '64px 32px', background: 'var(--q-color-paper-subtle)', textAlign: 'center', color: 'var(--q-color-ink-500)' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--q-color-ink-900)', marginBottom: '16px' }}>
          Weave
        </div>
        <p>&copy; {new Date().getFullYear()} Creative Renaissance. All rights reserved.</p>
      </footer>
    </div>
  );
}
