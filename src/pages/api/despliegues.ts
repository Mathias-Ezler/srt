import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase-server';

type OperatorInput = {
  memberId: string;
};

type SuspectInput = {
  identification?: string;
  confiscatedItems?: string;
};

type SimpleInput = {
  description?: string;
};

type RecordingInput = {
  url?: string;
};

export const POST: APIRoute = async (context) => {
  try {
    /*
     * ============================================================
     * AUTENTICACIÓN
     * ============================================================
     */

    const supabase =
      createSupabaseServerClient(context);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Usuario no autenticado.',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    /*
     * ============================================================
     * BODY
     * ============================================================
     */

    let body: any;

    try {
      body = await context.request.json();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'El cuerpo de la solicitud no es válido.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    /*
     * ============================================================
     * DATOS PRINCIPALES
     * ============================================================
     */

    const title =
      typeof body.title === 'string'
        ? body.title.trim()
        : '';

    const type =
      typeof body.type === 'string'
        ? body.type.trim()
        : '';

    const location =
      typeof body.location === 'string'
        ? body.location.trim()
        : '';

    const description =
      typeof body.description === 'string'
        ? body.description.trim()
        : '';

    /*
     * ============================================================
     * VALIDACIONES
     * ============================================================
     */

    if (!title) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'El título del despliegue es obligatorio.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (!type) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'El tipo de despliegue es obligatorio.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (!location) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'La ubicación es obligatoria.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    /*
     * ============================================================
     * ARRAYS
     * ============================================================
     */

    const operators: OperatorInput[] =
      Array.isArray(body.operators)
        ? body.operators
        : [];

    const suspects: SuspectInput[] =
      Array.isArray(body.suspects)
        ? body.suspects
        : [];

    const vehicles: SimpleInput[] =
      Array.isArray(body.vehicles)
        ? body.vehicles
        : [];

    const equipment: SimpleInput[] =
      Array.isArray(body.equipment)
        ? body.equipment
        : [];

    const recordings: RecordingInput[] =
      Array.isArray(body.recordings)
        ? body.recordings
        : [];

    /*
     * ============================================================
     * CREAR DESPLIEGUE
     *
     * Se utiliza la función SECURITY DEFINER de Supabase
     * porque la creación directa está protegida por RLS.
     * ============================================================
     */

    const {
      data: deployment,
      error: deploymentError,
    } = await supabase.rpc(
      'create_deployment',
      {
        p_title: title,
        p_type: type,
        p_location: location,
        p_description:
          description || null,
      }
    );

    if (deploymentError) {
      console.error(
        'DEPLOYMENT ERROR:',
        deploymentError
      );

      return new Response(
        JSON.stringify({
          success: false,
          message:
            deploymentError.message ||
            'No se pudo crear el despliegue.',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (
      !deployment ||
      !Array.isArray(deployment) ||
      !deployment[0]
    ) {
      console.error(
        'DEPLOYMENT ERROR: La función no devolvió un despliegue.',
        deployment
      );

      return new Response(
        JSON.stringify({
          success: false,
          message:
            'El despliegue fue creado, pero no se recibió su información.',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const deploymentId =
      deployment[0].id;

    const deploymentCode =
      deployment[0].code;

    /*
     * ============================================================
     * OPERADORES
     *
     * El Alpha ya se agrega automáticamente mediante trigger.
     * Por eso aquí solamente agregamos los operadores seleccionados.
     * ============================================================
     */

    const operatorRows = operators
      .filter(
        (operator) =>
          typeof operator?.memberId === 'string' &&
          operator.memberId.trim() !== '' &&
          operator.memberId !== user.id
      )
      .map((operator) => ({
        deployment_id: deploymentId,
        member_id: operator.memberId,
        role: 'operator',
      }));

    if (operatorRows.length > 0) {
      const {
        error: operatorsError,
      } = await supabase
        .from('deployment_members')
        .insert(operatorRows);

      if (operatorsError) {
        console.error(
          'OPERATORS ERROR:',
          operatorsError
        );

        return new Response(
          JSON.stringify({
            success: false,
            message:
              'El despliegue fue creado, pero no se pudieron guardar los operadores.',
            error: operatorsError.message,
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
    }

    /*
     * ============================================================
     * SOSPECHOSOS
     *
     * IMPORTANTE:
     *
     * La tabla deployment_suspects todavía tiene:
     *
     * name TEXT NOT NULL
     *
     * Por eso guardamos la identificación también en "name".
     * ============================================================
     */

    const suspectRows = suspects
      .filter((suspect) => {
        return (
          typeof suspect?.identification === 'string' &&
          suspect.identification.trim() !== ''
        ) ||
        (
          typeof suspect?.confiscatedItems === 'string' &&
          suspect.confiscatedItems.trim() !== ''
        );
      })
      .map((suspect) => {
        const identification =
          typeof suspect.identification === 'string' &&
          suspect.identification.trim() !== ''
            ? suspect.identification.trim()
            : null;

        const confiscatedItems =
          typeof suspect.confiscatedItems === 'string' &&
          suspect.confiscatedItems.trim() !== ''
            ? suspect.confiscatedItems.trim()
            : null;

        return {
          deployment_id: deploymentId,

          /*
           * Columna antigua obligatoria.
           * Utilizamos la identificación como nombre.
           */
          name:
            identification ||
            'Sin identificación',

          /*
           * Columnas nuevas.
           */
          identification,
          confiscated_items:
            confiscatedItems,
        };
      });

    if (suspectRows.length > 0) {
      const {
        error: suspectsError,
      } = await supabase
        .from('deployment_suspects')
        .insert(suspectRows);

      if (suspectsError) {
        console.error(
          'SUSPECTS ERROR:',
          suspectsError
        );

        return new Response(
          JSON.stringify({
            success: false,
            message:
              'El despliegue fue creado, pero no se pudieron guardar los sospechosos.',
            error: suspectsError.message,
            code: suspectsError.code,
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
    }

    /*
     * ============================================================
     * VEHÍCULOS
     * ============================================================
     */

    const vehicleRows = vehicles
      .filter(
        (vehicle) =>
          typeof vehicle?.description === 'string' &&
          vehicle.description.trim() !== ''
      )
      .map((vehicle) => ({
        deployment_id: deploymentId,
        description:
          vehicle.description!.trim(),
      }));

    if (vehicleRows.length > 0) {
      const {
        error: vehiclesError,
      } = await supabase
        .from('deployment_vehicles')
        .insert(vehicleRows);

      if (vehiclesError) {
        console.error(
          'VEHICLES ERROR:',
          vehiclesError
        );

        return new Response(
          JSON.stringify({
            success: false,
            message:
              'El despliegue fue creado, pero no se pudieron guardar los vehículos.',
            error: vehiclesError.message,
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
    }

    /*
     * ============================================================
     * MATERIAL / EQUIPAMIENTO
     * ============================================================
     */

    const equipmentRows = equipment
      .filter(
        (item) =>
          typeof item?.description === 'string' &&
          item.description.trim() !== ''
      )
      .map((item) => ({
        deployment_id: deploymentId,
        description:
          item.description!.trim(),
      }));

    if (equipmentRows.length > 0) {
      const {
        error: equipmentError,
      } = await supabase
        .from('deployment_equipment')
        .insert(equipmentRows);

      if (equipmentError) {
        console.error(
          'EQUIPMENT ERROR:',
          equipmentError
        );

        return new Response(
          JSON.stringify({
            success: false,
            message:
              'El despliegue fue creado, pero no se pudo guardar el material utilizado.',
            error: equipmentError.message,
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
    }

    /*
     * ============================================================
     * GRABACIONES
     * ============================================================
     */

    const recordingRows = recordings
      .filter(
        (recording) =>
          typeof recording?.url === 'string' &&
          recording.url.trim() !== ''
      )
      .map((recording) => ({
        deployment_id: deploymentId,
        url: recording.url!.trim(),
      }));

    if (recordingRows.length > 0) {
      const {
        error: recordingsError,
      } = await supabase
        .from('deployment_recordings')
        .insert(recordingRows);

      if (recordingsError) {
        console.error(
          'RECORDINGS ERROR:',
          recordingsError
        );

        return new Response(
          JSON.stringify({
            success: false,
            message:
              'El despliegue fue creado, pero no se pudieron guardar las grabaciones.',
            error: recordingsError.message,
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
    }

    /*
     * ============================================================
     * RESPUESTA FINAL
     * ============================================================
     */

    return new Response(
      JSON.stringify({
        success: true,
        id: deploymentId,
        code: deploymentCode,
        message:
          'Despliegue creado correctamente.',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    /*
     * ============================================================
     * ERROR GENERAL
     * ============================================================
     */

    console.error(
      'API DESPLIEGUES ERROR:',
      error
    );

    return new Response(
      JSON.stringify({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Error interno del servidor.',
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