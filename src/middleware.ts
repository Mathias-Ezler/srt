import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from './lib/supabase-server';

export const onRequest = defineMiddleware(
  async (context, next) => {
    const pathname = context.url.pathname;

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

    const supabase =
      createSupabaseServerClient(context);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    console.log('MIDDLEWARE AUTH:', {
      user: user?.id ?? null,
      error: userError?.message ?? null,
      pathname,
    });

    if (userError || !user) {
      console.log(
        'MIDDLEWARE: Usuario no autenticado → /login'
      );

      return context.redirect('/login');
    }

    const { data: member, error: memberError } =
      await supabase
        .from('members')
        .select('id, rank_id')
        .eq('id', user.id)
        .single();

    console.log('MIDDLEWARE MEMBER:', {
      member,
      error: memberError?.message ?? null,
    });

    if (memberError || !member) {
      console.log(
        'MIDDLEWARE: Miembro no encontrado → /pending'
      );

      return context.redirect('/pending');
    }

    return next();
  }
);