create table if not exists public.ai_usage_daily (
  usage_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_count integer not null default 0 check (request_count >= 0),
  last_requested_at timestamptz,
  last_feature text,
  primary key (usage_date, user_id)
);

create table if not exists public.ai_usage_global_daily (
  usage_date date primary key,
  request_count integer not null default 0 check (request_count >= 0),
  last_requested_at timestamptz
);

alter table public.ai_usage_daily enable row level security;
alter table public.ai_usage_global_daily enable row level security;

revoke all on public.ai_usage_daily from anon, authenticated;
revoke all on public.ai_usage_global_daily from anon, authenticated;

create or replace function public.consume_ai_quota(feature_name text default 'schedule')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  today_seoul date := (now() at time zone 'Asia/Seoul')::date;
  user_count integer := 0;
  global_count integer := 0;
  daily_limit integer := 5;
  last_request timestamptz;
  retry_seconds integer := 0;
begin
  if current_user_id is null then
    return jsonb_build_object('allowed', false, 'code', 'unauthorized', 'message', '로그인이 필요합니다.');
  end if;

  if exists (select 1 from public.trips where owner_id = current_user_id) then
    daily_limit := 20;
  end if;

  perform pg_advisory_xact_lock(hashtext('travelon-ai-quota-' || today_seoul::text));

  select request_count, last_requested_at
    into user_count, last_request
  from public.ai_usage_daily
  where usage_date = today_seoul and user_id = current_user_id;

  user_count := coalesce(user_count, 0);
  if last_request is not null and last_request > now() - interval '10 seconds' then
    retry_seconds := greatest(1, ceil(extract(epoch from (last_request + interval '10 seconds' - now())))::integer);
    return jsonb_build_object(
      'allowed', false,
      'code', 'cooldown',
      'message', retry_seconds || '초 후 다시 시도해 주세요.',
      'retry_after', retry_seconds,
      'remaining', greatest(0, daily_limit - user_count)
    );
  end if;

  if user_count >= daily_limit then
    return jsonb_build_object(
      'allowed', false,
      'code', 'user_daily_limit',
      'message', '오늘 사용할 수 있는 AI 횟수를 모두 사용했습니다. 내일 다시 이용해 주세요.',
      'remaining', 0,
      'limit', daily_limit
    );
  end if;

  select request_count into global_count
  from public.ai_usage_global_daily
  where usage_date = today_seoul;
  global_count := coalesce(global_count, 0);

  if global_count >= 100 then
    return jsonb_build_object(
      'allowed', false,
      'code', 'global_daily_limit',
      'message', '오늘 앱의 AI 사용 한도에 도달했습니다. 내일 다시 이용해 주세요.',
      'remaining', greatest(0, daily_limit - user_count)
    );
  end if;

  insert into public.ai_usage_daily(usage_date, user_id, request_count, last_requested_at, last_feature)
  values(today_seoul, current_user_id, 1, now(), left(coalesce(feature_name, 'unknown'), 50))
  on conflict (usage_date, user_id) do update
    set request_count = public.ai_usage_daily.request_count + 1,
        last_requested_at = now(),
        last_feature = excluded.last_feature;

  insert into public.ai_usage_global_daily(usage_date, request_count, last_requested_at)
  values(today_seoul, 1, now())
  on conflict (usage_date) do update
    set request_count = public.ai_usage_global_daily.request_count + 1,
        last_requested_at = now();

  return jsonb_build_object(
    'allowed', true,
    'remaining', greatest(0, daily_limit - user_count - 1),
    'limit', daily_limit,
    'global_remaining', greatest(0, 100 - global_count - 1)
  );
end;
$$;

revoke all on function public.consume_ai_quota(text) from public;
grant execute on function public.consume_ai_quota(text) to authenticated;

comment on function public.consume_ai_quota(text) is 'AI 호출 전 사용자·앱 일일 한도와 10초 대기시간을 원자적으로 검사하고 사용량을 차감한다.';
