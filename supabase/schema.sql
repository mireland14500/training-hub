-- Training Hub schema. Run this once in Supabase -> SQL editor.
-- The app is single-user and talks to the database only from the server with the
-- service-role key, so row level security is enabled with no public policies.

create extension if not exists pgcrypto;

-- Strava OAuth tokens (one row).
create table if not exists strava_auth (
  id int primary key default 1 check (id = 1),
  athlete_id bigint,
  athlete_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  last_sync_at timestamptz,
  updated_at timestamptz default now()
);

-- Your physiology settings (one row).
create table if not exists athlete (
  id int primary key default 1 check (id = 1),
  sex text not null default 'male' check (sex in ('male', 'female')),
  max_hr int not null default 190,
  resting_hr int not null default 50,
  threshold_hr int not null default 170,
  -- Optional manual override for threshold pace, seconds per km.
  threshold_pace_override numeric,
  -- Optional recent race result used for VDOT.
  race_distance_m numeric,
  race_time_s numeric,
  race_date date,
  -- Optional goal race shown on the dashboard.
  goal_name text,
  goal_date date,
  goal_distance_m numeric,
  -- HYROX division used for race weights and reference times.
  hyrox_division text not null default 'open_men'
    check (hyrox_division in ('open_men', 'open_women', 'pro_men', 'pro_women')),
  -- Filled by scripts/garmin_sync.py from Garmin Connect.
  garmin_lt_speed numeric,     -- lactate threshold speed, m/s
  garmin_lt_hr int,            -- lactate threshold heart rate
  garmin_lt_date date,
  garmin_vo2max numeric,
  garmin_synced_at timestamptz,
  -- Garmin race predictor, seconds.
  garmin_pred_5k int,
  garmin_pred_10k int,
  garmin_pred_half int,
  garmin_pred_marathon int,
  -- Converts Garmin's per-activity training load to this app's scale (~100 = 1 h at threshold).
  garmin_load_scale numeric,
  -- Show HYROX predictions and the Progress page (off = recovery + running focus).
  show_predictions boolean not null default false
);
insert into athlete (id) values (1) on conflict do nothing;

-- Every session: Strava activities, erg photo logs, HYROX sims/races and manual entries.
-- sport is the Strava sport_type, or 'SkiErg' / 'RowErg' / 'BikeErg' / 'HYROX' for logged sessions.
-- HYROX sessions keep their splits in details: { kind, runs[8], stations{...}, roxzone_s }.
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('strava', 'ski_photo', 'manual')),
  external_id bigint unique,
  sport text not null,
  name text,
  start_time timestamptz not null,
  duration_s int not null,
  moving_s int,
  distance_m numeric,
  elevation_m numeric,
  avg_hr numeric,
  max_hr numeric,
  avg_speed numeric,           -- m/s
  avg_watts numeric,
  calories numeric,
  rpe int check (rpe between 1 and 10),
  suffer_score numeric,        -- Strava relative effort
  load numeric,                -- training stress, ~100 = 1 h at threshold
  load_method text,            -- 'hr' | 'rpe' | 'strava' | 'duration'
  zone_seconds int[],          -- seconds in HR zones 1-5
  best_efforts jsonb,          -- { "180": metres, "360": metres, ... } for runs
  efficiency numeric,          -- metres per minute per heartbeat
  decoupling numeric,          -- % drift of pace:HR, second half vs first half
  streams_fetched boolean not null default false,
  details jsonb,               -- SkiErg splits, stroke rate, pace etc.
  photo_path text,
  linked_activity_id uuid references activities (id) on delete set null,
  excluded boolean not null default false, -- true when merged into a logged session
  trainer boolean not null default false,  -- treadmill/indoor: distance unreliable for best efforts
  -- What the session actually was (overrides Strava's sport, e.g. a "HIIT" class that was threshold work):
  -- easy | long | threshold | intervals | hyrox | strength | recovery | race
  focus text,
  -- What you did, entered by hand or read from a photo: [{ exercise, sets, distance_m, reps, time_s,
  -- speed_kmh, incline_pct, weight_kg, notes }] — see lib/workout.ts
  entries jsonb,
  -- From Garmin Connect (matched by start time): Garmin's training load and Training Effect.
  garmin_load numeric,
  garmin_te_aerobic numeric,
  garmin_te_anaerobic numeric,
  garmin_type text,
  -- Strava's best efforts within this run, elapsed seconds: { "1K": 215, "5K": 1170, ... }
  strava_best_efforts jsonb,
  notes text,
  created_at timestamptz default now()
);
create index if not exists activities_start_idx on activities (start_time desc);

