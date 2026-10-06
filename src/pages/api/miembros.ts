import type { APIRoute } from 'astro';
import { createApiClient } from '../../lib/supabase-api';

export const GET: APIRoute = async (context) => {
  try {
    const supabase = createApiClient(
      context.request,
      context.cookies
    );

    // Verificar sesión
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: 'No autenticado.',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Verificar que el usuario pertenece al SRT
    const {
      data: currentMember,
      error: memberError,
    } = await supabase
      .from('members')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (memberError) {
      console.error(
        'Error verificando miembro:',
        memberError
      );

      return new Response(
        JSON.stringify({
          error: 'No se pudo verificar el miembro.',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (!currentMember) {
      return new Response(
        JSON.stringify({
          error: 'El usuario no pertenece al SRT.',
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Obtener todos los miembros
    const {
      data: members,
      error: membersError,
    } = await supabase
      .from('members')
      .select(`
        id,
        full_name,
        callsign,
        photo_url,
        rank_id,
        ranks (
          id,
          name,
          level,
          insignia_url
        )
      `)
      .order('full_name', {
        ascending: true,
      });

    if (membersError) {
      console.error(
        'Error obteniendo miembros:',
        membersError
      );

      return new Response(
        JSON.stringify({
          error: 'No se pudieron obtener los miembros.',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const normalizedMembers = [];

for (const member of members ?? []) {
  let photoUrl: string | null = null;

  if (member.photo_url) {
    if (/^https?:\/\//.test(member.photo_url)) {
      photoUrl = member.photo_url;
    } else {
      const { data: signedPhoto } =
        await supabase.storage
          .from('avatars')
          .createSignedUrl(
            member.photo_url,
            3600
          );

      photoUrl =
        signedPhoto?.signedUrl ?? null;
    }
  }

  normalizedMembers.push({
    id: member.id,
    full_name: member.full_name,
    callsign: member.callsign,
    photo_url: photoUrl,
    rank_id: member.rank_id,
    rank: Array.isArray(member.ranks)
      ? member.ranks[0] ?? null
      : member.ranks ?? null,
  });
}

    return new Response(
      JSON.stringify(normalizedMembers),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      'GET /api/miembros ERROR:',
      error
    );

    return new Response(
      JSON.stringify({
        error: 'Error interno del servidor.',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};