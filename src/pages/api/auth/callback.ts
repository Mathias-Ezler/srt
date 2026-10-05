import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get('code');

  if (!code) {
    return new Response(
      'Falta el código de autenticación.',
      { status: 400 }
    );
  }

  const supabase =
    createSupabaseServerClient(context);

  const { error } =
    await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error(
      'Error al iniciar sesión:',
      error
    );

    return new Response(
      `Error de autenticación: ${error.message}`,
      { status: 500 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect('/login');
  }

  const { data: member, error: memberError } =
    await supabase
      .from('members')
      .select('id, rank_id')
      .eq('id', user.id)
      .single();

  if (memberError || !member) {
    console.error(
      'No se encontró el miembro:',
      memberError
    );

    return context.redirect('/pending');
  }

  /*
   * El usuario está autenticado y tiene
   * un registro en members.
   *
   * No exigimos rank_id aquí porque el perfil
   * puede completarse antes de asignar un rango.
   */

  return context.redirect('/perfil');
};