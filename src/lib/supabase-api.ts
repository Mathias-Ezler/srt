import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

/**
 * Cliente de Supabase para endpoints /api/*.
 * Lee la sesión de las cookies de la petición (la misma que deja el login).
 */
export function createApiClient(request: Request, cookies: AstroCookies) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get('Cookie') ?? '').map(
            (c) => ({ name: c.name, value: c.value ?? '' })
          );
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookies.set(name, value, options)
          );
        },
      },
    }
  );
}