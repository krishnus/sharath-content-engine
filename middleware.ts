import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieItem = { name: string; value: string; options?: Record<string, unknown> }

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: CookieItem[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(
              name, value,
              options as Parameters<typeof supabaseResponse.cookies.set>[2]
            )
          )
        },
      },
    }
  )

  // Fast check — does any Supabase auth cookie exist at all?
  // This prevents a redirect loop when getUser() is slow or returns null
  // during token refresh after a magic link redirect.
  const allCookies  = request.cookies.getAll()
  const hasAuthCookie = allCookies.some(c =>
    c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
  )

  const pathname = request.nextUrl.pathname
  const isDashboard = pathname.startsWith('/dashboard')
  const isLogin     = pathname === '/auth/login'

  // Only run the full getUser() check if there's a reason to
  if (isDashboard || isLogin) {
    const { data: { user } } = await supabase.auth.getUser()

    // No user + no auth cookie → definitely not logged in → redirect to login
    if (!user && !hasAuthCookie && isDashboard) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }

    // User confirmed logged in at login page → redirect to dashboard
    // Only redirect if getUser() confirms — avoids loop during token refresh
    if (user && isLogin) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/auth/login',
  ],
}

