import type { APIContext } from 'astro';
import { createSupabaseServerClient } from './supabase-server';

export async function getCurrentMember(
  context: APIContext
) {
  const supabase =
    createSupabaseServerClient(context);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error(
      'AUTH: Usuario no autenticado:',
      userError?.message ?? null
    );

    return {
      user: null,
      member: null,
      permissions: [],
    };
  }

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
      photo_url,
      rank_id,
      created_at,
      ranks (
        id,
        name,
        level,
        insignia_url
      )
    `)
    .eq('id', user.id)
    .single();

  if (memberError || !member) {
    console.error(
      'AUTH: Error obteniendo miembro:',
      memberError
    );

    return {
      user,
      member: null,
      permissions: [],
    };
  }

  /*
   * Supabase puede devolver la relación como
   * objeto o como array dependiendo de la relación.
   */
  const rank = Array.isArray(member.ranks)
    ? member.ranks[0] ?? null
    : member.ranks ?? null;

  let permissions: string[] = [];

  if (rank?.id) {
    const {
      data: rankPermissions,
      error: permissionsError,
    } = await supabase
      .from('rank_permissions')
      .select('permission_key')
      .eq('rank_id', rank.id);

    if (permissionsError) {
      console.error(
        'AUTH: Error obteniendo permisos:',
        permissionsError
      );
    } else {
      permissions =
        rankPermissions?.map(
          (permission) =>
            permission.permission_key
        ) ?? [];
    }
  }

  console.log('AUTH PERMISSIONS:', {
    user: user.id,
    rankId: rank?.id ?? null,
    rankName: rank?.name ?? null,
    permissions,
  });

  return {
    user,

    member: {
      ...member,
      rank,
    },

    permissions,
  };
}

export function hasPermission(
  permissions: string[],
  permission: string
) {
  return permissions.includes(permission);
}