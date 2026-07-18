create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  destination text not null,
  start_date date not null,
  end_date date not null,
  people integer not null default 1 check (people > 0),
  currency text not null default 'VND',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_date date not null,
  start_time time,
  title text not null,
  place_name text,
  address text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  memo text,
  estimated_cost numeric(14,2) not null default 0,
  actual_cost numeric(14,2) not null default 0,
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  address text,
  memo text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  schedule_item_id uuid references public.schedule_items(id) on delete set null,
  paid_by uuid not null references public.profiles(id),
  category text,
  title text not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'VND',
  spent_at timestamptz not null default now(),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  schedule_item_id uuid references public.schedule_items(id) on delete cascade,
  expense_id uuid references public.expenses(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  storage_path text not null unique,
  kind text not null default 'photo' check (kind in ('photo', 'receipt', 'document', 'qr')),
  created_at timestamptz not null default now()
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  email text,
  token_hash text not null unique,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index trip_members_user_idx on public.trip_members(user_id);
create index schedule_items_trip_date_idx on public.schedule_items(trip_id, day_date, sort_order);
create index expenses_trip_date_idx on public.expenses(trip_id, spent_at);
create index attachments_trip_idx on public.attachments(trip_id);

create or replace function public.is_trip_member(target_trip uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from trip_members where trip_id = target_trip and user_id = auth.uid()) $$;

create or replace function public.can_edit_trip(target_trip uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from trip_members where trip_id = target_trip and user_id = auth.uid() and role in ('owner','editor')) $$;

create or replace function public.owns_trip(target_trip uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from trips where id = target_trip and owner_id = auth.uid()) $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin insert into profiles(id, display_name, avatar_url) values(new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.raw_user_meta_data->>'avatar_url'); return new; end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.add_trip_owner()
returns trigger language plpgsql security definer set search_path = public
as $$ begin insert into trip_members(trip_id,user_id,role) values(new.id,new.owner_id,'owner'); return new; end $$;

create trigger on_trip_created after insert on public.trips for each row execute procedure public.add_trip_owner();

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.schedule_items enable row level security;
alter table public.places enable row level security;
alter table public.expenses enable row level security;
alter table public.attachments enable row level security;
alter table public.invites enable row level security;

create policy "profiles visible to authenticated" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "members view trips" on public.trips for select to authenticated using (public.is_trip_member(id) or owner_id = (select auth.uid()));
create policy "users create trips" on public.trips for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "editors update trips" on public.trips for update to authenticated using (public.can_edit_trip(id)) with check (public.can_edit_trip(id));
create policy "owners delete trips" on public.trips for delete to authenticated using (owner_id = (select auth.uid()));

create policy "members view membership" on public.trip_members for select to authenticated using (public.is_trip_member(trip_id));
create policy "owners manage membership" on public.trip_members for all to authenticated using (public.owns_trip(trip_id)) with check (public.owns_trip(trip_id));

create policy "members view schedules" on public.schedule_items for select to authenticated using (public.is_trip_member(trip_id));
create policy "editors create schedules" on public.schedule_items for insert to authenticated with check (public.can_edit_trip(trip_id) and created_by = (select auth.uid()));
create policy "editors update schedules" on public.schedule_items for update to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
create policy "editors delete schedules" on public.schedule_items for delete to authenticated using (public.can_edit_trip(trip_id));

create policy "members view places" on public.places for select to authenticated using (public.is_trip_member(trip_id));
create policy "editors manage places" on public.places for all to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
create policy "members view expenses" on public.expenses for select to authenticated using (public.is_trip_member(trip_id));
create policy "editors manage expenses" on public.expenses for all to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
create policy "members view attachments" on public.attachments for select to authenticated using (public.is_trip_member(trip_id));
create policy "editors manage attachments" on public.attachments for all to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
create policy "owners manage invites" on public.invites for all to authenticated using (public.owns_trip(trip_id)) with check (public.owns_trip(trip_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-files', 'trip-files', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "members read trip files" on storage.objects for select to authenticated
using (bucket_id = 'trip-files' and public.is_trip_member(((storage.foldername(name))[1])::uuid));
create policy "editors upload trip files" on storage.objects for insert to authenticated
with check (bucket_id = 'trip-files' and public.can_edit_trip(((storage.foldername(name))[1])::uuid));
create policy "editors update trip files" on storage.objects for update to authenticated
using (bucket_id = 'trip-files' and public.can_edit_trip(((storage.foldername(name))[1])::uuid));
create policy "editors delete trip files" on storage.objects for delete to authenticated
using (bucket_id = 'trip-files' and public.can_edit_trip(((storage.foldername(name))[1])::uuid));
