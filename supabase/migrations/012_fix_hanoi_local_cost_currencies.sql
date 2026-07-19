-- Restore local Hanoi transport costs that were imported as KRW-converted
-- amounts. The legacy page used 1 VND = 0.057 KRW for these three rows.
update public.schedule_items as schedule
set estimated_cost = case
    when schedule.title ilike '%A89%미딩%' then 110000
    when schedule.title ilike '%미딩%Oakwood%' then 80000
    when schedule.title ilike '%Oakwood%노이바이%공항%' then 290000
    else schedule.estimated_cost
  end,
  cost_currency = 'VND',
  updated_at = now()
from public.trips as trip
join auth.users as owner on owner.id = trip.owner_id
where schedule.trip_id = trip.id
  and lower(owner.email) = 'jys7867@gmail.com'
  and trip.start_date = date '2026-09-10'
  and trip.end_date = date '2026-09-13'
  and schedule.cost_category = 'transport'
  and schedule.cost_currency = 'KRW'
  and (
    schedule.title ilike '%A89%미딩%'
    or schedule.title ilike '%미딩%Oakwood%'
    or schedule.title ilike '%Oakwood%노이바이%공항%'
  );
