import type { APIContext } from 'astro';
import { createSupabaseServerClient } from './supabase-server';

export async function getCurrentMember(
  context: APIContext
) {
  const supabase = createSupabaseServerClient(context);

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

  const { data: member, error: memberError } =
    await supabase
      .from('members')
      .select(`
        id,
        email,
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

  const rank = member.ranks?.[0] ?? null;

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
          (permission) => permission.permission_key
        ) ?? [];
    }
  }

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