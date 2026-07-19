-- Local cash/card items that are unexpectedly stored in Korean won.
select
  s.day_date,
  s.start_time,
  s.title,
  s.cost_category,
  s.payment_method,
  s.estimated_cost,
  s.actual_cost,
  s.cost_currency,
  s.memo
from public.schedule_items as s
join public.trips as t on t.id = s.trip_id
join auth.users as u on u.id = t.owner_id
where lower(u.email) = 'jys7867@gmail.com'
  and t.start_date = date '2026-09-10'
  and t.end_date = date '2026-09-13'
  and s.cost_category not in ('flight', 'accommodation')
  and s.payment_method in ('cash', 'card', 'either')
  and s.cost_currency = 'KRW'
order by s.day_date, s.start_time nulls last, s.created_at;
