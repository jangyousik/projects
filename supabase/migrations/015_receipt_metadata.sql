alter table public.attachments
  add column if not exists extracted_text text,
  add column if not exists detected_amount numeric(14,2),
  add column if not exists detected_currency text;

comment on column public.attachments.extracted_text is '기기 내 OCR로 읽은 영수증 원문';
comment on column public.attachments.detected_amount is 'OCR에서 사용자가 확인한 영수증 금액';
comment on column public.attachments.detected_currency is '일정에 적용한 영수증 통화';
