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
