import { permanentRedirect } from 'next/navigation';

/**
 * THERE IS ONE PUBLIC CATALOGUE, AND IT IS /book/[slug].
 *
 * This route was the second one. It could be narrowed by the studio's
 * vocabulary, which /book/[slug] could not — but it showed no covers, read no
 * prices at all (every package said "Custom quote", hardcoded), and no client
 * was ever sent here: the link the packages screen tells an operator to copy
 * is /book/[slug]. So a studio had two shop windows, each missing half of what
 * a client needs, and only ever handed out one of them.
 *
 * The filtering moved to /book/[slug]. This stays as a redirect rather than a
 * 404 because a URL may already be in somebody's address bar, an old message,
 * or the contract-signing hand-off — none of which this app can reach back and
 * edit. The redirect is permanent, which is what it is.
 */
export default async function RetiredStorefrontPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  permanentRedirect(`/book/${slug}`);
}
