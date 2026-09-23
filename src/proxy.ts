import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * ROUTING, NOT AUTHORISATION - and the difference is worth a round trip.
 *
 * This runs in front of every request in the app. It used to call
 * supabase.auth.getUser(), which asks the auth service over the network
 * whether the token is good: 220 to 280 milliseconds on a healthy connection,
 * and twice today it took twenty-one seconds, in front of a page whose own
 * work took two. Every click in the app paid it.
 *
 * All this needs to decide is WHERE to send the request: to /login when there
 * is no session at all, to /create-studio when the session names no studio,
 * and otherwise onwards. getSession reads and decodes the session cookie
 * locally, with no network call, which answers both questions.
 *
 * WHY THAT IS SAFE. A decoded cookie is not proof - it is what the browser
 * claims - so nothing here is allowed to grant access. Every page and every
 * server action resolves the user again on the server with a VERIFIED
 * getUser() before it reads or writes anything (lib/supabase/authOrg, now once
 * per request), and every query is scoped to the organisation that verified
 * answer names. A forged cookie therefore gets past this redirect and then
 * fails at the only place that matters, with no data returned.
 *
 * What this file must never become is the thing that decides a request MAY
 * read a studio's rows. It decides which page to show. The page decides
 * whether the reader is who they say they are.
 */
export async function proxy(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (!request.nextUrl.pathname.startsWith('/login')) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'FATAL: Missing NEXT_PUBLIC_SUPABASE_URL in Vercel');
      return NextResponse.redirect(url);
    }
    // Allow the login page to render so the user can see the error, but don't init supabase!
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /*
   * Local: decodes the cookie and refreshes it when the access token has
   * expired. No call to the auth service, and therefore none of its latency.
   */
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/signup') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    request.nextUrl.pathname !== '/' && // let landing page be public
    !request.nextUrl.pathname.startsWith('/book') && // public booking pages
    !request.nextUrl.pathname.startsWith('/storefront') && // the studio's public catalogue
    !request.nextUrl.pathname.startsWith('/gallery') && // client delivery galleries
    !request.nextUrl.pathname.startsWith('/invoice') && // client invoices
    !request.nextUrl.pathname.startsWith('/receipt') // client receipts
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user) {
    const hasOrg = user.user_metadata?.organization_id;
    if (
      !hasOrg &&
      !request.nextUrl.pathname.startsWith('/create-studio') &&
      !request.nextUrl.pathname.startsWith('/auth')
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/create-studio';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
