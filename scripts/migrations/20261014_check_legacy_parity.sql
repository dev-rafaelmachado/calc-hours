-- Read-only check after 20261014_migrate_legacy.sql: lists every day whose
-- worked minutes differ between time_entries and the migrated punches.
-- An empty result means the migration preserved all totals.

with holidays as (
  select distinct work_date from public.time_entries where is_holiday
),
legacy as (
  select work_date, sum(total_minutes) as legacy_minutes, count(*) as legacy_rows
  from public.time_entries
  where source not in ('day_marker', 'holiday_marker')
    and work_date not in (select work_date from holidays)
  group by work_date
),
ordered as (
  select
    work_date,
    punched_at,
    row_number() over (partition by work_date order by punched_at) as rn
  from public.punches
  where source = 'legacy'
),
pairs as (
  select
    o_in.work_date,
    extract(epoch from (o_out.punched_at - o_in.punched_at)) / 60 as minutes
  from ordered o_in
  join ordered o_out
    on o_out.work_date = o_in.work_date and o_out.rn = o_in.rn + 1
  where o_in.rn % 2 = 1
),
migrated as (
  select work_date, sum(minutes)::int as punch_minutes
  from pairs
  group by work_date
)
select
  l.work_date,
  l.legacy_rows,
  l.legacy_minutes,
  coalesce(m.punch_minutes, 0) as punch_minutes,
  coalesce(m.punch_minutes, 0) - l.legacy_minutes as diff
from legacy l
left join migrated m using (work_date)
where coalesce(m.punch_minutes, 0) <> l.legacy_minutes
order by l.work_date;
