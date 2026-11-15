-- Local Supabase only: fixtures and writes are rolled back.
begin;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000004218', 'medicine-test-nonowner@example.test');
select set_config('request.jwt.claims', json_build_object('sub', (select id::text from auth.users where email = 'shahhtetnaing@gmail.com' limit 1), 'email', 'shahhtetnaing@gmail.com', 'role', 'authenticated')::text, true);
set local role authenticated;
do $test$
declare v_id uuid; v_insulin uuid;
begin
  insert into public.medicine_logs(day, medicine_name, dose_taken, taken_at)
    values ('2026-11-14', 'Test medicine', '1 test tablet', '2026-11-13 16:05:00+00') returning id into v_id;
  assert (select day = '2026-11-14' and dose_taken = '1 test tablet' from public.medicine_logs where id = v_id), 'medicine did not persist on Singapore day';
  insert into public.medicine_logs(day, medicine_name, dose_taken, taken_at)
    values ('2026-11-14', 'Test medicine', '2 test tablets', '2026-11-14 06:00:00+00');
  update public.medicine_logs set dose_taken = '3 test tablets', taken_at = '2026-11-14 07:00:00+00' where id = v_id;
  assert (select dose_taken = '3 test tablets' and taken_at = '2026-11-14 07:00:00+00' from public.medicine_logs where id = v_id), 'medicine edit lost';
  begin
    insert into public.medicine_logs(day, medicine_name, dose_taken, taken_at) values ('2026-11-14', ' ', '1', '2026-11-14 07:00:00+00');
    raise exception 'blank name accepted';
  exception when check_violation then null; end;
  begin
    update public.medicine_logs set dose_taken = '' where id = v_id;
    raise exception 'blank dose accepted';
  exception when check_violation then null; end;
  begin
    update public.medicine_logs set day = '2026-11-13' where id = v_id;
    raise exception 'mismatched Singapore day accepted';
  exception when check_violation then null; end;
  begin
    update public.medicine_logs set user_id = '00000000-0000-4000-8000-000000004218' where id = v_id;
    raise exception 'record reassigned to another user';
  exception when insufficient_privilege then null; end;
  delete from public.medicine_logs where id = v_id;
  assert not exists (select 1 from public.medicine_logs where id = v_id), 'medicine delete failed';
  insert into public.insulin_logs(day, kind, units, taken_at) values ('1900-01-01', 'lantus', 24, '1900-01-01 00:00:00+00') returning id into v_insulin;
  begin
    insert into public.insulin_logs(day, kind, units, taken_at) values ('1900-01-01', 'lantus', 24, '1900-01-01 00:00:00+00');
    raise exception 'duplicate Lantus allowed';
  exception when unique_violation then null; end;
  update public.insulin_logs set units = 23.5 where id = v_insulin;
  assert (select units = 23.5 from public.insulin_logs where id = v_insulin), 'insulin edit failed';
  delete from public.insulin_logs where id = v_insulin;
end $test$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000004218","email":"medicine-test-nonowner@example.test","role":"authenticated"}', true);
set local role authenticated;
do $test$
declare n integer;
begin
  assert not exists (select 1 from public.medicine_logs), 'non-owner read medicines';
  assert not exists (select 1 from public.insulin_logs), 'non-owner read insulin';
  update public.medicine_logs set dose_taken = 'tampered';
  get diagnostics n = row_count;
  assert n = 0, 'non-owner updated medicines';
  delete from public.medicine_logs;
  get diagnostics n = row_count;
  assert n = 0, 'non-owner deleted medicines';
  begin
    insert into public.medicine_logs(medicine_name, dose_taken, taken_at) values ('Test', '1', now());
    raise exception 'non-owner inserted medicine';
  exception when insufficient_privilege then null; end;
end $test$;
reset role;
set local role anon;
do $test$
begin
  begin
    perform * from public.medicine_logs;
    raise exception 'anonymous read medicine';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.medicine_logs(medicine_name, dose_taken, taken_at) values ('Test', '1', now());
    raise exception 'anonymous inserted medicine';
  exception when insufficient_privilege then null; end;
end $test$;
rollback;
