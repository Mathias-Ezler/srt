import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from './lib/supabase-server';

export const onRequest = defineMiddleware(
  async (context, next) => {
    const pathname = context.url.pathname;

    /*
     * ======================================================
     * ARCHIVOS ESTÁTICOS
     * ======================================================
     *
     * Las imágenes, fuentes, CSS, JS, videos, etc.
     * no necesitan pasar por autenticación.
     */

    const staticFilePattern =
      /\.(?:png|jpg|jpeg|webp|gif|svg|ico|css|js|map|woff|woff2|ttf|otf|mp4|webm|mp3|wav)$/i;

    if (staticFilePattern.test(pathname)) {
      return next();
    }

    /*
     * ======================================================
     * RUTAS PÚBLICAS
     * ======================================================
     */

    const publicRoutes = [
      '/',
      '/login',
      '/pending',
      '/suspended',
    ];

    const isPublicRoute =
      publicRoutes.includes(pathname) ||
      pathname.startsWith('/api/auth');

    if (isPublicRoute) {
      return next();
    }

    /*
     * ======================================================
     * AUTENTICACIÓN
     * ======================================================
     */

    const supabase =
      createSupabaseServerClient(context);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    console.log(
      '========== MIDDLEWARE AUTH =========='
    );

    console.log(
      'PATH:',
      pathname
    );

    console.log(
      'USER ID:',
      user?.id ?? null
    );

    console.log(
      'USER EMAIL:',
      user?.email ?? null
    );

    console.log(
      'AUTH ERROR:',
      userError?.message ?? null
    );

    if (userError || !user) {
      console.log(
        'MIDDLEWARE: Usuario no autenticado → /login'
      );

      return context.redirect('/login');
    }

    /*
     * ======================================================
     * MIEMBRO SRT
     * ======================================================
     */

    const {
      data: member,
      error: memberError,
    } = await supabase
      .from('members')
      .select(`
        id,
        email,
        full_name,
        callsign,
        rank_id
      `)
      .eq('id', user.id)
      .single();

    console.log(
      '========== MIDDLEWARE MEMBER =========='
    );

    console.log(
      'MEMBER:',
      member
    );

    console.log(
      'MEMBER ERROR:',
      memberError?.message ?? null
    );

    console.log(
      'MEMBER ERROR CODE:',
      memberError?.code ?? null
    );

    console.log(
      'MEMBER ERROR DETAILS:',
      memberError?.details ?? null
    );

    console.log(
      'MEMBER ERROR HINT:',
      memberError?.hint ?? null
    );

    if (memberError || !member) {
      console.log(
        'MIDDLEWARE: Miembro no encontrado → /pending'
      );

      return context.redirect('/pending');
    }

    console.log(
      '========================================'
    );

    console.log(
      'MIDDLEWARE: Miembro encontrado → acceso permitido'
    );

    return next();
  }
);