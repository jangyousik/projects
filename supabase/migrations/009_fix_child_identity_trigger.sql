create or replace function public.protect_child_identity()
returns trigger language plpgsql set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;

  if new.trip_id <> old.trip_id then
    raise exception '항목을 다른 여행으로 이동할 수 없습니다.';
  end if;

  if tg_table_name = 'schedule_items' then
    if new.created_by <> old.created_by then
      raise exception '일정 작성자는 변경할 수 없습니다.';
    end if;
  elsif tg_table_name = 'places' then
    if new.created_by <> old.created_by then
      raise exception '장소 작성자는 변경할 수 없습니다.';
    end if;
  elsif tg_table_name = 'expenses' then
    if new.paid_by <> old.paid_by then
      raise exception '결제자는 변경할 수 없습니다.';
    end if;
  elsif tg_table_name = 'attachments' then
    if new.uploaded_by <> old.uploaded_by then
      raise exception '업로더는 변경할 수 없습니다.';
    end if;
  end if;

  return new;
end;
$$;
