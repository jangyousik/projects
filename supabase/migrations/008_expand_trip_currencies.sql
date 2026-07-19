alter table public.schedule_items
  drop constraint if exists schedule_items_cost_currency_check;

alter table public.schedule_items
  add constraint schedule_items_cost_currency_check
  check (cost_currency in ('VND', 'KRW', 'USD', 'JPY', 'THB', 'SGD', 'EUR', 'GBP', 'CNY', 'TWD', 'PHP', 'MYR', 'IDR'));

comment on column public.schedule_items.cost_currency is '여행 국가에 따른 일정 비용 통화 코드';