-- Morning check-in (numbers from Garmin Connect + how you feel).
create table if not exists checkins (
  date date primary key,
  sleep_score int,
  sleep_hours numeric,
  hrv_ms numeric,
  resting_hr int,
  body_battery int,
  training_readiness int,
  soreness int check (soreness between 1 and 5),
  energy int check (energy between 1 and 5),
  notes text,
  created_at timestamptz default now()
);

-- Days off training (illness, injury, holiday), so dips aren't read as lost fitness.
create table if not exists time_off (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  reason text not null default 'ill' check (reason in ('ill', 'injury', 'holiday', 'other')),
  notes text,
  created_at timestamptz default now()
);

-- HYROX station benchmarks from training (e.g. 100 wall balls in 5:40).
-- Not counted as training load: the session they were part of already is.
create table if not exists benchmarks (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  station text not null check (station in ('ski', 'sled_push', 'sled_pull', 'bbj', 'row', 'farmers', 'lunges', 'wall_balls')),
  time_s numeric not null,
  amount numeric,          -- metres (or reps for wall balls); blank = race distance
  load_kg numeric,         -- sled total / per-hand kettlebell / sandbag / ball weight
  fresh boolean not null default true, -- false if done straight after running
  notes text,
  created_at timestamptz default now()
);
create index if not exists benchmarks_station_idx on benchmarks (station, date desc);

-- Upgrades for databases created from an earlier version of this file.
alter table athlete add column if not exists hyrox_division text not null default 'open_men';
alter table athlete add column if not exists garmin_lt_speed numeric;
alter table athlete add column if not exists garmin_lt_hr int;
alter table athlete add column if not exists garmin_lt_date date;
alter table athlete add column if not exists garmin_vo2max numeric;
alter table athlete add column if not exists garmin_synced_at timestamptz;
alter table activities add column if not exists trainer boolean not null default false;
alter table activities add column if not exists focus text;
alter table activities add column if not exists entries jsonb;
alter table activities add column if not exists garmin_load numeric;
alter table activities add column if not exists garmin_te_aerobic numeric;
alter table activities add column if not exists garmin_te_anaerobic numeric;
alter table activities add column if not exists garmin_type text;
alter table athlete add column if not exists garmin_pred_5k int;
alter table athlete add column if not exists garmin_pred_10k int;
alter table athlete add column if not exists garmin_pred_half int;
alter table athlete add column if not exists garmin_pred_marathon int;
alter table athlete add column if not exists garmin_load_scale numeric;
alter table activities add column if not exists strava_best_efforts jsonb;
alter table athlete add column if not exists show_predictions boolean not null default false;

-- Garmin login tokens, so the app can sync Garmin itself (written by `npm run garmin`).
create table if not exists garmin_auth (
  id int primary key default 1 check (id = 1),
  tokens jsonb not null,
  display_name text,
  updated_at timestamptz default now()
);

-- InBody (or any body-composition) scans, read from a photo of the result sheet or app.
create table if not exists body_scans (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  weight_kg numeric,
  skeletal_muscle_kg numeric,
  body_fat_kg numeric,
  body_fat_pct numeric,
  lean_mass_kg numeric,
  total_body_water_l numeric,
  visceral_fat_level numeric,
  bmr_kcal int,
  inbody_score int,
  segmental_lean jsonb,
  photo_path text,
  notes text,
  created_at timestamptz default now()
);
create index if not exists body_scans_date on body_scans (date);

alter table strava_auth enable row level security;
alter table body_scans enable row level security;
alter table garmin_auth enable row level security;
alter table athlete enable row level security;
alter table activities enable row level security;
alter table checkins enable row level security;
alter table benchmarks enable row level security;
alter table time_off enable row level security;

-- Private bucket for workout photos (erg monitors, whiteboards, results).
insert into storage.buckets (id, name, public)
values ('ski-photos', 'ski-photos', false)
on conflict do nothing;

-- Make the API pick up new columns immediately after an upgrade.
notify pgrst, 'reload schema';
