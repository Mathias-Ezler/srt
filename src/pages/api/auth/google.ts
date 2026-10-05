import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

export const GET: APIRoute = async (context) => {
  const supabase = createSupabaseServerClient(context);

  const { data, error } =
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:
          `${context.url.origin}/api/auth/callback`,
      },
    });

  if (error || !data.url) {
    console.error('Error iniciando Google OAuth:', error);

    return new Response(
      'No se pudo iniciar la autenticación con Google.',
      { status: 500 }
    );
  }

  return context.redirect(data.url);
};