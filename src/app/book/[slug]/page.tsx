import { notFound } from 'next/navigation';
import { listPackagesPublicWithDimensions, shopWindowsOf, inWindow } from '@/modules/packages/interface';
import { getStudioBySlug } from '@/kernel/organizations';
import { Catalogue } from './Catalogue';

type Search = Promise<{ in?: string | string[] }>;

/** The window a link asked for — only when it is one this studio actually has. */
async function windowAskedFor(orgId: string, searchParams: Search | undefined) {
  const sp = (await searchParams) || {};
  const id = Array.isArray(sp.in) ? sp.in[0] : sp.in;
  if (!id) return { packages: await listPackagesPublicWithDimensions(orgId), only: null };
  const packages = await listPackagesPublicWithDimensions(orgId);
  const w = shopWindowsOf(packages).find((x) => x.id === id) || null;
  // A window that no longer has anything in it falls back to the whole
  // catalogue rather than an empty page: the link is old, not wrong.
  return { packages: w ? inWindow(packages, w.id) : packages, only: w ? { id: w.id, name: w.name } : null };
}

export const dynamic = 'force-dynamic';

/**
 * The studio's own name and picture, when this link is pasted somewhere.
 *
 * This is the link a studio copies from its packages screen and hands out, so
 * it is the one most often shared — and it previewed as "Weave — The operating
 * system for studios", the name of the software rather than the name of the
 * business. A studio sending a client to its own shop window should not be
 * advertising its supplier.
 */
export async function generateMetadata(props: { params: Promise<{ slug: string }>; searchParams?: Search }) {
  const params = await props.params;
  const org = await getStudioBySlug(params.slug);
  if (!org) return { title: 'Not found' };

  const meta = (org.metadata || {}) as Record<string, any>;
  const image = meta.cover_url || meta.logo_url || null;
  // A window's link previews as that window — "Glamour — Printing" — so a
  // client sent to the print shop sees the print shop.
  const { only } = await windowAskedFor(org.id, props.searchParams);
  const title = only ? `${org.name} — ${only.name}` : org.name;
  const description = only
    ? `${only.name} packages available to book with ${org.name}.`
    : `Packages available to book with ${org.name}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: org.name,
      type: 'website' as const,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: (image ? 'summary_large_image' : 'summary') as 'summary_large_image' | 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/**
 * THE PAGE A STUDIO HANDS OUT.
 *
 * This is the link the packages screen tells an operator to copy, so it is the
 * first thing every prospective client sees. It was also the least finished
 * public surface in the app, in ways that all cost the studio money:
 *
 * 1. IT SHOWED NO PRICES. It read `pkg.pricing?.base_price`, and `pricing` is
 *    an empty legacy column on every row — the figure is in `price`. So every
 *    package in every studio read "Custom quote" to a client while the studio
 *    had priced it. Glamour's three are ₦200,000, ₦20,000 and ₦10,000.
 * 2. IT SHOWED NO COVERS. The picture a studio chose for a package appeared in
 *    the picker inside the booking form and nowhere on the page that sells it.
 * 3. IT DUMPED THE FULL DESCRIPTION into every card, so three packages were
 *    three paragraphs and the page had no shape.
 * 4. IT COULD NOT BE NARROWED. /storefront/[slug] could, and no client was
 *    ever sent there.
 *
 * The cards are the same poster cards the booking form's picker draws, from
 * the same loader, so there is one idea of what a package looks like to a
 * client rather than two that drift.
 */
export default async function StudioCataloguePage(props: { params: Promise<{ slug: string }>; searchParams?: Search }) {
  const params = await props.params;

  const org = await getStudioBySlug(params.slug);
  if (!org) notFound();

  const { packages, only } = await windowAskedFor(org.id, props.searchParams);
  const meta = org.metadata;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--q-color-paper-subtle)' }}>
      {meta.cover_url && (
        <div style={{ width: '100%', height: '240px', backgroundImage: `url(${meta.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      )}

      <header style={{ padding: meta.cover_url ? '32px 24px 48px' : 'clamp(48px, 8vw, 80px) 24px 32px', textAlign: 'center', maxWidth: '800px', margin: '0 auto', position: 'relative' }}>
        {meta.logo_url && (
          <div style={{ width: '96px', height: '96px', borderRadius: '50%', backgroundColor: 'var(--q-color-paper)', border: '4px solid var(--q-color-paper-subtle)', backgroundImage: `url(${meta.logo_url})`, backgroundSize: 'cover', backgroundPosition: 'center', margin: meta.cover_url ? '-80px auto 24px' : '0 auto 24px', boxShadow: 'var(--q-shadow-md)' }} />
        )}
        <h1 className="q-page-title">{org.name}</h1>
        {/* Was "Explore our offerings and book a session. We'll review your
            request and get back to you to confirm the details." — a sentence
            in the studio's first person that this software has no standing to
            write for them. This states what the page is. */}
        <p className="q-page-subtitle" style={{ margin: '12px auto 0', maxWidth: '480px' }}>
          {only ? `${only.name} packages available to book.` : 'Packages available to book.'}
        </p>
      </header>

      <main style={{ maxWidth: '1040px', margin: '0 auto', padding: '0 24px 80px' }}>
        {packages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--q-color-ink-400)', backgroundColor: 'var(--q-color-paper)', borderRadius: '16px', border: '1px solid var(--q-color-ink-100)' }}>
            No packages are currently available to book.
          </div>
        ) : (
          <Catalogue
            packages={packages as any}
            slug={params.slug}
            currencyCode={org.currency}
            only={only}
          />
        )}
      </main>
    </div>
  );
}
