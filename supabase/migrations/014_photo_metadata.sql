alter table public.attachments
  add column if not exists captured_at timestamptz,
  add column if not exists caption text,
  add column if not exists place_name text;

create index if not exists attachments_trip_captured_idx
  on public.attachments(trip_id, captured_at desc)
  where kind = 'photo';

comment on column public.attachments.captured_at is '사진 촬영일 또는 사용자가 지정한 여행 날짜';
comment on column public.attachments.caption is '사진에 대한 사용자 메모';
comment on column public.attachments.place_name is '사진을 촬영한 장소 이름';
