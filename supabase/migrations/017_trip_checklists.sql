create table if not exists public.trip_checklist_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trip_checklist_items enable row level security;
create policy "members view checklist" on public.trip_checklist_items for select to authenticated using (public.is_trip_member(trip_id));
create policy "editors create checklist" on public.trip_checklist_items for insert to authenticated with check (public.can_edit_trip(trip_id) and created_by = (select auth.uid()));
create policy "editors update checklist" on public.trip_checklist_items for update to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
create policy "editors delete checklist" on public.trip_checklist_items for delete to authenticated using (public.can_edit_trip(trip_id));
create index if not exists trip_checklist_order_idx on public.trip_checklist_items(trip_id, sort_order, created_at);
