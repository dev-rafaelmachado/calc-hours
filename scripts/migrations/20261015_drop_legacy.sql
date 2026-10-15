-- Drops the tables of the removed Streamlit app. Their data lives in punches,
-- work_days and user_settings since 20261014_migrate_legacy.sql, and
-- 20261014_check_legacy_parity.sql came back empty.
--
-- Nothing references them (no foreign keys, views or functions). No CASCADE,
-- so the drop fails instead of taking anything else along. remuneration_config
-- also had RLS disabled with grants to anon, so it was readable and writable
-- with the public key; dropping it closes that.
--
-- public.users is the legacy login table, not auth.users.

begin;

drop table if exists public.time_entries;
drop table if exists public.users;
drop table if exists public.remuneration_config;

commit;
