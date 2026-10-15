-- Copies the legacy 4-slot time_entries into punches/work_days/user_settings.
-- Idempotent (on conflict) and non-destructive: time_entries, users and
-- remuneration_config are not modified.
--
-- Before running: create the Supabase Auth user and replace the e-mail below.

do $$
declare
  v_user uuid := (select id from auth.users where email = 'CHANGE_ME@example.com');
begin
  if v_user is null then
    raise exception 'Auth user not found: create it first and fix the e-mail in this script';
  end if;

  -- A lunch of zero length (lunch_start = lunch_end) means one continuous
  -- block, e.g. "14:43 / 14:43 / 14:43 / 22:37" or a half day
  -- "09:32 / 13:15 / 13:15 / 13:15". Emitting 4 punches there would collide
  -- on the same instant and leave an odd count, so it becomes one interval.
  with legacy_rows as (
    select
      te.id,
      te.work_date,
      te.start_time::time as s,
      te.lunch_start_time::time as ls,
      te.lunch_end_time::time as le,
      te.end_time::time as e
    from public.time_entries te
    where not te.is_holiday
      and te.source not in ('day_marker', 'holiday_marker')
      and coalesce(te.start_time, '') not in ('', '00:00')
  ),
  intervals as (
    select id, work_date, s as i_start, e as i_end from legacy_rows where ls = le
    union all
    select id, work_date, s, ls from legacy_rows where ls <> le
    union all
    select id, work_date, le, e from legacy_rows where ls <> le
  )
  insert into public.punches (user_id, punched_at, work_date, source, note)
  select
    v_user,
    (i.work_date + p.t) at time zone 'America/Sao_Paulo',
    i.work_date,
    'legacy',
    'time_entries#' || i.id
  from intervals i
  cross join lateral (values (i.i_start), (i.i_end)) as p(t)
  where i.i_end > i.i_start
  on conflict (user_id, punched_at) do nothing;

  insert into public.work_days (user_id, work_date, is_holiday, work_mode)
  select
    v_user,
    te.work_date,
    bool_or(te.is_holiday),
    -- "Presencial" sorts after "Home office", so a day with any presencial
    -- row counts as presencial, matching the legacy remuneration rule.
    case max(nullif(te.work_mode, ''))
      when 'Presencial' then 'presencial'
      when 'Home office' then 'home_office'
    end
  from public.time_entries te
  group by te.work_date
  having bool_or(te.is_holiday) or max(nullif(te.work_mode, '')) is not null
  on conflict (user_id, work_date) do update
    set is_holiday = excluded.is_holiday,
        work_mode = excluded.work_mode,
        updated_at = now();

  insert into public.user_settings (
    user_id, valor_base, valor_hora, valor_bonus, valor_aux_transporte
  )
  select v_user, rc.valor_base, rc.valor_hora, rc.valor_bonus, rc.valor_aux_transporte
  from public.remuneration_config rc
  order by rc.id
  limit 1
  on conflict (user_id) do update
    set valor_base = excluded.valor_base,
        valor_hora = excluded.valor_hora,
        valor_bonus = excluded.valor_bonus,
        valor_aux_transporte = excluded.valor_aux_transporte,
        updated_at = now();

  insert into public.user_settings (user_id) values (v_user)
  on conflict (user_id) do nothing;
end $$;
