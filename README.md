# Training Hub

A personal training app for phone and desktop, focused on **recovery and running faster**. It has three tabs:

- **Today:**
  - A **Push / Easy / Rest** call for the day, with a suggested session. It's based on your Garmin HRV, resting HR, sleep, Body Battery and readiness, each compared with your own last 4 weeks, plus your training load and recent hard days.
  - Your HRV over 14 nights, with your normal range shaded.
  - **This week:** add a session, hold, ease off, take a lighter week, build back or taper, with a load target and the specific session to add. It aims for about 80% easy running, 1–2 quality runs and a long run.
- **Calendar:** every session, including gym classes. Set what a session really was and add the exercises (from a whiteboard photo or by hand). "Same as last week?" fills repeating classes in one tap, and you can mark days off when you're ill or away.
- **Running:**
  - Your **easy pace at a fixed heart rate**, week by week. It's the clearest sign your aerobic fitness is improving.
  - Garmin's lactate threshold and VO2max.
  - Weekly km.
  - Best efforts for the last 90 days vs the 90 before.
  - Recent quality-session paces.
  - Your training paces.

HYROX race predictions and the Progress page are still there. Switch them on in **Settings → HYROX → Show HYROX predictions & Progress**.

Data comes from:
- Your Garmin, through Strava.
- Erg sessions logged from a photo of the monitor.
- HYROX sims and races logged by hand, or from a results screenshot.
- Station benchmarks (e.g. 100 wall balls in 5:40).
- A 20-second morning check-in with your Garmin HRV, sleep and Body Battery.

It's a **Progressive Web App (PWA)**: open the URL on your phone and choose *Add to Home Screen* to get it as an app.

## Calendar and session details

The **Calendar** tab shows each week (Monday–Sunday), a month overview, and a week summary. The summary has total load, sessions, hours, hard sessions, time by type, and volumes: running km including treadmill, SkiErg/Row metres, sled metres, wall-ball reps and more.

Tap any session to tell the app what it really was. This is useful for gym classes that Garmin/Strava records as "HIIT":
- **Session type:** Easy, Long, Threshold, Intervals, HYROX, Strength, Recovery or Race. This replaces Strava's label in the analysis.
- **RPE.** It's used for load when the session has no heart rate.
- **What you did:** take a photo of the whiteboard or screen (Claude reads it into rows) or add rows by hand. Each row is ski, treadmill, run, row, bike, sled push/pull, wall balls, lunges, burpees, carries or other, with sets, metres or reps, time per set, treadmill speed/incline and weight. Paces are worked out as you type.

**+ Add** on any day logs a class that isn't on Strava.

**Time off:** use **Mark time off** (ill, injured, holiday) on the calendar.
- While you're off, the weekly plan says rest.
- For two weeks afterwards it gives build-back advice: about 60–80% of normal load in week 1, then back to normal.
- "Am I getting fitter?" stops counting the dip in training volume and easy-run heart rate against you.

**Same as last week?** Most classes repeat. Once you've filled in a class, the calendar spots the next one (same name, or same weekday, time and type) and offers to copy its details in one tap. The session editor also has **Copy from a previous session…** for any earlier session with details.

How session details feed the analysis:
- **Weekly plan and session mix:** a "HIIT" class with treadmill reps counts as a run, with Threshold or Intervals making it a quality session. Ski/row rows count as erg work, and station rows as station work.
- **HYROX prediction:** a single ski/row piece (e.g. 1 × 1000 m) counts like an erg log. A station effort of at least half the race distance or reps (e.g. 50 wall balls in one go) counts as a benchmark. If the session also had running, it's treated as done "after running".

## How the data flows

```
Garmin watch ──▶ Garmin Connect ──▶ Strava ──(webhook + sync)──▶ Training Hub ◀── SkiErg photo (Claude reads the monitor)
                       │                                              ▲
                       └──── HRV / sleep / Body Battery ─(morning check-in, typed in)
```

Garmin doesn't share HRV, sleep or Body Battery with Strava. To get them, run the Garmin sync below, or type them into the morning check-in.

## Setup (about 20 minutes, all free tiers)

