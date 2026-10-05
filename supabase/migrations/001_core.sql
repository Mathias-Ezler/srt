-- ===== Tablas =====
create table public.ranks (
  id smallint generated always as identity primary key,
  name text not null unique,
  level smallint not null unique,      -- mayor número = mayor rango
  insignia_url text
);

create table public.permissions (
  key text primary key,
  description text not null
);

create table public.rank_permissions (
  rank_id smallint not null references public.ranks(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (rank_id, permission_key)
);

create type public.member_status as enum ('pending', 'active', 'suspended');

create table public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_id text unique,
  discord_username text,
  callsign text unique,
  rank_id smallint references public.ranks(id),
  status public.member_status not null default 'pending',
  photo_url text,
  specialties text[] not null default '{}',
  joined_at date,
  created_at timestamptz not null default now()
);

-- ===== Alta automática al iniciar sesión con Discord =====
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.members (id, discord_id, discord_username)
  values (
    new.id,
    new.raw_user_meta_data->>'provider_id',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== Funciones auxiliares de permisos =====
create function public.is_active_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.members
    where id = auth.uid() and status = 'active'
  );
$$;

create function public.has_permission(p text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    join public.rank_permissions rp on rp.rank_id = m.rank_id
    where m.id = auth.uid()
      and m.status = 'active'
      and rp.permission_key = p
  );
$$;

-- ===== Row Level Security =====
alter table public.ranks            enable row level security;
alter table public.permissions      enable row level security;
alter table public.rank_permissions enable row level security;
alter table public.members          enable row level security;

create policy "rangos visibles para miembros activos"
  on public.ranks for select using (public.is_active_member());

create policy "permisos visibles para miembros activos"
  on public.permissions for select using (public.is_active_member());

create policy "rank_permissions visibles para miembros activos"
  on public.rank_permissions for select using (public.is_active_member());

create policy "ver mi propio registro"
  on public.members for select using (id = auth.uid());

create policy "ver miembros activos"
  on public.members for select
  using (public.is_active_member() and status = 'active');

create policy "gestionar miembros"
  on public.members for update
  using (public.has_permission('members.manage'));

-- ===== Datos iniciales =====
insert into public.ranks (name, level) values
  ('Operador', 1),
  ('Líder', 2);

insert into public.permissions (key, description) values
  ('operations.create',    'Registrar operaciones'),
  ('operations.edit_own',  'Editar las operaciones propias'),
  ('operations.edit_any',  'Editar cualquier operación'),
  ('operations.delete',    'Eliminar operaciones'),
  ('aar.write',            'Escribir informes post-operación'),
  ('aar.review',           'Revisar informes post-operación'),
  ('medals.award',         'Otorgar condecoraciones'),
  ('members.manage',       'Gestionar miembros y rangos'),
  ('gallery.upload',       'Subir fotos a la galería'),
  ('announcements.post',   'Publicar comunicados'),
  ('admin.access',         'Acceso al panel de administración');

-- Operador
insert into public.rank_permissions (rank_id, permission_key)
select r.id, p.key
from public.ranks r, public.permissions p
where r.name = 'Operador'
  and p.key in ('operations.create', 'operations.edit_own', 'aar.write', 'gallery.upload');

-- Líder: todos los permisos
insert into public.rank_permissions (rank_id, permission_key)
select r.id, p.key
from public.ranks r, public.permissions p
where r.name = 'Líder';