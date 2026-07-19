-- The original legacy classifier treated any item mentioning A89 or Oakwood
-- as accommodation. Correct the known Hanoi itinerary items by their purpose.
update public.schedule_items as schedule
set cost_category = case
  when lower(schedule.title) like '%spa9%' then 'activity'
  when lower(schedule.title) like '%bánh canh%'
    or schedule.title like '%미딩 커피숍%' then 'food'
  else 'transport'
end,
updated_at = now()
from public.trips as trip
join auth.users as owner on owner.id = trip.owner_id
where schedule.trip_id = trip.id
  and lower(owner.email) = 'jys7867@gmail.com'
  and trip.start_date = date '2026-09-10'
  and trip.end_date = date '2026-09-13'
  and schedule.cost_category = 'accommodation'
  and (
    schedule.title ~* '노이바이.*A89'
    or schedule.title ~* 'A89.*미딩'
    or schedule.title ~* '미딩.*Oakwood'
    or schedule.title ~* 'Bánh Canh'
    or schedule.title ~* 'Spa9'
    or schedule.title ~* '미딩 커피숍'
    or schedule.title ~* 'Oakwood.*Pizza 4P'
    or schedule.title ~* 'SENSOULMATE.*Oakwood'
    or schedule.title ~* 'Oakwood.*호안끼엠'
  );

-- Some legacy routes keep their descriptive text in place_name or memo rather
-- than title. For this specific imported itinerary, the owner confirmed that
-- only the following two rows are accommodation. Reclassify every other row
-- that is still incorrectly marked as accommodation.
update public.schedule_items as schedule
set cost_category = case
  when lower(concat_ws(' ', schedule.title, schedule.place_name, schedule.memo))
    ~ 'spa9|마사지|스파' then 'activity'
  when lower(concat_ws(' ', schedule.title, schedule.place_name, schedule.memo))
    ~ 'bánh canh|커피숍|카페|식사|레스토랑' then 'food'
  else 'transport'
end,
updated_at = now()
from public.trips as trip
join auth.users as owner on owner.id = trip.owner_id
where schedule.trip_id = trip.id
  and lower(owner.email) = 'jys7867@gmail.com'
  and trip.start_date = date '2026-09-10'
  and trip.end_date = date '2026-09-13'
  and schedule.cost_category = 'accommodation'
  and schedule.title not ilike '%A89 웨스트레이크 호텔 체크인%'
  and schedule.title not ilike '%Oakwood Residence Hanoi%';
