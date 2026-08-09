create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := auth.uid();
begin
  if requesting_user is null then
    raise exception '로그인이 필요합니다.';
  end if;

  -- Storage objects are not removed by the profile foreign-key cascade.
  delete from storage.objects where owner_id::text = requesting_user::text;
  delete from auth.users where id = requesting_user;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

comment on function public.delete_own_account() is
  'Deletes the authenticated user and all data connected through cascading foreign keys.';
