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
  goal_distance_m numeric
);
insert into athlete (id) values (1) on conflict do nothing;

-- Every session: Strava activities, SkiErg photo logs and manual entries.
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
  excluded boolean not null default false, -- true when merged into a ski log
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

alter table strava_auth enable row level security;
alter table athlete enable row level security;
alter table activities enable row level security;
alter table checkins enable row level security;

-- Private bucket for SkiErg monitor photos.
insert into storage.buckets (id, name, public)
values ('ski-photos', 'ski-photos', false)
on conflict do nothing;
