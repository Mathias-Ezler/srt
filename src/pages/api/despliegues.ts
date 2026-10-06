import type { APIRoute } from 'astro';
import { createApiClient } from '../../lib/supabase-api';

type OperatorInput = {
  memberId?: unknown;
};

type SuspectInput = {
  identification?: unknown;
  confiscatedItems?: unknown;
};

type DescriptionInput = {
  description?: unknown;
};

type RecordingInput = {
  url?: unknown;
};

type DeploymentBody = {
  title?: unknown;
  type?: unknown;
  location?: unknown;
  riskLevel?: unknown;
  description?: unknown;
  operators?: unknown;
  suspects?: unknown;
  vehicles?: unknown;
  equipment?: unknown;
  recordings?: unknown;
};

const VALID_RISK_LEVELS = [
  'Crítico',
  'Alto',
  'Medio',
  'Bajo',
] as const;

function isValidRiskLevel(
  value: unknown
): value is (typeof VALID_RISK_LEVELS)[number] {
  return (
    typeof value === 'string' &&
    VALID_RISK_LEVELS.includes(
      value as (typeof VALID_RISK_LEVELS)[number]
    )
  );
}

function cleanString(
  value: unknown
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.trim();

  return cleaned || null;
}

export const POST: APIRoute = async (context) => {
  try {
    const supabase = createApiClient(
      context.request,
      context.cookies
    );

    // =========================================================
    // AUTENTICACIÓN
    // =========================================================

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No estás autenticado.',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // =========================================================
    // BODY
    // =========================================================

    let body: DeploymentBody;

    try {
      body =
        (await context.request.json()) as DeploymentBody;
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

    // =========================================================
    // DATOS PRINCIPALES
    // =========================================================

    const title = cleanString(body.title);
    const type = cleanString(body.type);
    const location = cleanString(body.location);
    const riskLevel = cleanString(body.riskLevel);
    const description = cleanString(body.description);

    if (!title) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'El título es obligatorio.',
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
          error: 'El tipo de despliegue es obligatorio.',
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
          error: 'La ubicación es obligatoria.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (!isValidRiskLevel(riskLevel)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Seleccioná un nivel de riesgo válido.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // =========================================================
    // ARRAYS
    // =========================================================

    const operators: OperatorInput[] =
      Array.isArray(body.operators)
        ? (body.operators as OperatorInput[])
        : [];

    const suspects: SuspectInput[] =
      Array.isArray(body.suspects)
        ? (body.suspects as SuspectInput[])
        : [];

    const vehicles: DescriptionInput[] =
      Array.isArray(body.vehicles)
        ? (body.vehicles as DescriptionInput[])
        : [];

    const equipment: DescriptionInput[] =
      Array.isArray(body.equipment)
        ? (body.equipment as DescriptionInput[])
        : [];

    const recordings: RecordingInput[] =
      Array.isArray(body.recordings)
        ? (body.recordings as RecordingInput[])
        : [];

    // =========================================================
    // VALIDAR OPERADORES
    // =========================================================

    const operatorIds = operators
      .map((operator) => {
        return cleanString(operator.memberId);
      })
      .filter(
        (id): id is string => Boolean(id)
      );

    const uniqueOperatorIds = [
      ...new Set(operatorIds),
    ];

    // El Alpha no debe ser enviado como operador adicional.
    // El trigger de Supabase ya lo agrega automáticamente.
    const participantIds =
      uniqueOperatorIds.filter(
        (memberId) => memberId !== user.id
      );

    // =========================================================
    // CREAR DESPLIEGUE
    // =========================================================

    const {
      data: deploymentData,
      error: deploymentError,
    } = await supabase.rpc(
      'create_deployment',
      {
        p_title: title,
        p_type: type,
        p_location: location,
        p_risk_level: riskLevel,
        p_description: description,
      }
    );

    if (deploymentError) {
      console.error(
        'CREATE DEPLOYMENT RPC ERROR:',
        deploymentError
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
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

    const deployment =
      Array.isArray(deploymentData)
        ? deploymentData[0]
        : deploymentData;

    if (!deployment?.id) {
      console.error(
        'CREATE DEPLOYMENT: respuesta inválida',
        deploymentData
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            'El despliegue fue procesado, pero no se recibió su identificador.',
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
      Number(deployment.id);

    // =========================================================
    // OPERADORES
    // =========================================================

    if (participantIds.length > 0) {
      const operatorRows =
        participantIds.map((memberId) => ({
          deployment_id: deploymentId,
          member_id: memberId,
          role: 'operator',
        }));

      const {
        error: operatorsError,
      } = await supabase
        .from('deployment_members')
        .insert(operatorRows);

      if (operatorsError) {
        console.error(
          'DEPLOYMENT OPERATORS ERROR:',
          operatorsError
        );

        return new Response(
          JSON.stringify({
            success: false,
            error:
              'El despliegue fue creado, pero no se pudieron guardar los operadores.',
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

    // =========================================================
    // SOSPECHOSOS
    // =========================================================

    const suspectRows = suspects
      .map((suspect) => {
        const identification =
          cleanString(
            suspect.identification
          );

        const confiscatedItems =
          cleanString(
            suspect.confiscatedItems
          );

        return {
          deployment_id: deploymentId,

          // La columna name actualmente es NOT NULL.
          // Se conserva compatibilidad con el esquema actual.
          name:
            identification ||
            'Sin identificación',

          identification,
          confiscated_items:
            confiscatedItems,
        };
      })
      .filter((suspect) => {
        return Boolean(
          suspect.identification ||
          suspect.confiscated_items
        );
      });

    if (suspectRows.length > 0) {
      const {
        error: suspectsError,
      } = await supabase
        .from('deployment_suspects')
        .insert(suspectRows);

      if (suspectsError) {
        console.error(
          'DEPLOYMENT SUSPECTS ERROR:',
          suspectsError
        );

        return new Response(
          JSON.stringify({
            success: false,
            error:
              'El despliegue fue creado, pero no se pudieron guardar los sospechosos.',
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

    // =========================================================
    // VEHÍCULOS
    // =========================================================

    const vehicleRows = vehicles
      .map((vehicle) => ({
        deployment_id: deploymentId,
        description: cleanString(
          vehicle.description
        ),
      }))
      .filter(
        (
          vehicle
        ): vehicle is {
          deployment_id: number;
          description: string;
        } => Boolean(vehicle.description)
      );

    if (vehicleRows.length > 0) {
      const {
        error: vehiclesError,
      } = await supabase
        .from('deployment_vehicles')
        .insert(vehicleRows);

      if (vehiclesError) {
        console.error(
          'DEPLOYMENT VEHICLES ERROR:',
          vehiclesError
        );

        return new Response(
          JSON.stringify({
            success: false,
            error:
              'El despliegue fue creado, pero no se pudieron guardar los vehículos.',
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

    // =========================================================
    // MATERIAL / EQUIPO
    // =========================================================

    const equipmentRows = equipment
      .map((item) => ({
        deployment_id: deploymentId,
        description: cleanString(
          item.description
        ),
      }))
      .filter(
        (
          item
        ): item is {
          deployment_id: number;
          description: string;
        } => Boolean(item.description)
      );

    if (equipmentRows.length > 0) {
      const {
        error: equipmentError,
      } = await supabase
        .from('deployment_equipment')
        .insert(equipmentRows);

      if (equipmentError) {
        console.error(
          'DEPLOYMENT EQUIPMENT ERROR:',
          equipmentError
        );

        return new Response(
          JSON.stringify({
            success: false,
            error:
              'El despliegue fue creado, pero no se pudo guardar el material utilizado.',
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

    // =========================================================
    // GRABACIONES
    // =========================================================

    const recordingRows = recordings
      .map((recording) => ({
        deployment_id: deploymentId,
        url: cleanString(
          recording.url
        ),
      }))
      .filter(
        (
          recording
        ): recording is {
          deployment_id: number;
          url: string;
        } => Boolean(recording.url)
      );

    if (recordingRows.length > 0) {
      const {
        error: recordingsError,
      } = await supabase
        .from('deployment_recordings')
        .insert(recordingRows);

      if (recordingsError) {
        console.error(
          'DEPLOYMENT RECORDINGS ERROR:',
          recordingsError
        );

        return new Response(
          JSON.stringify({
            success: false,
            error:
              'El despliegue fue creado, pero no se pudieron guardar las grabaciones.',
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

    // =========================================================
    // RESPUESTA
    // =========================================================

    return new Response(
      JSON.stringify({
        success: true,
        id: deploymentId,
        code: deployment.code,
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
      'CREATE DEPLOYMENT UNEXPECTED ERROR:',
      error
    );

    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Ocurrió un error inesperado.',
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