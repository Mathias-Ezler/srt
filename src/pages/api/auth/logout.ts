import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

export const GET: APIRoute = async (context) => {
  const supabase = createSupabaseServerClient(context);

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Error cerrando sesión:', error);
    return context.redirect('/login?error=logout');
  }

  return context.redirect('/login');
};