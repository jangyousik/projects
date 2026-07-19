select
  t.title as trip_title,
  s.day_date,
  s.start_time,
  s.title as schedule_title,
  s.estimated_cost,
  s.actual_cost,
  s.cost_currency,
  s.payment_method,
  s.completed,
  s.reservation_site,
  s.reservation_reference,
  s.memo
from public.schedule_items s
join public.trips t on t.id = s.trip_id
join auth.users u on u.id = t.owner_id
where lower(u.email) = 'jys7867@gmail.com'
  and t.start_date = date '2026-09-10'
  and t.end_date = date '2026-09-13'
  and s.cost_category = 'accommodation'
order by s.day_date, s.start_time nulls last, s.created_at;
