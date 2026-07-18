alter table public.places
  add column if not exists google_place_id text,
  add column if not exists google_maps_url text;

create unique index if not exists places_trip_google_place_idx
  on public.places(trip_id, google_place_id)
  where google_place_id is not null;

comment on column public.places.google_place_id is 'Google Places에서 받은 고유 장소 ID';
comment on column public.places.google_maps_url is 'Google 지도에서 장소를 여는 URL';
