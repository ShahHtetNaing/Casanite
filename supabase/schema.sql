-- =====================================================================
-- Casanite - Supabase schema
-- Paste this whole file into the Supabase SQL editor and run it.
-- Safe to re-run (idempotent). Seed data is inserted automatically the
-- first time the owner opens the dashboard (see public.bootstrap_owner).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- The only account allowed to read/write anything.
create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select coalesce(lower(auth.jwt() ->> 'email') = 'shahhtetnaing@gmail.com', false)
$$;

-- "Today" in the owner's timezone (streaks/day boundaries use this).
create or replace function public.app_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Singapore')::date
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$ begin
  create type public.item_kind as enum
    ('exercise', 'recovery', 'habit', 'hygiene', 'academic', 'goal', 'diet');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.item_frequency as enum
    ('daily', 'weekly', 'monthly', 'yearly', 'once');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- user_stats: Level / EXP / Streak (derived from completions)
-- ---------------------------------------------------------------------
create table if not exists public.user_stats (
  user_id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  level            integer not null default 1,
  exp              integer not null default 0,
  streak           integer not null default 0,
  longest_streak   integer not null default 0,
  last_active_date date,
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- health_logs: weight, BMI, blood pressure, heart rate
-- ---------------------------------------------------------------------
create table if not exists public.health_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  logged_at   timestamptz not null default now(),
  weight_kg   numeric(5, 2) check (weight_kg between 20 and 400),
  height_cm   numeric(5, 1) check (height_cm between 80 and 260),
  bmi         numeric(5, 2) generated always as (
                case when weight_kg is not null and height_cm is not null
                     then round(weight_kg / ((height_cm / 100) * (height_cm / 100)), 2)
                end
              ) stored,
  systolic    smallint check (systolic between 50 and 260),
  diastolic   smallint check (diastolic between 30 and 180),
  heart_rate  smallint check (heart_rate between 25 and 250),
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists health_logs_user_logged_idx on public.health_logs (user_id, logged_at desc);

-- ---------------------------------------------------------------------
-- routine_groups -> routines_and_goals -> completions
-- A group is a routine block (e.g. "Push & Chest", "Daily Habits",
-- "Yearly Goals"). Items inherit frequency/days from their group unless
-- they override them.
-- days_of_week uses 0 = Sunday ... 6 = Saturday; NULL = every day.
-- ---------------------------------------------------------------------
create table if not exists public.routine_groups (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null check (length(btrim(title)) > 0),
  description   text,
  kind          public.item_kind not null default 'habit',
  frequency     public.item_frequency not null default 'daily',
  days_of_week  smallint[] check (days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  color         text not null default 'cyan',
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists routine_groups_user_idx on public.routine_groups (user_id, sort_order);

create table if not exists public.routines_and_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id      uuid not null references public.routine_groups (id) on delete cascade,
  title         text not null check (length(btrim(title)) > 0),
  details       text,                       -- sets x reps / duration, e.g. "2x45s"
  youtube_url   text check (
                  youtube_url is null
                  or youtube_url ~* '^https?://([a-z0-9-]+\.)?(youtube\.com|youtu\.be)/'
                ),
  notes         text,
  frequency     public.item_frequency,      -- NULL = inherit from group
  days_of_week  smallint[] check (days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  target_count  integer not null default 1 check (target_count between 1 and 100),
  target_date   date,
  is_trackable  boolean not null default true,  -- false = reminder only (no EXP)
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists routines_and_goals_group_idx on public.routines_and_goals (group_id, sort_order);
create index if not exists routines_and_goals_user_idx on public.routines_and_goals (user_id);

create table if not exists public.completions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id       uuid references public.routines_and_goals (id) on delete set null, -- keep EXP if item deleted
  item_title    text not null,
  period_key    text not null,              -- 2026-10-29 | 2026-W44 | 2026-10 | 2026 | once
  completed_on  date not null default public.app_today(),
  exp_awarded   integer not null default 10,
  created_at    timestamptz not null default now()
);
create index if not exists completions_user_day_idx on public.completions (user_id, completed_on);
create index if not exists completions_item_period_idx on public.completions (item_id, period_key);

-- ---------------------------------------------------------------------
-- google_tokens: OAuth refresh token for Google Fit / Calendar
-- (Supabase does not persist provider tokens, so we store it here.)
-- ---------------------------------------------------------------------
create table if not exists public.google_tokens (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  refresh_token  text not null,
  scope          text,
  updated_at     timestamptz not null default now()
);

drop trigger if exists routine_groups_touch on public.routine_groups;
create trigger routine_groups_touch before update on public.routine_groups
  for each row execute function public.touch_updated_at();
drop trigger if exists routines_and_goals_touch on public.routines_and_goals;
create trigger routines_and_goals_touch before update on public.routines_and_goals
  for each row execute function public.touch_updated_at();
drop trigger if exists google_tokens_touch on public.google_tokens;
create trigger google_tokens_touch before update on public.google_tokens
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security: owner email only, and only their own rows
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['user_stats', 'health_logs', 'routine_groups',
                           'routines_and_goals', 'completions', 'google_tokens']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists owner_only on public.%I', t);
    execute format(
      'create policy owner_only on public.%I for all to authenticated
         using (user_id = auth.uid() and public.is_owner())
         with check (user_id = auth.uid() and public.is_owner())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Gamification RPCs (security invoker => RLS still applies)
-- ---------------------------------------------------------------------
create or replace function public.period_key_for(p_freq public.item_frequency, p_day date)
returns text
language sql
stable
as $$
  select case p_freq
    when 'daily'   then to_char(p_day, 'YYYY-MM-DD')
    when 'weekly'  then to_char(p_day, 'IYYY-"W"IW')
    when 'monthly' then to_char(p_day, 'YYYY-MM')
    when 'yearly'  then to_char(p_day, 'YYYY')
    else 'once'
  end
$$;

-- EXP = sum of completions (10 per task). Level = floor(EXP / 100) + 1.
-- Streak = consecutive days with >= 1 completion, ending today or
-- yesterday; missing a full day resets it to 0.
create or replace function public.recompute_user_stats()
returns public.user_stats
language plpgsql
as $$
declare
  v_uid     uuid := auth.uid();
  v_today   date := public.app_today();
  v_exp     integer;
  v_last    date;
  v_streak  integer;
  v_longest integer;
  v_row     public.user_stats;
begin
  if v_uid is null or not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(sum(exp_awarded), 0), max(completed_on)
    into v_exp, v_last
    from public.completions
   where user_id = v_uid;

  with days as (
    select distinct completed_on as d from public.completions where user_id = v_uid
  ), grouped as (
    select d, d - (row_number() over (order by d))::integer as grp from days
  ), runs as (
    select max(d) as end_day, count(*)::integer as len from grouped group by grp
  )
  select coalesce(max(len), 0),
         coalesce(max(len) filter (where end_day >= v_today - 1), 0)
    into v_longest, v_streak
    from runs;

  insert into public.user_stats as s
         (user_id, level, exp, streak, longest_streak, last_active_date, updated_at)
  values (v_uid, v_exp / 100 + 1, v_exp, v_streak, v_longest, v_last, now())
  on conflict (user_id) do update
     set level = excluded.level,
         exp = excluded.exp,
         streak = excluded.streak,
         longest_streak = excluded.longest_streak,
         last_active_date = excluded.last_active_date,
         updated_at = now()
  returning s.* into v_row;

  return v_row;
end;
$$;

create or replace function public._item_period(p_item uuid, out item_title text,
                                                out target integer, out trackable boolean,
                                                out period text)
language plpgsql
as $$
declare
  v_freq public.item_frequency;
begin
  select i.title, i.target_count, i.is_trackable, coalesce(i.frequency, g.frequency)
    into item_title, target, trackable, v_freq
    from public.routines_and_goals i
    join public.routine_groups g on g.id = i.group_id
   where i.id = p_item;
  if not found then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  period := public.period_key_for(v_freq, public.app_today());
end;
$$;

create or replace function public.complete_item(p_item uuid)
returns public.user_stats
language plpgsql
as $$
declare
  v record;
  v_count integer;
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_item::text));
  select * into v from public._item_period(p_item);
  if not v.trackable then
    raise exception 'item is reminder-only' using errcode = '22023';
  end if;
  select count(*) into v_count
    from public.completions
   where item_id = p_item and period_key = v.period;
  if v_count < v.target then
    insert into public.completions (item_id, item_title, period_key)
    values (p_item, v.item_title, v.period);
  end if;
  return public.recompute_user_stats();
end;
$$;

create or replace function public.uncomplete_item(p_item uuid)
returns public.user_stats
language plpgsql
as $$
declare
  v record;
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_item::text));
  select * into v from public._item_period(p_item);
  delete from public.completions
   where id = (select id from public.completions
                where item_id = p_item and period_key = v.period
                order by created_at desc
                limit 1);
  return public.recompute_user_stats();
end;
$$;

-- ---------------------------------------------------------------------
-- Seed: the default routine (runs once, when the owner has no groups)
-- ---------------------------------------------------------------------
create or replace function public._seed_group(p_title text, p_desc text, p_kind public.item_kind,
                                               p_freq public.item_frequency, p_days smallint[],
                                               p_color text, p_sort integer)
returns uuid
language sql
as $$
  insert into public.routine_groups (title, description, kind, frequency, days_of_week, color, sort_order)
  values (p_title, p_desc, p_kind, p_freq, p_days, p_color, p_sort)
  returning id
$$;

create or replace function public._seed_item(p_group uuid, p_sort integer, p_title text,
                                              p_details text default null, p_url text default null,
                                              p_notes text default null,
                                              p_freq public.item_frequency default null,
                                              p_days smallint[] default null,
                                              p_target integer default 1,
                                              p_target_date date default null,
                                              p_trackable boolean default true)
returns void
language sql
as $$
  insert into public.routines_and_goals
    (group_id, sort_order, title, details, youtube_url, notes, frequency, days_of_week,
     target_count, target_date, is_trackable)
  values (p_group, p_sort, p_title, p_details, p_url, p_notes, p_freq, p_days,
          p_target, p_target_date, p_trackable)
$$;

