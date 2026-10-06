import type { APIRoute } from 'astro';
import { createApiClient } from '../../../lib/supabase-api';

export const POST: APIRoute = async (context) => {
  try {
    const supabase = createApiClient(
      context.request,
      context.cookies
    );

    // =====================================================
    // AUTENTICACIÓN
    // =====================================================

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
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

    // =====================================================
    // BODY
    // =====================================================

    let body: {
      deploymentId?: number;
    };

    try {
      body = await context.request.json();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'El cuerpo de la solicitud no es válido.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const deploymentId =
      Number(body.deploymentId);

    if (
      !Number.isInteger(deploymentId) ||
      deploymentId <= 0
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ID de despliegue inválido.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // =====================================================
    // PERMISOS
    // =====================================================

    const {
      data: member,
      error: memberError,
    } = await supabase
      .from('members')
      .select('id, rank_id')
      .eq('id', user.id)
      .maybeSingle();

    if (memberError) {
      console.error(
        'REVIEW MEMBER ERROR:',
        memberError
      );

      return new Response(
        JSON.stringify({
          success: false,
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

    if (!member) {
      return new Response(
        JSON.stringify({
          success: false,
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

    const {
      data: permission,
      error: permissionError,
    } = await supabase
      .from('rank_permissions')
      .select('permission_key')
      .eq('rank_id', member.rank_id)
      .eq('permission_key', 'admin.access')
      .maybeSingle();

    if (permissionError) {
      console.error(
        'REVIEW PERMISSION ERROR:',
        permissionError
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: 'No se pudieron verificar los permisos.',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (!permission) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No tienes permisos para revisar informes.',
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // =====================================================
    // REVISAR DESPLIEGUE
    // =====================================================

    const {
      data,
      error: reviewError,
    } = await supabase.rpc(
      'review_deployment',
      {
        p_deployment_id:
          deploymentId,
      }
    );

    if (reviewError) {
      console.error(
        'REVIEW DEPLOYMENT ERROR:',
        reviewError
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            reviewError.message ||
            'No se pudo revisar el informe.',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        deployment:
          Array.isArray(data)
            ? data[0] ?? null
            : data ?? null,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error(
      'POST /api/despliegues/revisar ERROR:',
      error
    );

    return new Response(
      JSON.stringify({
        success: false,
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