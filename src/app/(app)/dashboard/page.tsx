import { redirect } from 'next/navigation';

/**
 * The old address of the home screen.
 *
 * This page moved to `/home` because it was never a dashboard — it is a grid of
 * applications, and calling it a dashboard promised a screen of figures that
 * does not exist here. `/overview` is the screen that reads like one.
 *
 * The stub stays because the app is not the only thing that holds the old URL:
 * Supabase's own redirect allowlist, anything already bookmarked, and any link
 * sent before today all still point here. A permanent redirect costs one file
 * and saves every one of them from a 404.
 */
export const dynamic = 'force-dynamic';

export default async function MovedToHome() {
  redirect('/home');
}
