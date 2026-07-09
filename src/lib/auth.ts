import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/lib/database.types'

/**
 * Returns the authenticated user's org_id from their JWT claims.
 * This is the single authoritative source for org tenancy in server actions.
 *
 * Returns null if the user is not authenticated or has no org membership.
 * Server actions must guard against null and return a structured error.
 */
export async function getOrgId(): Promise<string | null> {
  const cookieStore = await cookies()

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* server component context */ }
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  // The custom_access_token_hook injects org_id into the JWT claims
  const orgId = (session.user.user_metadata?.org_id as string | undefined)
    ?? (session.access_token
      ? (JSON.parse(atob(session.access_token.split('.')[1])) as Record<string, string>)?.org_id
      : null)

  return orgId ?? null
}

/**
 * Returns the full session or null.
 * Use this when you need both the user and the org claim.
 */
export async function getSession() {
  const cookieStore = await cookies()

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* server component context */ }
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const claims = session.access_token 
    ? (JSON.parse(atob(session.access_token.split('.')[1])) as Record<string, any>)
    : {}

  const orgId = (session.user.user_metadata?.org_id as string | undefined)
    ?? claims.org_id 
    ?? null

  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    orgId,
    role: claims.user_role ?? 'staff',
  }
}