create or replace function public.seed_default_routine()
returns void
language plpgsql
as $$
declare
  g uuid;
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- 1. Morning Flexibility & Flip Prep (daily)
  g := public._seed_group('Morning Flexibility & Flip Prep', 'Daily mobility before anything else.',
                          'exercise', 'daily', null, 'cyan', 10);
  perform public._seed_item(g, 1, 'Puppy Pose (Thoracic Extension)', '2x45s');
  perform public._seed_item(g, 2, 'Doorframe Lat Stretch', '2x30s/side');
  perform public._seed_item(g, 3, 'Kneeling Wrist Flexion', '2x45s');
  perform public._seed_item(g, 4, 'Kneeling Hip Flexor Lunge', '2x45s/side');
  perform public._seed_item(g, 5, 'Seated Hamstring Fold', '2x45s');
  perform public._seed_item(g, 6, 'Butterfly Stretch', '2x45s');

  -- 2. 7-day rotating gym schedule
  g := public._seed_group('Push & Chest', 'Monday & Friday', 'exercise', 'daily', '{1,5}', 'fuchsia', 20);
  perform public._seed_item(g, 1, 'Incline Push-Ups', '4x8-10');
  perform public._seed_item(g, 2, 'Seated DB Shoulder Press', '3x8-10');
  perform public._seed_item(g, 3, 'Flat DB Bench Press', '3x8-10');
  perform public._seed_item(g, 4, 'Cable Lateral Raises', '3x12');
  perform public._seed_item(g, 5, 'Rope Tricep Pushdowns', '3x12');
  perform public._seed_item(g, 6, 'Hanging Knee Raises', '3x10-12');

  g := public._seed_group('Pull & Back', 'Tuesday & Saturday', 'exercise', 'daily', '{2,6}', 'violet', 30);
  perform public._seed_item(g, 1, 'Assisted Pull-Up', '4x8-10');
  perform public._seed_item(g, 2, 'Single-Arm DB Rows', '3x8-10/side');
  perform public._seed_item(g, 3, 'Inverted Rows', '3x10');
  perform public._seed_item(g, 4, 'Incline DB Curls', '3x10-12');
  perform public._seed_item(g, 5, 'DB Hammer Curls', '3x10-12');
  perform public._seed_item(g, 6, 'Face Pulls', '3x12-15');

  g := public._seed_group('Legs & Flips', 'Wednesday', 'exercise', 'daily', '{3}', 'lime', 40);
  perform public._seed_item(g, 1, 'Assisted Box Tuck Jumps', '4x5');
  perform public._seed_item(g, 2, 'DB Goblet Squats/Leg Press', '3x10-12');
  perform public._seed_item(g, 3, 'DB Walking Lunges', '3x10/leg');
  perform public._seed_item(g, 4, 'Seated Leg Curls', '3x12');
  perform public._seed_item(g, 5, 'Standing Machine Calf Raises', '3x15');
  perform public._seed_item(g, 6, 'Hollow Body Holds', '4x25s');
  perform public._seed_item(g, 7, 'Stomach Vacuums', '4x25s');

  g := public._seed_group('Cardio & Abs', 'Thursday', 'exercise', 'daily', '{4}', 'amber', 50);
  perform public._seed_item(g, 1, 'StairMaster & Elliptical', 'StairMaster 20-30m + Elliptical 20-30m');
  perform public._seed_item(g, 2, 'Forearm Plank', '3x30-45s');
  perform public._seed_item(g, 3, 'Russian Twists', '3x20');
  perform public._seed_item(g, 4, 'Bicycle Crunches', '3x20');

  g := public._seed_group('Active Recovery', 'Sunday', 'recovery', 'daily', '{0}', 'sky', 60);
  perform public._seed_item(g, 1, 'Swimming');
  perform public._seed_item(g, 2, 'Master class revision');
  perform public._seed_item(g, 3, 'Anime/Object sketching');

  -- 3. Diet rules (reminder widget, no EXP by default)
  g := public._seed_group('Diet Rules', 'Daily nutrition reminders.', 'diet', 'daily', null, 'emerald', 70);
  perform public._seed_item(g, 1, 'Light Breakfast', 'Fruit + Bread + 1 Boiled Egg', null,
    'Safe with milk: Mango, Avocado, Dates, Figs. Avoid with milk: Citrus, Berries, Melons.',
    p_trackable => false);
  perform public._seed_item(g, 2, 'Heavy Lunch', 'Protein, carb, veggies (Hawker Center)', p_trackable => false);
  perform public._seed_item(g, 3, 'Light Dinner', '2 Chapati/Dosa with protein & veg', p_trackable => false);

  -- 4. Daily habits & hygiene
  g := public._seed_group('Daily Habits', 'Mind & skills.', 'habit', 'daily', null, 'cyan', 80);
  perform public._seed_item(g, 1, 'Read 1 chapter');
  perform public._seed_item(g, 2, 'Practice Math');
  perform public._seed_item(g, 3, 'Start Arabic');
  perform public._seed_item(g, 4, 'Finish 1 TryHackMe');
  perform public._seed_item(g, 5, 'Finish 1 Duolingo');

  g := public._seed_group('Hygiene', 'Self-care.', 'hygiene', 'daily', null, 'sky', 90);
  perform public._seed_item(g, 1, 'Morning hygiene routine');
  perform public._seed_item(g, 2, 'Night hygiene routine');
  perform public._seed_item(g, 3, 'Laundry', '2 sessions a month', p_freq => 'monthly', p_target => 2);

  -- 5. Academic & goals
  g := public._seed_group('Academic (PhD)', 'Weekly PhD forum duties.', 'academic', 'weekly', null, 'violet', 100);
  perform public._seed_item(g, 1, 'Post a PhD discussion', 'Tuesdays', p_days => '{2}');
  perform public._seed_item(g, 2, 'Reply to 2 PhD posts', 'Fridays/Saturdays', p_days => '{5,6}');
  perform public._seed_item(g, 3, 'Finish lab', 'Fridays/Saturdays', p_days => '{5,6}');

  g := public._seed_group('Monthly Goals', null, 'goal', 'monthly', null, 'amber', 110);
  perform public._seed_item(g, 1, 'Finish 1 project');
  perform public._seed_item(g, 2, 'Post 1 video on LinkedIn/YouTube');

  g := public._seed_group('Yearly Goals', null, 'goal', 'once', null, 'rose', 120);
  perform public._seed_item(g, 1, 'PMP Certification', 'Year 1', p_target_date => (public.app_today() + interval '1 year')::date);
  perform public._seed_item(g, 2, 'Microsoft SC-200', 'Year 2', p_target_date => (public.app_today() + interval '2 years')::date);

  perform public._apply_exercise_guides();
end;
$$;

-- Called by the dashboard on every load: seeds on first run and refreshes
-- stats (so a missed day resets the streak even with no new activity).
create or replace function public.bootstrap_owner()
returns public.user_stats
language plpgsql
as $$
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.routine_groups where user_id = auth.uid()) then
    perform public.seed_default_routine();
  end if;
  return public.recompute_user_stats();
end;
$$;

-- Lock down function execution to signed-in users.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.recompute_user_stats()',
    'public._item_period(uuid)',
    'public.complete_item(uuid)',
    'public.uncomplete_item(uuid)',
    'public._seed_group(text, text, public.item_kind, public.item_frequency, smallint[], text, integer)',
    'public._seed_item(uuid, integer, text, text, text, text, public.item_frequency, smallint[], integer, date, boolean)',
    'public.seed_default_routine()',
    'public.bootstrap_owner()'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ===========================================================================
-- v2: Character Sheet (career profile) + Evolt body scans + AI suggestions
-- ===========================================================================

do $$ begin
  create type public.career_category as enum
    ('education', 'experience', 'certificate', 'volunteer', 'project', 'award');
exception when duplicate_object then null; end $$;

