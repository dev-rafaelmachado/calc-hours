alter table public.time_entries
  add column if not exists is_holiday boolean not null default false;

alter table public.time_entries
  add column if not exists work_mode text;

create index if not exists idx_time_entries_is_holiday
  on public.time_entries(is_holiday);