### 1. Supabase (database and photo storage)
1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql` and click **Run**. This creates the tables and a private `ski-photos` storage bucket.
3. From **Project Settings → API**, copy the **Project URL** and the **service_role** key.

### 2. Strava API app
1. Go to <https://www.strava.com/settings/api> and create an app.
2. Set **Authorization Callback Domain** to your app's domain:
   - `localhost` while testing.
   - Later, your Vercel domain (for example `training-hub-you.vercel.app`).
3. Copy the **Client ID** and **Client Secret**.

### 3. Anthropic API key (for reading photos)
Create a key at <https://console.anthropic.com>. Each photo costs a fraction of a cent.

### 4. Run locally
```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev
```
1. Open <http://localhost:3000> and log in with your `APP_PASSWORD`.
2. Go to **Settings → Connect with Strava**, then tap **Sync Strava**.
3. The first sync imports 12 months of activities. Strava limits apps to 100 requests per 15 minutes, so detailed analysis of older runs (HR zones, best efforts) fills in over a few taps of **Sync**.

### 5. Deploy to Vercel (so it works on your phone)
`vercel.json` deploys the Next.js app as a single public service (`app`, at `/`). `scripts/` (the Garmin sync) is left out of the upload via `.vercelignore`, because it runs on your Mac.

1. Push this folder to a GitHub repo and import it at [vercel.com/new](https://vercel.com/new).
2. Add the environment variables from `.env.example`. Set `APP_URL` to your Vercel URL, and set `APP_TIMEZONE` to your zone (e.g. `Europe/London`).
3. Change the Strava callback domain to the Vercel domain.
4. Register the Strava webhook once, so new activities arrive automatically:
   ```bash
   curl -X POST https://www.strava.com/api/v3/push_subscriptions \
     -F client_id=YOUR_CLIENT_ID -F client_secret=YOUR_CLIENT_SECRET \
     -F callback_url=https://YOUR-APP.vercel.app/api/strava/webhook \
     -F verify_token=YOUR_STRAVA_WEBHOOK_VERIFY_TOKEN
   ```
5. On your phone, open the URL in Safari or Chrome and choose **Share → Add to Home Screen**.

### 6. First things to set in Settings
- **Max HR, resting HR and threshold HR.** Your Epix shows an estimated lactate threshold under *Performance Stats*.
- **A recent race (optional).** It's the most accurate source for paces and predictions.
- **HYROX division and next race date.** These set race weights, reference times and taper timing.

## Garmin sync (recovery data and lactate threshold)

`npm run garmin` imports the following from Garmin Connect:
- Overnight HRV, sleep score and hours, resting HR, Body Battery at wake, and Garmin Training Readiness. These go into each day's check-in. Your soreness and energy entries are kept.
- Garmin's running **lactate threshold** (pace and HR), **VO2max** and **race predictor**.
  - A Garmin threshold from the last 12 months becomes the main source for your threshold pace, training paces and race predictions. A manual override in Settings still takes priority.
  - Garmin's **10K prediction** sets the pace of your HYROX run splits.
- **Per-activity training load and Training Effect**, matched to your Strava activities by start time.
  - Garmin's load becomes the main source of training load. It's EPOC-based, so it captures interval classes much better than average HR does.
  - It's converted to the app's scale (~100 = 1 h at threshold) using your own activities that have both, so your fitness/fatigue history stays continuous.
  - Training Effect of 4+ aerobic or 2.5+ anaerobic marks a session as hard.
  - Garmin's activity type marks treadmill runs.

```bash
npm run garmin                 # last 7 days (30 on the first run)
npm run garmin -- --days 60    # backfill more history
npm run garmin -- --debug      # show Garmin's raw responses if something looks wrong
```

- **What you need:** Python 3.12 or newer. macOS comes with 3.9, so install a newer one with `brew install python@3.12` or from python.org. The first run creates a `.venv-garmin` folder and installs the [`garminconnect`](https://github.com/cyberjunky/python-garminconnect) library into it. If setup is interrupted, the next run repairs it.
- **Logging in:** the first run asks for your Garmin email, password and MFA code if you use one. After that, login tokens are saved in `~/.garminconnect`, so your password isn't stored. To avoid the prompt, you can instead put `GARMIN_EMAIL` and `GARMIN_PASSWORD` in `.env.local`.
- **Run it each morning**, or schedule it on your Mac, e.g. `crontab -e` and add:
  `30 7 * * * cd /path/to/training-hub && npm run garmin >> garmin.log 2>&1`
- **Caveat:** Garmin only offers an official API to approved businesses, so this uses an unofficial library that logs in as you. It can break when Garmin changes their site; updating the library usually fixes it: `.venv-garmin/bin/pip install -U garminconnect`.

After the first Garmin sync, open **Settings**:
- **Use Garmin threshold HR** copies Garmin's lactate threshold HR into your zones and re-scores your training load.
- **Re-analyse runs** re-processes your runs with GPS-spike filtering, and treadmill runs are left out of best efforts. It takes a few **Sync Strava** taps because of Strava's rate limit.

## How the HYROX prediction works

Race = 8 × 1 km run + 8 stations + Roxzone. Each segment uses your most recent evidence from the last 120 days:

| Segment | Source (best first) |
|---|---|
| Runs | Your open 10K pace (Garmin's 10K prediction if synced, otherwise from your runs) × a "compromised running" slowdown. The slowdown is measured from your latest sim or race with run splits, with a floor of 5%; the default is +12%. |
| SkiErg / Row | Latest sim/race split, or your best 1 km equivalent from erg logs (Paul's law: +5 s/500 m per doubling of distance) + 6% race fatigue. |
| Other stations | Latest sim/race split, or your best benchmark scaled to race distance/reps and race weight, + 10% if it was done fresh. |
| Roxzone | From your latest full sim or race. |
| Older races | A race or sim older than 4 months (up to 18 months) is still used for any segment with no recent data. It's marked "N months ago" and gets a wider range. |
| Race time, no splits | HYROX races found on Strava are activities named "HYROX…", 45–150 min, not named like a training session. For segments with no other data, the race time is spread over the segments in the proportions of a fast race. The fastest race is shown as **Your best** next to the prediction. |
| No data | Typical time for your division, shown in amber so you know which segments to benchmark. |

The likely range widens for segments that rely on typical times. The reference "typical" and "top ~15%" splits are rough guides from public results; your own data always replaces them.

## How the weekly advice works

| Verdict | When |
|---|---|
| TAPER | Race within 10 days |
| DELOAD | Acute:chronic > 1.5, form < −30, or 3-day readiness average < 45 |
| REDUCE | Acute:chronic > 1.3, form < −20, readiness average < 55, or 3 straight build weeks with readiness below 65 |
| ADD | Acute:chronic < 0.9, form > −5 and readiness ≥ 65 |
| HOLD | Everything else |

The weekly load target is your chronic weekly load (fitness × 7) × a multiplier for the verdict.

When you can add a session, the app suggests the most useful one, in this order:
1. Compromised running, if you've done no HYROX-specific work in 14 days.
2. Station strength.
3. A long run.
4. A threshold run.
5. Erg intervals.
6. An easy run.

## Other calculations

| Metric | Method |
|---|---|
| Session load | Banister TRIMP, scaled so 1 h at threshold HR = 100 (same scale as TSS). Without HR, uses RPE × minutes. Without either, uses Strava's Relative Effort or duration. |
| Fitness / Fatigue / Form | 42-day and 7-day exponentially weighted load. Form = yesterday's fitness − fatigue. |
| Acute:chronic | 7-day load ÷ average weekly load over 28 days. 0.8–1.3 is the usual sweet spot. |
| Readiness | Weighted blend of form, HRV vs your 28-day baseline, resting HR vs baseline, sleep score, Body Battery, soreness and energy. |
| Best efforts | Fastest distance covered in 3/6/12/20/30/60 minutes, taken from Strava's per-second streams. GPS jumps faster than 7 m/s are clipped, and treadmill runs are skipped. |
| Critical speed | Linear fit of distance against time over your 3–20 minute best efforts (last 90 days). |
| VDOT, paces, predictions | Daniels/Gilbert oxygen-cost equations. A manual override wins, then a race you entered in Settings (last 4 months). Otherwise it takes the **strongest** of: Garmin lactate threshold, your best Strava 5K/10K/15K/10 mile/half from the last 4 months, critical speed, and best 20/30/60-min efforts. Training and illness only make you look slower, never faster. |
| PBs | Strava's best efforts (1K, mile, 5K, 10K, half, marathon) inside each run. The Running page shows the best of the imported year and of the last 90 days next to the predictions. |
| HR zones | Friel zones as a % of threshold HR. |
| Efficiency factor | Metres per minute ÷ average HR, on easy runs. |
| Decoupling | Change in pace:HR between the first and second half of runs of 40 minutes or more. |

## Project layout
```
app/                pages (Today, Calendar, Session editor, HYROX, Progress, Running, Log, Ergs, Settings, Check-in) and API routes
app/actions.ts      server actions (save check-in, settings, ski sessions)
lib/analysis.ts     all training-science maths (pure functions, unit tested)
lib/data.ts         loads and aggregates data for each page
lib/strava.ts       Strava OAuth and API client
lib/sync.ts         import, stream analysis, webhook handling
lib/hyrox.ts        HYROX race model and prediction (pure, unit tested)
lib/plan.ts         weekly add/hold/reduce advice (pure, unit tested)
lib/workout.ts      exercises inside a session: paces, volumes, feeding the analysis (pure, unit tested)
scripts/garmin_sync.py  imports recovery data and lactate threshold from Garmin Connect
lib/vision.ts       reads erg monitors and HYROX result screenshots with Claude
supabase/schema.sql database schema
tests/              unit tests (npm test)
```

## Ideas for later
- Concept2 Logbook sync, so SkiErg sessions import without a photo.
- Push notification reminding you to check in each morning.
- Offline support (service worker).
- Workout detection (intervals vs tempo vs easy) from pace streams.
