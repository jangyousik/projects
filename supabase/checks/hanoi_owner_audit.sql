select
  t.id as trip_id,
  t.title,
  t.destination,
  u.email as owner_email,
  tm.role as owner_member_role,
  t.start_date,
  t.end_date
from public.trips t
join auth.users u on u.id = t.owner_id
left join public.trip_members tm
  on tm.trip_id = t.id and tm.user_id = t.owner_id
where lower(t.title) = lower('하노이 가족여행')
   or (t.destination ilike '%하노이%' and t.start_date = date '2026-09-10');

-- 기대 결과
-- owner_email: jys7867@gmail.com
-- owner_member_role: owner
