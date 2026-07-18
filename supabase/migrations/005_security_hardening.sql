create or replace function public.protect_trip_owner()
returns trigger language plpgsql set search_path = public
as $$
begin
  if auth.uid() is not null and new.owner_id <> old.owner_id then
    raise exception '여행 소유자는 변경할 수 없습니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_trip_owner_before_update on public.trips;
create trigger protect_trip_owner_before_update
before update on public.trips
for each row execute procedure public.protect_trip_owner();

create or replace function public.protect_trip_membership()
returns trigger language plpgsql set search_path = public
as $$
declare
  actual_owner uuid;
begin
  select owner_id into actual_owner
  from public.trips
  where id = case when tg_op = 'DELETE' then old.trip_id else new.trip_id end;

  if tg_op = 'DELETE' then
    if auth.uid() is not null and old.user_id = actual_owner then
      raise exception '여행 소유자 멤버는 삭제할 수 없습니다.';
    end if;
    return old;
  end if;

  if new.role = 'owner' and new.user_id is distinct from actual_owner then
    raise exception '여행 소유자 외에는 owner 역할을 가질 수 없습니다.';
  end if;

  if tg_op = 'UPDATE' and auth.uid() is not null then
    if old.trip_id is distinct from new.trip_id or old.user_id is distinct from new.user_id then
      raise exception '멤버의 여행 또는 사용자는 변경할 수 없습니다.';
    end if;
    if old.user_id = actual_owner and new.role <> 'owner' then
      raise exception '여행 소유자의 역할은 변경할 수 없습니다.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_trip_membership_before_write on public.trip_members;
create trigger protect_trip_membership_before_write
before insert or update or delete on public.trip_members
for each row execute procedure public.protect_trip_membership();

drop policy if exists "owners manage membership" on public.trip_members;

create policy "owners add non-owner members"
on public.trip_members for insert to authenticated
with check (public.owns_trip(trip_id) and role in ('editor', 'viewer'));

create policy "owners update non-owner members"
on public.trip_members for update to authenticated
using (public.owns_trip(trip_id) and user_id <> (select auth.uid()))
with check (public.owns_trip(trip_id) and role in ('editor', 'viewer'));

create policy "owners remove non-owner members"
on public.trip_members for delete to authenticated
using (public.owns_trip(trip_id) and user_id <> (select auth.uid()));

create or replace function public.can_view_profile(target_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select target_user = auth.uid() or exists (
    select 1
    from trip_members mine
    join trip_members theirs on theirs.trip_id = mine.trip_id
    where mine.user_id = auth.uid() and theirs.user_id = target_user
  )
$$;

revoke all on function public.can_view_profile(uuid) from public;
grant execute on function public.can_view_profile(uuid) to authenticated;

drop policy if exists "profiles visible to authenticated" on public.profiles;
create policy "profiles visible to self or trip members"
on public.profiles for select to authenticated
using (public.can_view_profile(id));

create or replace function public.protect_child_identity()
returns trigger language plpgsql set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  if new.trip_id <> old.trip_id then
    raise exception '항목을 다른 여행으로 이동할 수 없습니다.';
  end if;
  if tg_table_name = 'schedule_items' and new.created_by <> old.created_by then
    raise exception '일정 작성자는 변경할 수 없습니다.';
  elsif tg_table_name = 'places' and new.created_by <> old.created_by then
    raise exception '장소 작성자는 변경할 수 없습니다.';
  elsif tg_table_name = 'expenses' and new.paid_by <> old.paid_by then
    raise exception '결제자는 변경할 수 없습니다.';
  elsif tg_table_name = 'attachments' and new.uploaded_by <> old.uploaded_by then
    raise exception '업로더는 변경할 수 없습니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_schedule_identity on public.schedule_items;
create trigger protect_schedule_identity before update on public.schedule_items
for each row execute procedure public.protect_child_identity();
drop trigger if exists protect_place_identity on public.places;
create trigger protect_place_identity before update on public.places
for each row execute procedure public.protect_child_identity();
drop trigger if exists protect_expense_identity on public.expenses;
create trigger protect_expense_identity before update on public.expenses
for each row execute procedure public.protect_child_identity();
drop trigger if exists protect_attachment_identity on public.attachments;
create trigger protect_attachment_identity before update on public.attachments
for each row execute procedure public.protect_child_identity();

drop policy if exists "editors manage places" on public.places;
create policy "editors create places" on public.places for insert to authenticated
with check (public.can_edit_trip(trip_id) and created_by = (select auth.uid()));
create policy "editors update places" on public.places for update to authenticated
using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
create policy "editors delete places" on public.places for delete to authenticated
using (public.can_edit_trip(trip_id));

drop policy if exists "editors manage expenses" on public.expenses;
create policy "editors create expenses" on public.expenses for insert to authenticated
with check (public.can_edit_trip(trip_id) and paid_by = (select auth.uid()));
create policy "editors update expenses" on public.expenses for update to authenticated
using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
create policy "editors delete expenses" on public.expenses for delete to authenticated
using (public.can_edit_trip(trip_id));

drop policy if exists "editors manage attachments" on public.attachments;
create policy "editors create attachments" on public.attachments for insert to authenticated
with check (public.can_edit_trip(trip_id) and uploaded_by = (select auth.uid()));
create policy "editors update attachments" on public.attachments for update to authenticated
using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
create policy "editors delete attachments" on public.attachments for delete to authenticated
using (public.can_edit_trip(trip_id));

create or replace function public.validate_same_trip_references()
returns trigger language plpgsql set search_path = public
as $$
begin
  if tg_table_name = 'expenses' and new.schedule_item_id is not null and not exists (
    select 1 from schedule_items where id = new.schedule_item_id and trip_id = new.trip_id
  ) then
    raise exception '경비와 일정은 같은 여행에 속해야 합니다.';
  end if;

  if tg_table_name = 'attachments' then
    if new.schedule_item_id is not null and not exists (
      select 1 from schedule_items where id = new.schedule_item_id and trip_id = new.trip_id
    ) then raise exception '첨부파일과 일정은 같은 여행에 속해야 합니다.'; end if;
    if new.expense_id is not null and not exists (
      select 1 from expenses where id = new.expense_id and trip_id = new.trip_id
    ) then raise exception '첨부파일과 경비는 같은 여행에 속해야 합니다.'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_expense_references on public.expenses;
create trigger validate_expense_references
before insert or update on public.expenses
for each row execute procedure public.validate_same_trip_references();
drop trigger if exists validate_attachment_references on public.attachments;
create trigger validate_attachment_references
before insert or update on public.attachments
for each row execute procedure public.validate_same_trip_references();
