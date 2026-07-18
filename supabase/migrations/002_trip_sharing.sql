create or replace function public.add_trip_member_by_email(
  target_trip uuid,
  target_email text,
  member_role text default 'editor'
)
returns table(user_id uuid, display_name text, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_user_id uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if member_role not in ('editor', 'viewer') then
    raise exception '올바르지 않은 권한입니다.';
  end if;

  if not exists (
    select 1 from public.trips
    where id = target_trip and owner_id = auth.uid()
  ) then
    raise exception '여행 소유자만 사용자를 초대할 수 있습니다.';
  end if;

  select id into found_user_id
  from auth.users
  where lower(email) = lower(trim(target_email))
  limit 1;

  if found_user_id is null then
    raise exception '해당 이메일로 가입한 사용자를 찾을 수 없습니다.';
  end if;

  if found_user_id = auth.uid() then
    raise exception '본인은 이미 여행 소유자입니다.';
  end if;

  insert into public.trip_members(trip_id, user_id, role)
  values(target_trip, found_user_id, member_role)
  on conflict (trip_id, user_id)
  do update set role = excluded.role;

  return query
  select p.id, p.display_name, tm.role
  from public.profiles p
  join public.trip_members tm on tm.user_id = p.id
  where tm.trip_id = target_trip and p.id = found_user_id;
end;
$$;

revoke all on function public.add_trip_member_by_email(uuid, text, text) from public;
grant execute on function public.add_trip_member_by_email(uuid, text, text) to authenticated;
