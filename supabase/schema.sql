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
  perform public._seed_item(g, 1, 'Puppy Pose (Thoracic Extension)', '2x45s', 'https://www.youtube.com/watch?v=tR2UYHTTv5U');
  perform public._seed_item(g, 2, 'Doorframe Lat Stretch', '2x30s/side', 'https://www.youtube.com/watch?v=8b5n4wR_uEQ');
  perform public._seed_item(g, 3, 'Kneeling Wrist Flexion', '2x45s', 'https://www.youtube.com/watch?v=5OWbZ9Oxz0E');
  perform public._seed_item(g, 4, 'Kneeling Hip Flexor Lunge', '2x45s/side', 'https://www.youtube.com/watch?v=2PNT-FFKLgY');
  perform public._seed_item(g, 5, 'Seated Hamstring Fold', '2x45s', 'https://www.youtube.com/watch?v=kYv_8wZzG9E');
  perform public._seed_item(g, 6, 'Butterfly Stretch', '2x45s', 'https://www.youtube.com/watch?v=4yO3Jk5U3X4');

  -- 2. 7-day rotating gym schedule
  g := public._seed_group('Push & Chest', 'Monday & Friday', 'exercise', 'daily', '{1,5}', 'fuchsia', 20);
  perform public._seed_item(g, 1, 'Incline Push-Ups', '4x8-10', 'https://www.youtube.com/watch?v=NEdo_I3OuVk');
  perform public._seed_item(g, 2, 'Seated DB Shoulder Press', '3x8-10', 'https://www.youtube.com/watch?v=qEwKCR5JCog');
  perform public._seed_item(g, 3, 'Flat DB Bench Press', '3x8-10');
  perform public._seed_item(g, 4, 'Cable Lateral Raises', '3x12', 'https://www.youtube.com/watch?v=f_OGBg2KxgY');
  perform public._seed_item(g, 5, 'Rope Tricep Pushdowns', '3x12', 'https://www.youtube.com/watch?v=1FjkhpZsaxc');
  perform public._seed_item(g, 6, 'Hanging Knee Raises', '3x10-12', 'https://www.youtube.com/watch?v=X-ACS9vpRyU');

  g := public._seed_group('Pull & Back', 'Tuesday & Saturday', 'exercise', 'daily', '{2,6}', 'violet', 30);
  perform public._seed_item(g, 1, 'Assisted Pull-Up', '4x8-10', 'https://www.youtube.com/watch?v=gx0RWT7WbmA');
  perform public._seed_item(g, 2, 'Single-Arm DB Rows', '3x8-10/side', 'https://www.youtube.com/watch?v=pYcpY20QaE8');
  perform public._seed_item(g, 3, 'Inverted Rows', '3x10', 'https://www.youtube.com/watch?v=hXTc1mDnZCw');
  perform public._seed_item(g, 4, 'Incline DB Curls', '3x10-12', 'https://www.youtube.com/watch?v=soxrZlIl35U');
  perform public._seed_item(g, 5, 'DB Hammer Curls', '3x10-12');
  perform public._seed_item(g, 6, 'Face Pulls', '3x12-15', 'https://www.youtube.com/watch?v=sHSY0Ao8QHs');

  g := public._seed_group('Legs & Flips', 'Wednesday', 'exercise', 'daily', '{3}', 'lime', 40);
  perform public._seed_item(g, 1, 'Assisted Box Tuck Jumps', '4x5', 'https://www.youtube.com/watch?v=HJZh-12p6vg');
  perform public._seed_item(g, 2, 'DB Goblet Squats/Leg Press', '3x10-12', 'https://www.youtube.com/watch?v=lRYBbchqxtI');
  perform public._seed_item(g, 3, 'DB Walking Lunges', '3x10/leg', 'https://www.youtube.com/watch?v=D7KaRcUTQeE');
  perform public._seed_item(g, 4, 'Seated Leg Curls', '3x12');
  perform public._seed_item(g, 5, 'Standing Machine Calf Raises', '3x15');
  perform public._seed_item(g, 6, 'Hollow Body Holds', '4x25s', 'https://www.youtube.com/watch?v=NtfYZt4vlrI');
  perform public._seed_item(g, 7, 'Stomach Vacuums', '4x25s', 'https://www.youtube.com/watch?v=cub3xhJXsAA');

  g := public._seed_group('Cardio & Abs', 'Thursday', 'exercise', 'daily', '{4}', 'amber', 50);
  perform public._seed_item(g, 1, 'StairMaster & Elliptical', 'StairMaster 20-30m + Elliptical 20-30m');
  perform public._seed_item(g, 2, 'Forearm Plank', '3x30-45s', 'https://www.youtube.com/watch?v=ASdvN_XEl_c');
  perform public._seed_item(g, 3, 'Russian Twists', '3x20', 'https://www.youtube.com/watch?v=-BzNffL_6YE');
  perform public._seed_item(g, 4, 'Bicycle Crunches', '3x20', 'https://www.youtube.com/watch?v=9FGilxCvn08');

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
  insert into public.routines_and_goals (group_id, title, details, youtube_url, notes, sort_order)
  values (g.id, s.title, s.details,
          case when s.youtube_url ~* '^https?://([a-z0-9-]+\.)?(youtube\.com|youtu\.be)/' then s.youtube_url end,
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
