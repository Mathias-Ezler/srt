import type { APIRoute } from 'astro';
import { createApiClient } from '../../../lib/supabase-api';

export const prerender = false;

const BUCKET = 'avatars';
const MAX_SIZE = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const isExternal = (value: string) => /^https?:\/\//.test(value);

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createApiClient(request, cookies);

  // 1) ¿Quién es?
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: 'Sesión no válida. Vuelve a iniciar sesión.' }, 401);
  }

  // 2) Leer y validar los datos
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  const fullName = String(form.get('full_name') ?? '').trim();
  const callsign = String(form.get('callsign') ?? '').trim().toUpperCase();
  const photo = form.get('photo');

  if (fullName.length < 2 || fullName.length > 60) {
    return json({ error: 'El nombre debe tener entre 2 y 60 caracteres.' }, 400);
  }

  if (callsign && !/^[A-Z0-9-]{1,20}$/.test(callsign)) {
    return json({ error: 'El callsign solo admite letras, números y guion.' }, 400);
  }

  // 3) Registro actual (para saber cuál era la foto anterior)
  const { data: current, error: currentError } = await supabase
    .from('members')
    .select('photo_url')
    .eq('id', user.id)
    .single();

  if (currentError || !current) {
    console.error('No se encontró el miembro:', currentError);
    return json({ error: 'No se encontró tu registro de miembro.' }, 404);
  }

  // 4) Subir la foto nueva (si hay)
  let newPath: string | null = null;

  if (photo instanceof File && photo.size > 0) {
    const ext = EXTENSIONS[photo.type];

    if (!ext) {
      return json({ error: 'Formato no permitido. Usa JPG, PNG o WEBP.' }, 400);
    }

    if (photo.size > MAX_SIZE) {
      return json({ error: 'La fotografía no puede superar los 5 MB.' }, 400);
    }

    newPath = `${user.id}/avatar-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(newPath, photo, { contentType: photo.type, upsert: false });

    if (uploadError) {
      console.error('Error subiendo la foto:', uploadError);
      return json({ error: 'No se pudo subir la fotografía.' }, 500);
    }
  }

    // 5) Guardar en la base de datos
    const changes: Record<string, string | null> = {
        full_name: fullName,
        callsign: callsign || null,
      };
    
      if (newPath) {
        changes.photo_url = newPath;
      }
    
      const { data: updated, error: updateError } = await supabase
        .from('members')
        .update(changes)
        .eq('id', user.id)
        .select('id');
    
      if (updateError || !updated || updated.length === 0) {
        // Si algo falló, no dejamos la foto nueva huérfana en el bucket
        if (newPath) {
          await supabase.storage.from(BUCKET).remove([newPath]);
        }
    
        if (updateError?.code === '23505') {
          return json({ error: 'Ese callsign ya está asignado a otro operador.' }, 409);
        }
    
        if (updateError) {
          console.error('Error actualizando perfil:', updateError);
          return json({ error: 'No se pudo guardar el perfil.' }, 500);
        }
    
        // Sin error pero 0 filas: la política RLS bloqueó el cambio
        console.error('RLS bloqueó la actualización del perfil de', user.id);
        return json(
          { error: 'No se guardó ningún cambio: faltan permisos en la base de datos.' },
          403
        );
      }
    
      // 6) Borrar la foto anterior (si era un archivo nuestro)
      const oldPath = current.photo_url as string | null;
    
      if (newPath && oldPath && !isExternal(oldPath) && oldPath !== newPath) {
        await supabase.storage.from(BUCKET).remove([oldPath]);
      }
    
      // 7) Responder con la ruta y una URL temporal para mostrarla
      const finalPath = newPath ?? oldPath ?? null;
      let photoUrl: string | null = null;
    
      if (finalPath) {
        if (isExternal(finalPath)) {
          photoUrl = finalPath;
        } else {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(finalPath, 3600);
          photoUrl = signed?.signedUrl ?? null;
        }
      }
    
      return json({ ok: true, photoPath: finalPath, photoUrl });
    };