create table if not exists public.profile (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  full_name   text not null default '',
  birth_date  date,
  headline    text,
  location    text,
  hometown    text,
  website_url text,
  skills      text[] not null default '{}',
  goals_text  text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.career_entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category       public.career_category not null,
  title          text not null check (length(btrim(title)) > 0),
  organization   text,
  location       text,
  start_date     date,
  end_date       date,
  status         text not null default 'completed' check (status in ('completed', 'in_progress', 'planned')),
  description    text,
  url            text,
  source_item_id uuid unique references public.routines_and_goals (id) on delete set null,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists career_entries_user_cat on public.career_entries (user_id, category, sort_order);

-- Goals linked to a career category become career entries when completed.
alter table public.routines_and_goals
  add column if not exists career_category public.career_category;

create table if not exists public.evolt_scans (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scanned_at           timestamptz not null,
  pdf_path             text,
  weight_kg            numeric(5, 2),
  body_fat_pct         numeric(4, 1),
  body_fat_mass_kg     numeric(5, 2),
  skeletal_muscle_kg   numeric(5, 2),
  lean_body_mass_kg    numeric(5, 2),
  visceral_fat_level   smallint,
  bmr_kcal             integer,
  bio_age              smallint,
  bwi_score            numeric(3, 1),
  metrics              jsonb not null default '{}'::jsonb,
  analysis             jsonb,
  analyzed_at          timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists evolt_scans_user_time on public.evolt_scans (user_id, scanned_at);

create table if not exists public.ai_suggestions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scan_id          uuid references public.evolt_scans (id) on delete cascade,
  title            text not null check (length(btrim(title)) > 0),
  details          text,
  rationale        text,
  youtube_url      text,
  suggested_day    smallint check (suggested_day between 0 and 6),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  approved_item_id uuid references public.routines_and_goals (id) on delete set null,
  created_at       timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['profile', 'career_entries', 'evolt_scans'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I
                    for each row execute function public.touch_updated_at()', t, t);
  end loop;
  foreach t in array array['profile', 'career_entries', 'evolt_scans', 'ai_suggestions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists owner_only on public.%I', t);
    execute format('create policy owner_only on public.%I for all to authenticated
                    using (user_id = auth.uid() and public.is_owner())
                    with check (user_id = auth.uid() and public.is_owner())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Completing a career-linked goal records/updates the matching career entry.
create or replace function public.sync_career_from_completion()
returns trigger
language plpgsql
as $$
declare
  it public.routines_and_goals;
begin
  select * into it from public.routines_and_goals where id = new.item_id;
  if it.id is null or it.career_category is null then
    return new;
  end if;
  insert into public.career_entries (user_id, category, title, description, status, end_date, source_item_id)
  values (it.user_id, it.career_category, it.title, it.details, 'completed', public.app_today(), it.id)
  on conflict (source_item_id) do update
    set status = 'completed', end_date = public.app_today(), title = excluded.title;
  return new;
end;
$$;
drop trigger if exists completions_career_sync on public.completions;
create trigger completions_career_sync after insert on public.completions
  for each row execute function public.sync_career_from_completion();

-- Approving an AI suggestion writes it into the chosen routine group.
create or replace function public.approve_suggestion(p_suggestion uuid, p_group uuid)
returns uuid
language plpgsql
as $$
declare
  s public.ai_suggestions;
  g public.routine_groups;
  v_item uuid;
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into s from public.ai_suggestions where id = p_suggestion and user_id = auth.uid() for update;
  if s.id is null then raise exception 'suggestion not found'; end if;
  if s.status = 'approved' and s.approved_item_id is not null then return s.approved_item_id; end if;
  select * into g from public.routine_groups where id = p_group and user_id = auth.uid();
  if g.id is null then raise exception 'group not found'; end if;
  insert into public.routines_and_goals (group_id, title, details, youtube_url, guide_url, guide, notes, sort_order)
  values (g.id, s.title, s.details,
          case when s.youtube_url ~* '^https?://([a-z0-9-]+\.)?(youtube\.com|youtu\.be)/' then s.youtube_url end,
          s.guide_url, s.guide,
          'AI suggestion: ' || coalesce(s.rationale, ''),
          coalesce((select max(sort_order) + 1 from public.routines_and_goals where group_id = g.id), 0))
  returning id into v_item;
  update public.ai_suggestions set status = 'approved', approved_item_id = v_item where id = s.id;
  return v_item;
end;
$$;

-- Private storage bucket for Evolt PDFs; files live under "<auth.uid()>/...".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evolt-scans', 'evolt-scans', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare op text;
begin
  foreach op in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists "evolt owner %s" on storage.objects', op);
  end loop;
  execute $p$create policy "evolt owner select" on storage.objects for select to authenticated
    using (bucket_id = 'evolt-scans' and public.is_owner() and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy "evolt owner insert" on storage.objects for insert to authenticated
    with check (bucket_id = 'evolt-scans' and public.is_owner() and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy "evolt owner update" on storage.objects for update to authenticated
    using (bucket_id = 'evolt-scans' and public.is_owner() and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'evolt-scans' and public.is_owner() and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy "evolt owner delete" on storage.objects for delete to authenticated
    using (bucket_id = 'evolt-scans' and public.is_owner() and (storage.foldername(name))[1] = auth.uid()::text)$p$;
end $$;

-- Seed: profile + career (from personal website) + 2 baseline Evolt scans.
create or replace function public.seed_character()
returns void
language plpgsql
as $$
begin
  insert into public.profile (full_name, birth_date, headline, location, hometown, website_url, skills, goals_text)
  values ('Shah Htet Naing', '1999-08-20',
          'IT Network Analyst · Cybersecurity · PhD candidate (Information Security)',
          'Singapore', 'Yangon, Myanmar', 'https://mysite2024.s3.us-east-1.amazonaws.com/index.html',
          array['Network security', 'Firewalls / IDS / IPS', 'Fortinet', 'Active Directory', 'Microsoft Entra ID / M365',
                'HIPAA compliance', 'Wireshark', 'Nmap', 'Metasploit', 'Burp Suite', 'Nessus', 'Splunk', 'Kali Linux',
                'Digital forensics (Autopsy, CAINE)', 'VMware', 'SQL', 'Cloud computing', 'Web (HTML/CSS/JS)',
                'Next.js / Supabase', 'Public speaking', 'Leadership', 'CPR / First aid'],
          'Reach 145-150 lbs with calisthenics & flip strength; finish PhD and Master of IT (AI); grow in cybersecurity.')
  on conflict (user_id) do nothing;

  if exists (select 1 from public.career_entries where user_id = auth.uid()) then
    return;
  end if;

  insert into public.career_entries (category, title, organization, location, start_date, end_date, status, description, url, sort_order) values
  ('education', 'PhD in Information Technology (Digital Forensics)', 'University of the Cumberlands', 'Online', '2025-01-01', null, 'in_progress', 'Doctoral research focused on information security / digital forensics.', null, 0),
  ('education', 'Master of Information Technology (Artificial Intelligence)', 'James Cook University Singapore', 'Singapore', '2026-05-01', null, 'in_progress', 'JCU Merit Scholarship (SGD 20,000), two subject exemptions.', null, 1),
  ('education', 'Professional Certificate: Data Science and Machine Learning', 'MIT IDSS', 'Online', '2025-12-13', '2026-04-12', 'completed', 'Making Data Driven Decisions.', 'https://www.mygreatlearning.com/eportfolio/shah-htet-naing', 2),
  ('education', 'M.S. in Cybersecurity (GPA 3.89)', 'Webster University', 'St. Louis, Missouri', '2022-01-01', '2023-05-31', 'completed', 'Capstone: The effect of the IT sector on businesses. Coursework: law & policy, encryption, threat detection, intelligence/counter-intelligence.', null, 3),
  ('education', 'Graduate Certificate in Cybersecurity – Threat Detection', 'Webster University', 'St. Louis, Missouri', '2022-04-01', '2023-05-31', 'completed', null, null, 4),
  ('education', 'B.Sc. in Information Technology (2:1)', 'Teesside University', 'Middlesbrough, England', '2018-09-01', '2020-12-31', 'completed', 'Second Class Honours Division One.', null, 5),
  ('education', 'Information Technology Foundation Diploma', 'Management Development Institute of Singapore', 'Singapore', '2017-10-01', '2018-05-31', 'completed', null, null, 6),

  ('experience', 'Vice President of Peer Support – Student Council Exec Committee', 'James Cook University Singapore', 'Singapore', '2026-09-01', null, 'in_progress', 'Peer support strategy, student wellbeing, J.O.E.Y. Program, Global Community oversight.', null, 0),
  ('experience', 'ICT Systems Administrator & Technical Representative (Remote)', 'Grand Association of Technology and Education', 'Remote', '2024-08-01', null, 'in_progress', 'Technical support, ICT instruction, institutional representation and PR.', null, 1),
  ('experience', 'Event Team Member', 'Myanmar Student Community – JCU Singapore', 'Singapore', '2026-05-01', '2026-09-30', 'completed', 'Welcome Party, Club Showcase Day, cultural exchanges, hiking trips.', null, 2),
  ('experience', 'IT Network Analyst', 'Tribe513 | The Onyx Group', 'United States', '2023-09-01', '2025-11-30', 'completed', 'Hardened firewalls/switches/APs, HIPAA compliance, server-room architecture, SOPs and network baselines.', null, 3),
  ('experience', 'Student Building Manager & Lifeguard', 'Webster University', 'St. Louis, Missouri', '2022-04-01', '2023-05-31', 'completed', 'University Center operations; Employee of the Semester (Fall 2022).', null, 4),
  ('experience', 'Computer Technician & Computer Teacher', 'Grand Academy of Technology and Education', 'Yangon, Myanmar', '2015-06-01', '2022-12-31', 'completed', 'Network/printer configuration, hardware diagnostics, M365 admin, security awareness, ICT courses.', null, 5),
  ('experience', 'Customer Service Representative', 'American Center', 'Yangon, Myanmar', '2017-05-01', '2017-05-31', 'completed', null, null, 6),
  ('experience', 'Vice President (IT Club & Public Speaking Club)', 'American Center', 'Yangon, Myanmar', '2016-05-01', '2016-12-31', 'completed', 'Social media strategy and public speaking workshops.', null, 7),

  ('certificate', 'CompTIA Security+', 'CompTIA', null, null, null, 'completed', null, null, 0),
  ('certificate', 'Cambridge TKT Module 1', 'Cambridge', null, null, null, 'completed', null, null, 1),
  ('certificate', 'Cambridge TKT Module 2', 'Cambridge', null, null, null, 'completed', null, null, 2),
  ('certificate', 'Cambridge TKT Module 3', 'Cambridge', null, null, null, 'completed', null, null, 3),
  ('certificate', 'CS50', 'Harvard (edX)', null, null, null, 'completed', null, null, 4),
  ('certificate', 'MCSA', 'Microsoft', null, null, null, 'completed', null, null, 5),
  ('certificate', 'MCP', 'Microsoft', null, null, null, 'completed', null, null, 6),
  ('certificate', 'Microsoft Intune', 'Microsoft', null, null, null, 'completed', null, null, 7),
  ('certificate', 'TryHackMe', 'TryHackMe', null, null, null, 'completed', null, null, 8),
  ('certificate', 'Cisco – Cybersecurity', 'Cisco Networking Academy', null, null, null, 'completed', null, null, 9),
  ('certificate', 'Cisco – Hardware', 'Cisco Networking Academy', null, null, null, 'completed', null, null, 10),
  ('certificate', 'Network Defense Essentials (NDE)', 'EC-Council', null, null, null, 'completed', null, null, 11),
  ('certificate', 'SGSec', null, null, null, null, 'completed', 'Imported from website label – edit full name.', null, 12),
  ('certificate', 'CISM', null, null, null, null, 'completed', 'Imported from website label – verify status.', null, 13),
  ('certificate', 'AWS', 'Amazon Web Services', null, null, null, 'completed', 'Imported from website label – edit full name.', null, 14),
  ('certificate', 'Meta', 'Meta', null, null, null, 'completed', 'Imported from website label – edit full name.', null, 15),
  ('certificate', 'University of Glasgow', 'University of Glasgow', null, null, null, 'completed', 'Imported from website label – edit full name.', null, 16),

  ('volunteer', 'Student Volunteer – TR3 Orientation', 'James Cook University Singapore', 'Singapore', '2025-08-01', '2026-09-30', 'completed', 'Co-emceed onboarding for 500+ students; ICA coordination; icebreakers.', null, 0),
  ('volunteer', 'Student Volunteer – Graduation Ceremony', 'James Cook University Singapore', 'Marina Bay Sands', '2026-07-01', '2026-07-31', 'completed', null, null, 1),
  ('volunteer', 'Summer School Teacher', 'Grand Academy, Yangon', 'Yangon, Myanmar', '2017-03-01', '2017-05-31', 'completed', null, null, 2),
  ('volunteer', 'General Secretary', 'American Center', 'Yangon, Myanmar', '2015-11-01', '2016-05-31', 'completed', null, null, 3),
  ('volunteer', 'Volunteer of Education', 'American Center', 'Yangon, Myanmar', '2015-08-01', '2016-01-31', 'completed', null, null, 4),
  ('volunteer', 'Program Director', 'American Center', 'Yangon, Myanmar', '2015-07-01', '2015-10-31', 'completed', null, null, 5),

  ('project', 'Aether – AI admin desk for Singapore SMEs', 'Team PadaukCoders', null, null, '2026-01-01', 'completed', 'Invoice collection, grant tracking, compliance with rule-based AI agents. Next.js 15, Express, Supabase, Groq.', 'https://aether-eight-ecru.vercel.app/dashboard', 0),
  ('project', 'SHAHHUB Platform', null, null, null, null, 'completed', 'Modular hub of AI utilities, cybersecurity tools and study resources.', 'https://shahhubtools.base44.app/', 1),
  ('project', 'FortiGate Baseline Generator', null, null, null, null, 'completed', 'Project & automation.', null, 2),
  ('project', 'Network Health Monitor', null, null, null, null, 'completed', 'Project & automation.', null, 3),
  ('project', 'M365 Auto Update Error Fix', null, null, null, null, 'completed', 'Solution.', null, 4),
  ('project', 'Cloud Portfolio Website', null, null, null, null, 'completed', 'Static portfolio on AWS S3.', 'https://mysite2024.s3.us-east-1.amazonaws.com/index.html', 5),
  ('project', 'Active Directory Lab', null, null, null, null, 'completed', 'Lab.', null, 6),
  ('project', 'Casanite', null, null, null, null, 'in_progress', 'This gamified health & productivity tracker.', 'https://github.com/ShahHtetNaing/Casanite', 7),

  ('award', 'JCU Merit Academic Scholarship (SGD 20,000)', 'James Cook University Singapore', null, null, '2026-05-01', 'completed', null, null, 0),
  ('award', '2nd Place – 14th CEO Lounge Hackathon (Aether)', 'iD8 Lab, JCU Singapore', null, null, '2026-01-01', 'completed', null, null, 1),
  ('award', 'Employee of the Semester', 'Webster University Center', null, null, '2022-10-01', 'completed', null, null, 2);
end;
$$;

create or replace function public.seed_evolt_baseline()
returns void
language plpgsql
as $$
begin
  insert into public.evolt_scans (scanned_at, weight_kg, body_fat_pct, body_fat_mass_kg, skeletal_muscle_kg,
    lean_body_mass_kg, visceral_fat_level, bmr_kcal, bio_age, bwi_score, metrics, notes)
  values
  ('2026-08-13 05:56+08', 68.8, 16.7, 11.5, 31.9, 57.3, 6, 1607, 25, 8.2,
   '{"height_cm":175,"age":26,"protein_kg":12.0,"mineral_kg":4.1,"total_body_water_kg":41.2,"subcutaneous_fat_kg":10.1,"subcutaneous_fat_pct":14.7,"visceral_fat_kg":1.4,"visceral_fat_area_cm2":57,"icf_kg":27.4,"ecf_kg":13.8,"tee_kcal":2474,"abdominal_circumference_cm":80.8,"waist_hip_ratio":0.8,"segmental":{"left_arm":{"lean":3.15,"fat":0.63},"right_arm":{"lean":2.97,"fat":0.63},"torso":{"lean":24.60,"fat":6.45},"left_leg":{"lean":8.43,"fat":1.79},"right_leg":{"lean":8.75,"fat":1.79}}}',
   'Baseline scan #1'),
  ('2026-09-07 06:43+08', 69.5, 16.8, 11.7, 32.2, 57.8, 6, 1618, 26, 8.2,
   '{"height_cm":175,"age":27,"protein_kg":12.1,"mineral_kg":4.1,"total_body_water_kg":41.6,"subcutaneous_fat_kg":10.3,"subcutaneous_fat_pct":14.8,"visceral_fat_kg":1.4,"visceral_fat_area_cm2":57,"icf_kg":27.6,"ecf_kg":14.0,"tee_kcal":2491,"abdominal_circumference_cm":81,"waist_hip_ratio":0.8,"segmental":{"left_arm":{"lean":3.20,"fat":0.60},"right_arm":{"lean":3.06,"fat":0.54},"torso":{"lean":24.89,"fat":6.50},"left_leg":{"lean":8.43,"fat":1.78},"right_leg":{"lean":8.74,"fat":1.72}},"nutrition":{"calories":"2891-2991","protein_g":"217-224","carbs_g":"361-374","fat_g":"64-66","goal":"Muscle gain"}}',
   'Baseline scan #2')
  on conflict (user_id, scanned_at) do nothing;
end;
$$;

create or replace function public.bootstrap_extras()
returns void
language plpgsql
as $$
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform public.seed_character();
  if not exists (select 1 from public.evolt_scans where user_id = auth.uid()) then
    perform public.seed_evolt_baseline();
  end if;
  perform public.seed_nutrition();
  perform public.seed_recipes();
  insert into public.seed_flags (user_id, name) values (auth.uid(), 'ms_guides') on conflict do nothing;
  if found then
    perform public._apply_exercise_guides();
  end if;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sync_career_from_completion()',
    'public.approve_suggestion(uuid, uuid)',
    'public.seed_character()',
    'public.seed_evolt_baseline()',
    'public.bootstrap_extras()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- v3: Evolt scans feed the Health weight/BMI log (one linked row per scan).
-- ---------------------------------------------------------------------------
alter table public.health_logs
  add column if not exists evolt_scan_id uuid unique references public.evolt_scans (id) on delete cascade;

-- Scan-owned Health rows: one per scan, never adopts manual logs. Height comes from the
-- scan report (metrics.height_cm), else the latest logged height, else NULL (no BMI).
create or replace function public.sync_health_from_scan()
returns trigger
language plpgsql
as $$
declare
  v_height numeric;
begin
  if new.weight_kg is null then
    delete from public.health_logs where evolt_scan_id = new.id;
    return new;
  end if;

  -- Tolerate AI-written strings like "175 cm"; ignore anything outside the health_logs range.
  v_height := substring(new.metrics ->> 'height_cm' from '^\s*(\d{2,3}(?:\.\d+)?)')::numeric;
  if v_height is not null and (v_height < 80 or v_height > 260) then
    v_height := null;
  end if;

  if v_height is null then
    select height_cm into v_height from public.health_logs
     where user_id = new.user_id and height_cm is not null and evolt_scan_id is null
     order by logged_at desc limit 1;
  end if;

  insert into public.health_logs (user_id, logged_at, weight_kg, height_cm, notes, evolt_scan_id)
  values (new.user_id, new.scanned_at, new.weight_kg, v_height, 'Evolt body scan', new.id)
  on conflict (evolt_scan_id) do update
    set weight_kg = excluded.weight_kg,
        logged_at = excluded.logged_at,
        height_cm = excluded.height_cm;
  return new;
end;
$$;

drop trigger if exists evolt_scans_sync_health on public.evolt_scans;
create trigger evolt_scans_sync_health
  after insert or update of weight_kg, scanned_at, metrics on public.evolt_scans
  for each row execute function public.sync_health_from_scan();

-- Backfill existing scans (idempotent: upserts the same scan-owned rows).
update public.evolt_scans set weight_kg = weight_kg where weight_kg is not null;

-- =====================================================================
-- v4: Daily Tasks & Things to Buy (safe to re-run)
-- =====================================================================
create table if not exists public.checklist_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list       text not null check (list in ('tasks', 'shopping')),
  title      text not null check (length(btrim(title)) > 0),
  note       text,
  done       boolean not null default false,
  done_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists checklist_items_user_list on public.checklist_items (user_id, list, done, created_at);

drop trigger if exists checklist_items_touch on public.checklist_items;
create trigger checklist_items_touch before update on public.checklist_items
  for each row execute function public.touch_updated_at();

alter table public.checklist_items enable row level security;
alter table public.checklist_items force row level security;
drop policy if exists owner_only on public.checklist_items;
create policy owner_only on public.checklist_items for all to authenticated
  using (user_id = auth.uid() and public.is_owner())
  with check (user_id = auth.uid() and public.is_owner());
revoke all on public.checklist_items from anon;
grant select, insert, update, delete on public.checklist_items to authenticated;

-- =====================================================================
-- v5: Weekly Quest Report (AI journal) + diet check-ins (safe to re-run)
-- =====================================================================
create table if not exists public.weekly_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start  date not null,
  week_end    date not null,
  stats       jsonb not null,
  report      jsonb not null,
  source      text not null default 'manual' check (source in ('manual', 'scheduled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists public.diet_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id     uuid not null references public.routines_and_goals (id) on delete cascade,
  day         date not null default public.app_today(),
  followed    boolean not null,
  created_at  timestamptz not null default now(),
  unique (user_id, item_id, day)
);
create index if not exists diet_logs_user_day on public.diet_logs (user_id, day);

drop trigger if exists weekly_reports_touch on public.weekly_reports;
create trigger weekly_reports_touch before update on public.weekly_reports
  for each row execute function public.touch_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['weekly_reports', 'diet_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists owner_only on public.%I', t);
    execute format(
      'create policy owner_only on public.%I for all to authenticated
         using (user_id = auth.uid() and public.is_owner())
         with check (user_id = auth.uid() and public.is_owner())', t);
  end loop;
end $$;

-- EXP / streak as of a given day, so past-week reports don't use today's numbers.
-- Security invoker: RLS on completions still limits signed-in callers to their own rows.
create or replace function public.stats_as_of(p_user uuid, p_day date,
                                              out exp integer, out streak integer, out longest_streak integer)
language sql
stable
as $$
  with c as (
    select completed_on, exp_awarded from public.completions
     where user_id = p_user and completed_on <= p_day
  ), days as (
    select distinct completed_on as d from c
  ), runs as (
    select max(d) as end_day, count(*)::integer as len
      from (select d, d - (row_number() over (order by d))::integer as grp from days) g
     group by grp
  )
  select (select coalesce(sum(exp_awarded), 0)::integer from c),
         coalesce((select max(len) from runs where end_day >= p_day - 1), 0),
         coalesce((select max(len) from runs), 0);
$$;
revoke all on function public.stats_as_of(uuid, date) from public, anon;
grant execute on function public.stats_as_of(uuid, date) to authenticated, service_role;

-- =====================================================================
-- v6: Mind & Words (daily AI quote/word + saved ones) and Meals
--     (flexible meal log, insulin, supplements). Safe to re-run.
-- =====================================================================
create table if not exists public.daily_mind (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null default public.app_today(),
  quote       jsonb,
  word        jsonb,
  updated_at  timestamptz not null default now(),
  unique (user_id, day)
);

create table if not exists public.saved_quotes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote       text not null check (length(btrim(quote)) between 1 and 2000),
  author      text check (length(author) <= 200),
  breakdown   text check (length(breakdown) <= 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.saved_words (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word            text not null check (length(btrim(word)) between 1 and 100),
  part_of_speech  text check (length(part_of_speech) <= 50),
  definition      text check (length(definition) <= 2000),
  synonyms        text[] not null default '{}',
  examples        text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.meal_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day           date not null default public.app_today(),
  meal          text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  description   text not null check (length(btrim(description)) between 1 and 500),
  protein_g     numeric(6, 1) check (protein_g between 0 and 1000),
  carbs_g       numeric(6, 1) check (carbs_g between 0 and 1000),
  veg_servings  numeric(4, 1) check (veg_servings between 0 and 50),
  with_milk     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists meal_logs_user_day on public.meal_logs (user_id, day);

create table if not exists public.insulin_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null default public.app_today(),
  taken_at    timestamptz not null default now(),
  kind        text not null check (kind in ('lantus', 'prandial')),
  units       numeric(5, 1) not null check (units > 0 and units <= 100),
  meal        text check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  created_at  timestamptz not null default now()
);
create index if not exists insulin_logs_user_day on public.insulin_logs (user_id, day);
-- Lantus is once a day.
create unique index if not exists insulin_logs_one_lantus on public.insulin_logs (user_id, day) where kind = 'lantus';

create table if not exists public.supplements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 120),
  dose        text check (length(dose) <= 120),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.supplement_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  supplement_id  uuid not null references public.supplements (id) on delete cascade,
  day            date not null default public.app_today(),
  created_at     timestamptz not null default now(),
  unique (user_id, supplement_id, day)
);

create table if not exists public.nutrition_settings (
  user_id           uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  lantus_units      numeric(5, 1) not null default 24 check (lantus_units > 0 and lantus_units <= 100),
  prandial_units    numeric(5, 1) not null default 10 check (prandial_units > 0 and prandial_units <= 100),
  goal_lbs_min      numeric(5, 1) not null default 145 check (goal_lbs_min between 50 and 900),
  goal_lbs_max      numeric(5, 1) not null default 150 check (goal_lbs_max between 50 and 900),
  protein_g_target  numeric(6, 1) not null default 120 check (protein_g_target between 0 and 1000),
  carbs_g_target    numeric(6, 1) not null default 150 check (carbs_g_target between 0 and 1000),
  veg_target        numeric(4, 1) not null default 5 check (veg_target between 0 and 50),
  updated_at        timestamptz not null default now(),
  check (goal_lbs_min <= goal_lbs_max)
);

do $$
declare
  t text;
begin
  foreach t in array array['daily_mind', 'saved_quotes', 'saved_words', 'meal_logs', 'nutrition_settings']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I
                      for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['daily_mind', 'saved_quotes', 'saved_words', 'meal_logs', 'insulin_logs',
                           'supplements', 'supplement_logs', 'nutrition_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists owner_only on public.%I', t);
    execute format(
      'create policy owner_only on public.%I for all to authenticated
         using (user_id = auth.uid() and public.is_owner())
         with check (user_id = auth.uid() and public.is_owner())', t);
  end loop;
end $$;

-- First run only: default insulin/targets and the current supplements.
-- The settings row doubles as the "already seeded" marker, so deleted supplements stay deleted.
create or replace function public.seed_nutrition()
returns void
language plpgsql
as $$
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if exists (select 1 from public.nutrition_settings where user_id = auth.uid()) then
    return;
  end if;
  insert into public.nutrition_settings (user_id) values (auth.uid());
  insert into public.supplements (name, dose, sort_order) values
    ('Fish Oil', null, 1),
    ('Enervon-C', null, 2);
end;
$$;
revoke all on function public.seed_nutrition() from public, anon;
grant execute on function public.seed_nutrition() to authenticated;

-- =====================================================================
-- v7: Recipes (digital cookbook), photo-scanned meals, Muscle & Strength guides
-- =====================================================================

-- One row per (user, name) means "this one-time seed already ran", so deleted seed data stays deleted.
create table if not exists public.seed_flags (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, name)
);

create table if not exists public.recipes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category      text not null check (length(btrim(category)) between 1 and 60),
  name          text not null check (length(btrim(name)) between 1 and 120),
  ingredients   text[] not null default '{}' check (cardinality(ingredients) <= 60),
  instructions  text[] not null default '{}' check (cardinality(instructions) <= 60),
  notes         text check (length(notes) <= 2000),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists recipes_user_idx on public.recipes (user_id, category, sort_order);

alter table public.meal_logs add column if not exists calories_kcal numeric(6, 0) check (calories_kcal between 0 and 10000);
alter table public.meal_logs add column if not exists fiber_g numeric(6, 1) check (fiber_g between 0 and 1000);
alter table public.meal_logs add column if not exists micronutrients text[];
alter table public.meal_logs add column if not exists items jsonb;
alter table public.meal_logs add column if not exists source text not null default 'manual' check (source in ('manual', 'photo'));

-- Exercise form guides from muscleandstrength.com: link + { target, secondary[], equipment, cues[], tip }.
alter table public.routines_and_goals add column if not exists guide_url text
  check (guide_url is null or guide_url ~* '^https://www\.muscleandstrength\.com/exercises/[a-z0-9-]+\.html$');
alter table public.routines_and_goals add column if not exists guide jsonb;
alter table public.ai_suggestions add column if not exists guide_url text
  check (guide_url is null or guide_url ~* '^https://www\.muscleandstrength\.com/exercises/[a-z0-9-]+\.html$');
alter table public.ai_suggestions add column if not exists guide jsonb;

do $$
declare
  t text;
begin
  drop trigger if exists recipes_touch on public.recipes;
  create trigger recipes_touch before update on public.recipes
    for each row execute function public.touch_updated_at();
  foreach t in array array['seed_flags', 'recipes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists owner_only on public.%I', t);
    execute format(
      'create policy owner_only on public.%I for all to authenticated
         using (user_id = auth.uid() and public.is_owner())
         with check (user_id = auth.uid() and public.is_owner())', t);
  end loop;
end $$;

create or replace function public._seed_recipe(p_sort integer, p_category text, p_name text,
                                               p_ingredients text[], p_steps text[])
returns void
language sql
as $$
  insert into public.recipes (sort_order, category, name, ingredients, instructions)
  values (p_sort, p_category, p_name, p_ingredients, p_steps)
$$;

-- First run only: the owner's recipe collection.
create or replace function public.seed_recipes()
returns void
language plpgsql
as $$
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into public.seed_flags (user_id, name) values (auth.uid(), 'recipes') on conflict do nothing;
  if not found then
    return;
  end if;

  perform public._seed_recipe(1, 'Soups', 'Chinese/Myanmar Clear Soup',
    array['Water', '1 clove white garlic', 'Agamoto seasoning (MSG)', 'Salt', 'Black pepper',
          'Choice of veg (pear, tofu, Chinese radish, cabbage, spring onion) or chicken bones',
          'No potatoes, peas or tomato'],
    array['Boil water.', 'Add garlic, vegetables/bones, salt, pepper and MSG.', 'Simmer until cooked.']);
  perform public._seed_recipe(2, 'Soups', 'Basic Egg Drop Soup (Microwave)',
    array['1 cup water', '1 egg', '1/2 tsp cornstarch', 'Chopped green onion', 'Pinch of salt, pepper and MSG'],
    array['Dissolve cornstarch in 1 tbsp cold water.', 'Add remaining water and seasoning.',
          'Microwave 2-3 mins until boiling.', 'Beat egg.',
          'Stir boiling broth in a circle and slowly pour in egg to create ribbons.', 'Top with green onion.']);

  perform public._seed_recipe(1, 'Rice & Noodles', 'Coconut Rice',
    array['Rice', 'Coconut cream water', 'Salt', 'Onion', 'Butter'],
    array['Use a rice 2 : water 3 ratio, replacing water with coconut cream water.',
          'Mix rice, salt, sliced onion and butter with the liquid.', 'Cook until done.']);
  perform public._seed_recipe(2, 'Rice & Noodles', 'Small Yellow Lentils Rice',
    array['1 cup mix (half rice, half small yellow lentils)', '1 tsp turmeric', '1 tsp salt', 'Ginger', '1 bay leaf',
          '1/2 tsp cinnamon', '5 peppercorns', '3 cloves', '1 spoon oil', '1 spoon butter'],
    array['Wash rice/lentils.', 'Add all spices, oil and butter.', 'Mix well and cook.']);
  perform public._seed_recipe(3, 'Rice & Noodles', 'Coconut Noodle Soup',
    array['Chickpea powder', '2 cups water', 'Half can coconut cream', 'Turmeric', 'Chicken bones (optional)'],
    array['Mix chickpea powder with water.', 'Add coconut cream and turmeric.',
          'Bring to a boil on the stove, add chicken bones if desired, then lower heat.']);
  perform public._seed_recipe(4, 'Rice & Noodles', 'Noyar Pad Thai',
    array['Garlic', 'Onion', 'Chicken sauce', 'Chili sauce', 'Prawns', 'Vegetables', 'Oyster sauce',
          'Dark/light soy sauce', 'MSG', 'Noodles', 'Eggs', 'Crushed peanuts', 'Lemon slice'],
    array['Fry garlic and onion.', 'Add sauces and prawns, fry briefly.',
          'Add veg, a little water, soy sauces and MSG.', 'Add noodles and mix.',
          'Push aside, crack egg, mix into noodles.', 'Top with peanuts and lemon.']);

  perform public._seed_recipe(1, 'Curries', 'Burmese Style Chicken Curry',
    array['Chicken', 'Oil', 'Onion', '1/2 spoon chili powder', '1 tsp sugar', '<1/2 spoon turmeric', '1 tsp MSG',
          'Pinch salt', 'Clover/bay leaves', 'Boiled eggs'],
    array['Fry onions.', 'Add chicken mixed with chili powder, sugar, turmeric and MSG.', 'Add salt and leaves. Cook.',
          'Separately cook another batch of chicken with oil, chili and ginger.',
          'Combine both with boiled eggs and extra onions.']);
  perform public._seed_recipe(2, 'Curries', 'Indian Style Chicken Curry',
    array['Chicken (optional yogurt marinade)', 'Oil', 'Sliced onions', 'Garlic', 'Ginger', '1/2 spoon chili powder',
          '<1/2 spoon turmeric', '1 spoon garam masala', 'Water', 'Salt', 'MSG', 'Clover leaves'],
    array['Heat oil.', 'Add chicken mixed with spices, garlic and ginger.',
          'Add onions, water (just enough to cover), salt, MSG and leaves.', 'Cook until tender.']);
  perform public._seed_recipe(3, 'Curries', 'Fried Egg Curry',
    array['Eggs', 'Oil', 'Chopped onion', 'Chopped tomatoes', 'Water', 'Chili powder', 'Turmeric', 'Tamarind paste', 'MSG'],
    array['Fry eggs in low oil and set aside.', 'Fry onions until pale yellow.',
          'Add tomatoes and water, cover and cook into a paste.', 'Add spices, tamarind and MSG.',
          'Add eggs and flip gently.']);
  perform public._seed_recipe(4, 'Curries', 'India Dal Curry',
    array['Dal (washed/soaked)', 'Ginger', 'Garlic', 'Tomato', 'Onion', '1 spoon oil', 'Turmeric', 'Chili powder',
          '1 spoon garam masala', 'Water', 'MSG', 'Salt'],
    array['Heat oil, cook onions golden.', 'Add garlic, ginger, tomatoes and spices.', 'Add water and cook.',
          'Add soaked dal and fresh water. Cook 30 mins.', 'Transfer to rice cooker until dal breaks apart.',
          'Add MSG and salt.']);
  perform public._seed_recipe(5, 'Curries', 'Red Lentils Curry',
    array['Red lentils', 'Water', 'Chopped onions', 'Ginger', 'Tip of tsp MSG', '1 tsp salt', '1/2 tsp butter',
          'Crispy fried onions'],
    array['Rinse lentils, place in rice cooker with water, onions and ginger.',
          'Watch closely while boiling to prevent overflow.',
          'Once soft, add MSG, salt, butter and crispy onions.']);
  perform public._seed_recipe(6, 'Curries', 'Spiced Yogurt & Chickpea Curry (Kadhi)',
    array['2 tbsp chickpea powder', 'Water', 'Butter', 'Pinch cumin', 'Yogurt', 'Fresh mint', 'Fresh green chilies',
          'Garlic', 'Salt'],
    array['Dissolve chickpea powder in water.', 'Heat butter and cumin.', 'Add chickpea mixture.',
          'Simmer, then add pounded paste of mint, chili and garlic.', 'Stir in yogurt and salt.',
          'Bring to a boil and serve.']);
  perform public._seed_recipe(7, 'Curries', 'Ramadan Egg Chicken & Biryani Base',
    array['Onions', 'Ginger', 'Garlic', 'Turmeric (for Ramadan version)', 'Yogurt (for Biryani version)',
          'Garam/biryani masala', 'Salt', 'MSG', 'Chicken', 'Soaked raisins', 'Cashews'],
    array['Fry onions and remove most.', 'Mix ginger, garlic, spices, salt and MSG.',
          'Add 2 spoons water and cook chicken.', 'Add raisins, cashews and the fried onions back.']);

  perform public._seed_recipe(1, 'Egg & Sardine', 'Sardine Egg Recipe',
    array['1/2 chopped onion', 'Oil', '1/2 tsp turmeric', '2 spoons chili powder', 'Canned sardines (liquid separated)',
          'Eggs', 'Salt', 'MSG'],
    array['Fry onions pale yellow.', 'Add turmeric and chili powder.', 'Pour in sardine liquid, drop in eggs.',
          'Add salt and MSG.', 'Add sardines, stir gently, boil and serve.']);

  perform public._seed_recipe(1, 'Salads & Veg', 'Rice Salad (Amon)',
    array['Oil', 'Chopped onions', 'Peanut crisps', 'Shrimp crisps', 'Chili sauce', 'Cooked rice'],
    array['Fry onions and reserve the oil.', 'Make a paste with onions, crisps and chili sauce.',
          'Mix until crunchy.', 'Add rice.', 'Top with 1 tbsp of the reserved infused oil.']);
  perform public._seed_recipe(2, 'Salads & Veg', 'Basic Leaf Salad',
    array['Leafy greens', 'Onion', 'Chili sauce', 'Cooked onion oil', 'Chickpea powder/peanuts', 'Shrimp powder'],
    array['Toss all ingredients together.']);
  perform public._seed_recipe(3, 'Salads & Veg', 'Indian Way (Vegetables)',
    array['Peas/carrots', 'Red onions', 'Oil', 'Turmeric', 'Water', 'Salt', 'MSG'],
    array['Heat oil, add onions, veg and turmeric.', 'Add water, cover and cook until soft.', 'Season.']);
  perform public._seed_recipe(4, 'Salads & Veg', 'Chinese Way (Stir-Fried Greens)',
    array['Watercress/bok choy/spinach', 'Garlic', 'Oil', 'Oyster sauce', 'Soy sauce', 'Cornstarch water'],
    array['Fry garlic in oil.', 'Add greens.', 'Add sauces.', 'Thicken with cornstarch water.']);

  perform public._seed_recipe(1, 'Desserts', 'Samine Recipe',
    array['Milk', 'Sugar', 'Butter', 'Pinch of salt', 'Samine'],
    array['Boil milk.', 'Add sugar, butter and salt.', 'Boil again, add Samine.',
          'Wait max 2 minutes (adjust based on brand).', 'Remove from heat to cool.']);
end;
$$;

-- Muscle & Strength form guides for the baseline routine (cues summarised, full guide at the link).
-- Exercises without an M&S page keep a guide but no link. YouTube links on these items are dropped.
create or replace function public._apply_exercise_guides()
returns void
language sql
as $$
  with g(title, slug, guide) as (values
    ('puppy pose (thoracic extension)', null, '{"target":"Upper back, lats","secondary":["Shoulders"],"equipment":"Bodyweight","cues":["Start on all fours, walk your hands forward and keep hips stacked over knees.","Melt your chest toward the floor and let your upper back extend.","Breathe slowly; keep arms long and active."],"tip":"Stop short of any pinching in the shoulders or low back."}'),
    ('doorframe lat stretch', null, '{"target":"Lats","secondary":["Shoulders","Obliques"],"equipment":"Doorframe","cues":["Grip the frame at head height with one hand.","Sit your hips back and away to lengthen the side of your trunk.","Breathe into the stretched side, then switch."],"tip":"Keep ribs down so the stretch stays in the lat, not the low back."}'),
    ('kneeling wrist flexion', null, '{"target":"Forearms, wrists","secondary":[],"equipment":"Bodyweight","cues":["Kneel with palms down and fingers pointing toward your knees.","Shift weight back gently until you feel the forearms stretch.","Keep elbows straight and pressure light."],"tip":"Useful prep for handstands and flips; never force the end range."}'),
    ('kneeling hip flexor lunge', null, '{"target":"Hip flexors","secondary":["Quads"],"equipment":"Bodyweight","cues":["Half-kneel with the front knee over the ankle.","Tuck your pelvis and squeeze the back-leg glute.","Shift forward slightly until the front of the back hip stretches."],"tip":"Squeezing the glute matters more than leaning far forward."}'),
    ('seated hamstring fold', null, '{"target":"Hamstrings","secondary":["Lower back","Calves"],"equipment":"Bodyweight","cues":["Sit tall with legs straight and toes up.","Hinge from the hips, reaching toward your feet.","Keep the back long rather than rounding to go deeper."],"tip":"Bend the knees slightly if the stretch is felt behind the knee."}'),
    ('butterfly stretch', null, '{"target":"Adductors","secondary":["Hips"],"equipment":"Bodyweight","cues":["Sit with soles together and heels close to the body.","Sit tall and let the knees drop toward the floor.","Lean forward from the hips for more stretch."],"tip":"Press knees down with elbows only gently."}'),
    ('incline push-ups', 'incline-push-ups', '{"target":"Chest","secondary":["Shoulders","Triceps","Abs"],"equipment":"Bodyweight","cues":["Hands on a bench, body in one straight line from head to heels.","Lower with control until your chest reaches the bench.","Press the bench away to straighten the arms."],"tip":"Elbows at roughly 45 degrees (an arrow shape, not a T); brace like a moving plank."}'),
    ('seated db shoulder press', 'seated-dumbbell-press', '{"target":"Shoulders","secondary":["Triceps","Traps"],"equipment":"Dumbbell","cues":["Bench upright; kick the dumbbells up from your knees one at a time.","Press overhead, finishing with the biceps near the ears.","Lower slowly to about shoulder height."],"tip":"Keep your back on the pad and head neutral; exhale as you press."}'),
    ('flat db bench press', 'dumbbell-bench-press', '{"target":"Chest","secondary":["Shoulders","Triceps"],"equipment":"Dumbbell","cues":["Lie flat with shoulder blades pulled back and down.","Lower the dumbbells to the sides of your chest with elbows tucked slightly.","Press up and slightly in until arms are straight."],"tip":"Keep feet planted and the upper back tight throughout."}'),
    ('cable lateral raises', 'one-arm-cable-lateral-raise', '{"target":"Shoulders","secondary":["Traps"],"equipment":"Cable","cues":["Stand side-on to a low pulley and take the handle across your body.","Raise the arm out to the side to shoulder height with a soft elbow.","Lower slowly against the cable."],"tip":"Lead with the elbow and avoid shrugging."}'),
    ('rope tricep pushdowns', 'rope-tricep-extension', '{"target":"Triceps","secondary":[],"equipment":"Cable","cues":["Grip the rope with elbows pinned to your sides.","Push down until the arms are straight, spreading the rope ends apart.","Return slowly until forearms are just above parallel."],"tip":"Only the forearms should move; no leaning or swinging."}'),
    ('hanging knee raises', 'hanging-knee-raise', '{"target":"Abs","secondary":["Forearms"],"equipment":"Bodyweight","cues":["Hang from the bar with shoulders engaged.","Curl the knees toward the chest while tilting the pelvis up.","Lower with control without swinging."],"tip":"Think about curling the hips, not just lifting the knees."}'),
    ('assisted pull-up', 'close-grip-pull-up', '{"target":"Lats","secondary":["Biceps","Upper back","Abs"],"equipment":"Assisted machine / band","cues":["Shoulder-width overhand grip; brace abs and squeeze glutes.","Pull the shoulder blades down, then drive the elbows toward the floor.","Bring your chin to the bar and lower slowly to full hang."],"tip":"Use less assistance over time; keep the head neutral."}'),
    ('single-arm db rows', 'one-arm-dumbbell-row', '{"target":"Upper back","secondary":["Lats","Biceps","Shoulders"],"equipment":"Dumbbell","cues":["Support one hand and knee on a bench, back flat.","Row the dumbbell toward your hip, leading with the elbow.","Lower until the arm is straight and the shoulder stretches."],"tip":"Do not rotate the torso to move more weight."}'),
    ('inverted rows', 'high-inverted-row', '{"target":"Upper back","secondary":["Lats","Biceps"],"equipment":"Bodyweight (bar or Smith machine)","cues":["Hang under a bar with body straight and heels on the floor.","Pull your chest to the bar, squeezing the shoulder blades together.","Lower under control to straight arms."],"tip":"Lower the bar or raise your feet to make it harder."}'),
    ('incline db curls', 'incline-dumbbell-curl', '{"target":"Biceps","secondary":["Forearms"],"equipment":"Dumbbell","cues":["Sit back on an incline bench with arms hanging straight down.","Curl up keeping the upper arms still.","Lower fully for a deep stretch."],"tip":"Lighter weight than standing curls; avoid swinging the shoulders forward."}'),
    ('db hammer curls', 'standing-hammer-curl', '{"target":"Biceps","secondary":["Forearms"],"equipment":"Dumbbell","cues":["Stand tall holding dumbbells with palms facing each other.","Curl up keeping elbows at your sides.","Lower slowly to full extension."],"tip":"Keep the neutral grip the whole rep to hit the brachialis and forearms."}'),
    ('face pulls', null, '{"target":"Rear delts","secondary":["Upper back","Rotator cuff"],"equipment":"Cable + rope","cues":["Set the rope at upper-chest to face height.","Pull toward your face, splitting the rope and pointing elbows out.","Finish with hands beside the ears, then return slowly."],"tip":"Light weight, slow reps; good for posture and shoulder health."}'),
    ('assisted box tuck jumps', null, '{"target":"Quads, glutes","secondary":["Calves","Hip flexors","Abs"],"equipment":"Box / bodyweight","cues":["Dip quickly and swing the arms to jump.","Pull the knees up toward the chest at the top.","Land softly on the balls of the feet with knees bent."],"tip":"Quality over quantity: stop the set when landings get loud."}'),
    ('db goblet squats/leg press', '45-degree-leg-press', '{"target":"Quads","secondary":["Glutes","Hamstrings","Adductors"],"equipment":"Dumbbell or leg press","cues":["Leg press: feet shoulder-width on the sled.","Lower until knees reach about 90 degrees without the hips rolling off the pad.","Push back up, stopping just short of locking the knees."],"tip":"Goblet squat: hold the dumbbell at the chest, sit between the heels, chest up."}'),
    ('db walking lunges', 'dumbbell-walking-lunge', '{"target":"Quads","secondary":["Glutes","Hamstrings","Adductors","Calves"],"equipment":"Dumbbell","cues":["Hold a dumbbell in each hand, feet hip-width.","Step forward and drop the back knee toward the floor.","Drive through the front foot to stand and step into the next rep."],"tip":"Master bodyweight lunges first; keep the torso upright."}'),
    ('seated leg curls', 'leg-curl', '{"target":"Hamstrings","secondary":[],"equipment":"Machine","cues":["Set the pad just above the ankles.","Curl the heels toward the glutes and pause briefly.","Return slowly to almost straight legs."],"tip":"Slow lowering does most of the work; exhale on the curl."}'),
    ('standing machine calf raises', 'standing-calf-raise', '{"target":"Calves","secondary":[],"equipment":"Machine / barbell","cues":["Balls of the feet on the edge of the platform.","Rise as high as possible and squeeze.","Lower the heels slowly into a full stretch."],"tip":"No bouncing; pause at the top and bottom."}'),
    ('hollow body holds', null, '{"target":"Abs","secondary":["Hip flexors"],"equipment":"Bodyweight","cues":["Lie on your back and press the low back into the floor.","Lift shoulders and legs, arms reaching overhead.","Hold a shallow banana shape and breathe."],"tip":"Bend the knees if your low back lifts off the floor. Key for flips."}'),
    ('stomach vacuums', null, '{"target":"Transverse abdominis","secondary":[],"equipment":"Bodyweight","cues":["Exhale fully.","Draw the belly button in toward the spine and hold.","Breathe shallowly through the hold, then release."],"tip":"Best on an empty stomach; build up hold time gradually."}'),
    ('stairmaster & elliptical', null, '{"target":"Cardio","secondary":["Quads","Glutes","Calves"],"equipment":"Machine","cues":["Stand tall without leaning on the rails.","Keep a steady pace you can hold for the full time.","Push through the whole foot."],"tip":"Hands-free on the StairMaster burns more and builds balance."}'),
    ('forearm plank', 'hover', '{"target":"Abs","secondary":["Lower back"],"equipment":"Bodyweight","cues":["Forearms down, elbows under shoulders, feet hip-width.","Lift into one straight line from head to heels.","Brace the core and squeeze the glutes so hips do not sag."],"tip":"Look at the floor; stop the set when form breaks."}'),
    ('russian twists', 'russian-twist', '{"target":"Abs","secondary":["Obliques"],"equipment":"Bodyweight","cues":["Sit with knees bent and lean back slightly.","Rotate the torso to one side, then the other.","Keep the chest up and move with control."],"tip":"Lift your feet or hold a weight to make it harder."}'),
    ('bicycle crunches', 'abdominal-air-bike', '{"target":"Abs","secondary":["Obliques"],"equipment":"Bodyweight","cues":["Lie on your back, shoulders off the floor.","Bring one knee in while turning the opposite elbow toward it.","Alternate sides slowly while the other leg stays extended."],"tip":"Exhale hard on each twist; do not pull on your neck."}')
  )
  update public.routines_and_goals r
     set guide_url = case when g.slug is null then null
                          else 'https://www.muscleandstrength.com/exercises/' || g.slug || '.html' end,
         guide = g.guide::jsonb,
         -- only drop the exact video the seed gave this exercise; keep links the owner set
         youtube_url = case when (g.title, r.youtube_url) in (
           values
             ('puppy pose (thoracic extension)', 'https://www.youtube.com/watch?v=tR2UYHTTv5U'),
             ('doorframe lat stretch', 'https://www.youtube.com/watch?v=8b5n4wR_uEQ'),
             ('kneeling wrist flexion', 'https://www.youtube.com/watch?v=5OWbZ9Oxz0E'),
             ('kneeling hip flexor lunge', 'https://www.youtube.com/watch?v=2PNT-FFKLgY'),
             ('seated hamstring fold', 'https://www.youtube.com/watch?v=kYv_8wZzG9E'),
             ('butterfly stretch', 'https://www.youtube.com/watch?v=4yO3Jk5U3X4'),
             ('incline push-ups', 'https://www.youtube.com/watch?v=NEdo_I3OuVk'),
             ('seated db shoulder press', 'https://www.youtube.com/watch?v=qEwKCR5JCog'),
             ('cable lateral raises', 'https://www.youtube.com/watch?v=f_OGBg2KxgY'),
             ('rope tricep pushdowns', 'https://www.youtube.com/watch?v=1FjkhpZsaxc'),
             ('hanging knee raises', 'https://www.youtube.com/watch?v=X-ACS9vpRyU'),
             ('assisted pull-up', 'https://www.youtube.com/watch?v=gx0RWT7WbmA'),
             ('single-arm db rows', 'https://www.youtube.com/watch?v=pYcpY20QaE8'),
             ('inverted rows', 'https://www.youtube.com/watch?v=hXTc1mDnZCw'),
             ('incline db curls', 'https://www.youtube.com/watch?v=soxrZlIl35U'),
             ('face pulls', 'https://www.youtube.com/watch?v=sHSY0Ao8QHs'),
             ('assisted box tuck jumps', 'https://www.youtube.com/watch?v=HJZh-12p6vg'),
             ('db goblet squats/leg press', 'https://www.youtube.com/watch?v=lRYBbchqxtI'),
             ('db walking lunges', 'https://www.youtube.com/watch?v=D7KaRcUTQeE'),
             ('hollow body holds', 'https://www.youtube.com/watch?v=NtfYZt4vlrI'),
             ('stomach vacuums', 'https://www.youtube.com/watch?v=cub3xhJXsAA'),
             ('forearm plank', 'https://www.youtube.com/watch?v=ASdvN_XEl_c'),
             ('russian twists', 'https://www.youtube.com/watch?v=-BzNffL_6YE'),
             ('bicycle crunches', 'https://www.youtube.com/watch?v=9FGilxCvn08')
         ) then null else r.youtube_url end
    from g
   where lower(btrim(r.title)) = g.title
     and r.guide is null
     and r.user_id = auth.uid();
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public._seed_recipe(integer, text, text, text[], text[])',
    'public.seed_recipes()',
    'public._apply_exercise_guides()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- v8: Workout sessions reuse the existing routine groups and items. A
-- snapshot of the exercise name keeps dated sessions intelligible after edits.
alter table public.routines_and_goals add column if not exists workout_template jsonb;
alter table public.routines_and_goals add column if not exists workout_rest_seconds integer default 90
  check (workout_rest_seconds between 30 and 600);

create or replace function public.valid_workout_sets(p_sets jsonb)
returns boolean language plpgsql immutable as $$
declare v jsonb; k text; n numeric;
begin
  if p_sets is null or jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) not between 1 and 12 then
    return false;
  end if;
  for v in select value from jsonb_array_elements(p_sets) loop
    if jsonb_typeof(v) <> 'object' or jsonb_typeof(v->'completed') <> 'boolean' then return false; end if;
    foreach k in array array['kg', 'reps', 'seconds'] loop
      if v ? k and jsonb_typeof(v->k) not in ('null', 'number') then return false; end if;
      if jsonb_typeof(v->k) = 'number' then
        n := (v->>k)::numeric;
        if n < 0 or (k = 'kg' and (n > 1000 or n * 4 <> trunc(n * 4)))
          or (k = 'reps' and (n > 500 or n <> trunc(n)))
          or (k = 'seconds' and (n > 36000 or n <> trunc(n))) then return false; end if;
      end if;
    end loop;
    if v->>'completed' = 'true' and coalesce((v->>'reps')::integer, 0) = 0
       and coalesce((v->>'seconds')::integer, 0) = 0 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

alter table public.routines_and_goals drop constraint if exists routines_workout_template_valid;
alter table public.routines_and_goals add constraint routines_workout_template_valid
  check (workout_template is null or public.valid_workout_sets(workout_template));

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id uuid references public.routines_and_goals(id) on delete set null,
  exercise_name text not null check (length(btrim(exercise_name)) between 1 and 150),
  day date not null default public.app_today() check (day <= public.app_today()),
  sets jsonb not null check (public.valid_workout_sets(sets)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_id, day)
);
create index if not exists workout_sessions_user_day on public.workout_sessions(user_id, day desc);
create index if not exists workout_sessions_previous on public.workout_sessions(user_id, item_id, day desc);

create or replace function public.workout_previous(p_day date)
returns setof public.workout_sessions language sql stable as $$
  select distinct on (s.item_id) s.* from public.workout_sessions s
  where s.user_id = auth.uid() and public.is_owner() and s.item_id is not null and s.day < p_day
  order by s.item_id, s.day desc
$$;

create or replace function public.workout_session_item_guard()
returns trigger language plpgsql as $$
begin
  if new.item_id is null or not exists (
    select 1 from public.routines_and_goals i
    join public.routine_groups g on g.id = i.group_id
    where i.id = new.item_id and i.user_id = new.user_id and g.user_id = new.user_id
      and g.kind = 'exercise' and i.is_active and g.is_active
  ) then raise exception 'active workout exercise required' using errcode = '23514'; end if;
  new.exercise_name := (select title from public.routines_and_goals where id = new.item_id);
  return new;
end;
$$;
drop trigger if exists workout_session_item_guard on public.workout_sessions;
create trigger workout_session_item_guard before insert or update on public.workout_sessions
  for each row execute function public.workout_session_item_guard();
drop trigger if exists workout_sessions_touch on public.workout_sessions;
create trigger workout_sessions_touch before update on public.workout_sessions
  for each row execute function public.touch_updated_at();

alter table public.workout_sessions enable row level security;
alter table public.workout_sessions force row level security;
revoke all on public.workout_sessions from anon;
grant select, insert, update, delete on public.workout_sessions to authenticated;
drop policy if exists owner_only on public.workout_sessions;
create policy owner_only on public.workout_sessions for all to authenticated
  using (user_id = auth.uid() and public.is_owner())
  with check (user_id = auth.uid() and public.is_owner());

-- Dashboard Edit Mode also edits routines_and_goals; never carry old form
-- guidance, video or set targets across a title change through that path.
create or replace function public.clear_stale_exercise_guide()
returns trigger language plpgsql as $$
begin
  if new.title is distinct from old.title then
    if new.guide_url is not distinct from old.guide_url then new.guide_url := null; end if;
    if new.guide is not distinct from old.guide then new.guide := null; end if;
    if new.youtube_url is not distinct from old.youtube_url then new.youtube_url := null; end if;
    if new.workout_template is not distinct from old.workout_template then new.workout_template := null; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists clear_stale_exercise_guide on public.routines_and_goals;
create trigger clear_stale_exercise_guide before update of title on public.routines_and_goals
  for each row execute function public.clear_stale_exercise_guide();

-- A changed movement gets a new item ID so its previous logs and EXP remain
-- attached to the old exercise. Prescriptions are editable independently.
create or replace function public.save_workout_exercise(
  p_id uuid, p_group uuid, p_title text, p_notes text, p_sets jsonb,
  p_guide_url text, p_guide jsonb, p_rest_seconds integer
) returns uuid language plpgsql as $$
declare old_item public.routines_and_goals; v_id uuid; v_order integer;
begin
  if not public.is_owner() or not exists (
    select 1 from public.routine_groups where id = p_group and user_id = auth.uid()
      and kind = 'exercise' and is_active
  ) then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 150 or not public.valid_workout_sets(p_sets)
     or p_rest_seconds is null or p_rest_seconds not between 30 and 600
     or length(coalesce(p_notes, '')) > 1000
     or (p_guide_url is not null and p_guide_url !~* '^https://www\.muscleandstrength\.com/exercises/[a-z0-9-]+\.html$')
  then raise exception 'invalid exercise' using errcode = '22023'; end if;
  if p_id is not null then
    select * into old_item from public.routines_and_goals
      where id = p_id and user_id = auth.uid() and is_active for update;
    if old_item.id is null or not exists (
      select 1 from public.routine_groups where id = old_item.group_id
        and kind = 'exercise' and user_id = auth.uid()
    ) then raise exception 'exercise not found' using errcode = '22023'; end if;
    v_order := old_item.sort_order;
    if old_item.title = btrim(p_title) and old_item.group_id = p_group then
      update public.routines_and_goals set group_id = p_group, notes = p_notes,
        workout_template = p_sets, workout_rest_seconds = p_rest_seconds,
        details = jsonb_array_length(p_sets)::text || ' sets',
        guide_url = p_guide_url, guide = p_guide
      where id = p_id;
      return p_id;
    end if;
    update public.routines_and_goals set is_active = false where id = p_id;
  else
    select coalesce(max(sort_order) + 10, 10) into v_order
      from public.routines_and_goals where group_id = p_group;
  end if;
  insert into public.routines_and_goals
    (user_id, group_id, title, details, notes, workout_template, workout_rest_seconds, guide_url, guide,
     sort_order, target_count, is_trackable)
  values (auth.uid(), p_group, btrim(p_title), jsonb_array_length(p_sets)::text || ' sets',
    p_notes, p_sets, p_rest_seconds, p_guide_url, p_guide, v_order, 1, true)
  returning id into v_id;
  return v_id;
end;
$$;

-- Explicit one-time install. Archive prior exercise groups, never delete them
-- or their completion history; non-exercise groups remain untouched.
create or replace function public.install_workout_plan(p_plan jsonb)
returns void language plpgsql as $$
declare grp jsonb; ex jsonb; gid uuid; v_day smallint;
begin
  if not public.is_owner() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'array' or jsonb_array_length(p_plan) <> 7 then
    raise exception 'invalid plan' using errcode = '22023'; end if;
  insert into public.seed_flags (user_id, name) values (auth.uid(), 'workout_plan') on conflict do nothing;
  if not found then raise exception 'starter plan already installed; edit individual days instead' using errcode = '22023'; end if;
  update public.routine_groups set is_active = false where user_id = auth.uid() and kind = 'exercise';
  for grp in select value from jsonb_array_elements(p_plan) loop
    v_day := (grp->>'day')::smallint;
    if (v_day is not null and v_day not in (0,1,2,3,4,6))
       or length(btrim(grp->>'title')) not between 1 and 80
       or jsonb_typeof(grp->'items') <> 'array' or jsonb_array_length(grp->'items') not between 1 and 8
    then raise exception 'invalid plan day' using errcode = '22023'; end if;
    insert into public.routine_groups (user_id, title, description, kind, frequency, days_of_week, color, sort_order)
    values (auth.uid(), grp->>'title', grp->>'description', 'exercise', 'daily',
      case when v_day is null then null::smallint[] else array[v_day] end,
      case v_day when 0 then 'sky' when 1 then 'fuchsia' when 2 then 'violet'
        when 3 then 'lime' when 4 then 'amber' else 'cyan' end, coalesce(v_day * 10, 70))
    returning id into gid;
    for ex in select value from jsonb_array_elements(grp->'items') loop
      if length(btrim(ex->>'title')) not between 1 and 150
         or not public.valid_workout_sets(ex->'sets')
         or ((ex->>'guide_url') is not null and (ex->>'guide_url') !~* '^https://www\.muscleandstrength\.com/exercises/[a-z0-9-]+\.html$')
      then raise exception 'invalid plan exercise' using errcode = '22023'; end if;
      insert into public.routines_and_goals
        (user_id, group_id, title, details, notes, guide_url, guide, workout_template, sort_order, is_trackable)
      values (auth.uid(), gid, ex->>'title', jsonb_array_length(ex->'sets')::text || ' sets',
        ex->>'notes', ex->>'guide_url', ex->'guide', ex->'sets',
        (select count(*) * 10 from public.routines_and_goals where group_id = gid),
        v_day is not null and v_day <> 0);
    end loop;
  end loop;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.valid_workout_sets(jsonb)', 'public.workout_session_item_guard()',
    'public.clear_stale_exercise_guide()',
    'public.workout_previous(date)',
    'public.save_workout_exercise(uuid, uuid, text, text, jsonb, text, jsonb, integer)',
    'public.install_workout_plan(jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
