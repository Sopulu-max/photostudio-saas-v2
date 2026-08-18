import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Reveal } from '@/components/marketing/Reveal';

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/home');

  return (
    <div>
      {/* Nav */}
      <nav className="q-lp-nav q-glass-panel">
        <div className="q-lp-brand"><span className="q-lp-mark" aria-hidden="true" /> Weave</div>
        <div className="q-lp-nav-actions">
          <Link href="/login" className="q-btn q-btn-secondary">Log in</Link>
          <Link href="/signup" className="q-btn q-btn-primary">Start your studio</Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="q-lp-hero">
        <div className="q-lp-aurora" aria-hidden="true"><i /><i /><i /></div>
        <div className="q-lp-wrap q-lp-hero-inner">
          <Reveal><span className="q-lp-eyebrow">The studio platform</span></Reveal>
          <Reveal delay={60}><h1 className="q-lp-h1">Run your whole studio — and build it your way.</h1></Reveal>
          <Reveal delay={120}>
            <p className="q-lp-lead">
              Clients, bookings, jobs, money, your website and galleries — all in one place,
              on one shared source of truth. Not a stack of fixed screens: a system you shape
              to fit exactly how your studio works.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="q-lp-cta-row">
              <Link href="/signup" className="q-btn q-btn-primary" style={{ padding: '13px 26px', fontSize: '1rem' }}>Start your studio</Link>
              <Link href="#how" className="q-btn q-btn-outline" style={{ padding: '13px 26px', fontSize: '1rem' }}>See how it works</Link>
            </div>
          </Reveal>
        </div>
      </header>

      {/* One place */}
      <section id="how" className="q-lp-section q-lp-section-alt">
        <div className="q-lp-wrap">
          <Reveal><div className="q-lp-kicker">One place</div></Reveal>
          <Reveal delay={60}><h2 className="q-lp-h2">Everything your studio does, connected.</h2></Reveal>
          <Reveal delay={120}>
            <p className="q-lp-h2-lead">
              An enquiry becomes a booking becomes a job becomes an invoice — automatically, on
              one shared source of truth. Change a price once, and it updates your booking page,
              your dashboard, and every future invoice. Nothing entered twice; nothing out of sync.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Capability, not features */}
      <section className="q-lp-section">
        <div className="q-lp-wrap">
          <Reveal><div className="q-lp-kicker">Build it your way</div></Reveal>
          <Reveal delay={60}><h2 className="q-lp-h2">Most software hands you fixed screens. Weave hands you the tools.</h2></Reveal>
          <Reveal delay={120}>
            <p className="q-lp-h2-lead">
              Design your own service pages like you'd design a website — your photos, your words,
              your price — and share a link clients can book from. Build your whole site from data
              you already have. It's a workshop, not furniture.
            </p>
          </Reveal>

          <div className="q-lp-grid">
            <Reveal delay={80}>
              <div className="q-lp-feature">
                <div className="q-lp-dot" style={{ background: 'var(--q-jewel-indigo)' }} />
                <h3>Design your services</h3>
                <p>Drop in images, text, and a price; publish a premium, bookable page — like a website builder, wired to your real data.</p>
              </div>
            </Reveal>
            <Reveal delay={140}>
              <div className="q-lp-feature">
                <div className="q-lp-dot" style={{ background: 'var(--q-jewel-emerald)' }} />
                <h3>Build your site</h3>
                <p>Your gallery, your offerings, your team page — drawn from the data you already keep, arranged exactly the way you want.</p>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className="q-lp-feature">
                <div className="q-lp-dot" style={{ background: 'var(--q-jewel-amber)' }} />
                <h3>Run the business</h3>
                <p>Clients, staff, bookings, and finances — all in one place, always in sync, so the work runs itself between the shoots.</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="q-lp-wrap">
        <Reveal>
          <div className="q-lp-cta">
            <h2>Your studio, finally in one place.</h2>
            <p>Up and running in minutes. Yours to shape forever.</p>
            <Link href="/signup" className="q-btn q-btn-invert" style={{ padding: '14px 30px', fontSize: '1.05rem' }}>Start your studio</Link>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="q-lp-wrap">
        <div className="q-lp-footer">
          <div className="q-lp-brand" style={{ fontSize: '1rem' }}><span className="q-lp-mark" aria-hidden="true" /> Weave</div>
          <span>&copy; {new Date().getFullYear()} Weave. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
