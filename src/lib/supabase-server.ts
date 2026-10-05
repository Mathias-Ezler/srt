import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { APIContext } from 'astro';

export function createSupabaseServerClient(context: APIContext) {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Faltan las variables PUBLIC_SUPABASE_URL o PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(
            context.request.headers.get('cookie') ?? ''
          );
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            context.cookies.set(name, value, options);
          });
        },
      },
    }
  );
}