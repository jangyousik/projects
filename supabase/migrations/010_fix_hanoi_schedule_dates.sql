with shifted_trips as (
  select t.id
  from public.trips t
  where t.start_date = date '2026-09-10'
    and t.end_date = date '2026-09-13'
    and exists (
      select 1 from auth.users u
      where u.id = t.owner_id
        and lower(u.email) = 'jys7867@gmail.com'
    )
    and exists (
      select 1
      from public.schedule_items s
      where s.trip_id = t.id
        and s.day_date < t.start_date
    )
)
update public.schedule_items s
set day_date = s.day_date + 1,
    updated_at = now()
from shifted_trips t
where s.trip_id = t.id;
