alter table public.schedule_items
  add column if not exists cost_category text not null default 'other'
    check (cost_category in ('flight', 'accommodation', 'food', 'transport', 'activity', 'shopping', 'other')),
  add column if not exists payment_method text not null default 'either'
    check (payment_method in ('cash', 'card', 'either', 'prepaid')),
  add column if not exists cost_currency text not null default 'VND'
    check (cost_currency in ('VND', 'KRW', 'USD'));

comment on column public.schedule_items.cost_category is '일정 비용 분류: 항공, 숙소, 식비, 교통, 관광, 쇼핑, 기타';
comment on column public.schedule_items.payment_method is '현지 결제 방법: 현금, 카드, 모두 가능, 선결제';
comment on column public.schedule_items.cost_currency is '예상 비용과 실제 비용에 적용되는 통화';

update public.schedule_items
set cost_category = case
  when lower(title || ' ' || coalesce(memo, '')) ~ '항공|비행|airline|flight' then 'flight'
  when lower(title || ' ' || coalesce(memo, '')) ~ '숙소|호텔|hotel|oakwood|a89' then 'accommodation'
  when lower(title || ' ' || coalesce(memo, '')) ~ '식사|저녁|점심|조식|카페|뷔페|레스토랑|분짜|피자' then 'food'
  when lower(title || ' ' || coalesce(memo, '')) ~ '그랩|grab|이동|택시|차량' then 'transport'
  when lower(title || ' ' || coalesce(memo, '')) ~ '쇼핑|마트|몰|시장' then 'shopping'
  when lower(title || ' ' || coalesce(memo, '')) ~ '관광|마사지|스파|투어|박물관|사원' then 'activity'
  else cost_category
end,
payment_method = case
  when lower(coalesce(memo, '')) ~ '예약완료|선결제' then 'prepaid'
  when lower(coalesce(memo, '')) ~ '현금만|pay-badge cash|현금' then 'cash'
  when lower(coalesce(memo, '')) ~ '카드 가능|pay-badge card|카드' then 'card'
  else payment_method
end;

update public.schedule_items
set estimated_cost = replace(substring(memo from '₩\s*([0-9,]+)'), ',', '')::numeric,
    cost_currency = 'KRW'
where estimated_cost = 0
  and memo ~ '₩\s*[0-9,]+';
