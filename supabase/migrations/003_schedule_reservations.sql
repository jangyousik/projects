alter table public.schedule_items
  add column if not exists reservation_status text not null default 'none'
    check (reservation_status in ('none', 'planned', 'booked', 'cancelled')),
  add column if not exists reservation_site text,
  add column if not exists reservation_reference text,
  add column if not exists reservation_url text;

comment on column public.schedule_items.reservation_status is 'none: 예약 없음, planned: 예약 예정, booked: 예약 완료, cancelled: 취소됨';
comment on column public.schedule_items.reservation_site is '예약한 서비스 또는 사이트 이름';
comment on column public.schedule_items.reservation_reference is '예약번호, 티켓번호 또는 확인번호';
comment on column public.schedule_items.reservation_url is '예약 상세 화면이나 예약 서비스로 이동하는 HTTPS 링크';
