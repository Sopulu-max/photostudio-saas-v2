import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { studioAtSlug } from '@/weave/jobs/requests';
import { BookingForm } from './BookingForm';

export const dynamic = 'force-dynamic';

/**
 * A studio's own address, where somebody who has never met them can ask.
 *
 * The studio's name is the title of the page and Weave is nowhere on it. This
 * is the first page a stranger sees of a studio, and it should read as that
 * studio's, not as a platform's booking widget with a logo on top.
 *
 * `/s/<slug>` today, a subdomain later; the slug is the same identifier either
 * way, so the address can move without anything here changing.
 */
export async function generateMetadata({ params }: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const studio = await studioAtSlug(slug);
  return {
    title: studio ? studio.name : 'Not found',
    description: studio ? `Ask ${studio.name} about a booking.` : undefined,
  };
}

export default async function StudioFrontPage({ params }: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const studio = await studioAtSlug(slug);
  if (!studio) notFound();

  return (
    <main className="q-auth">
      <div className="q-auth-card">
        <span className="q-auth-mark">{studio.name}</span>
        <h1 className="q-auth-title">Ask about a date</h1>
        <p className="q-auth-says">
          Tell them what you are after and they will come back to you.
        </p>
        <BookingForm slug={studio.slug} studioName={studio.name} />
      </div>
    </main>
  );
}
