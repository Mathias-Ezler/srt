import type { APIRoute } from 'astro';
import { createApiClient } from '../../../lib/supabase-api';

export const prerender = false;

const BUCKET = 'avatars';

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });

// GET /api/profile/photo?path=<ruta-en-el-bucket>
export const GET: APIRoute = async ({ request, cookies, url }) => {
  const supabase = createApiClient(request, cookies);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: 'Sesión no válida.' }, 401);
  }

  const path = url.searchParams.get('path') ?? '';

  if (!path || path.startsWith('/') || path.includes('..')) {
    return json({ error: 'Ruta inválida.' }, 400);
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  if (error || !data) {
    return json({ error: 'No se pudo generar la URL de la fotografía.' }, 404);
  }

  return json({ url: data.signedUrl }, 200, {
    'Cache-Control': 'private, max-age=1800',
  });
};