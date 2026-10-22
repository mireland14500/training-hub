# Training Hub

A personal HYROX training analyser for phone and desktop. It answers three questions:

1. **Am I getting fitter?** The Progress page tracks predicted HYROX time, threshold pace, VDOT, training fitness, easy-run efficiency, SkiErg and Row 1 km times, and station benchmarks. It shows the change over the last 6 and 12 weeks and gives an overall verdict.
2. **What would my HYROX time be?** The HYROX page predicts your finish time segment by segment and ranks where you'd gain the most time.
3. **Should I train more or less this week?** The Today page gives weekly advice (**ADD / HOLD / REDUCE / DELOAD / TAPER**). It's based on training load, fatigue, readiness and days to your race. It also gives a weekly load target, checks your session mix (runs, quality runs, strength/stations, sims, ergs) and suggests which session to add or drop.

Data comes from:
- Your Garmin, through Strava.
- Erg sessions logged from a photo of the monitor.
- HYROX sims and races logged by hand, or from a results screenshot.
- Station benchmarks (e.g. 100 wall balls in 5:40).
- A 20-second morning check-in with your Garmin HRV, sleep and Body Battery.

It's a **Progressive Web App (PWA)**: open the URL on your phone and choose *Add to Home Screen* to get it as an app.

## How the data flows

```
Garmin watch ──▶ Garmin Connect ──▶ Strava ──(webhook + sync)──▶ Training Hub ◀── SkiErg photo (Claude reads the monitor)
                       │                                              ▲
                       └──── HRV / sleep / Body Battery ─(morning check-in, typed in)
```

Garmin doesn't share HRV, sleep or Body Battery with Strava. Garmin's own Health API is only open to approved business partners. So the morning check-in screen asks for those numbers; it takes about 20 seconds.

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

## How the HYROX prediction works

Race = 8 × 1 km run + 8 stations + Roxzone. Each segment uses your most recent evidence from the last 120 days:

| Segment | Source (best first) |
|---|---|
| Runs | Your open 10K pace (from running fitness) × a "compromised running" slowdown. The slowdown is measured from your latest sim or race with run splits; the default is +12%. |
| SkiErg / Row | Latest sim/race split, or your best 1 km equivalent from erg logs (Paul's law: +5 s/500 m per doubling of distance) + 6% race fatigue. |
| Other stations | Latest sim/race split, or your best benchmark scaled to race distance/reps and race weight, + 10% if it was done fresh. |
| Roxzone | From your latest full sim or race. |
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
| Best efforts | Fastest distance covered in 3/6/12/20/30/60 minutes, taken from Strava's per-second streams. |
| Critical speed | Linear fit of distance against time over your 3–20 minute best efforts (last 90 days). |
| VDOT, paces, predictions | Daniels/Gilbert oxygen-cost equations. The source is your manual override, then a race from the last 4 months, then the best of the critical-speed and best-effort estimates. |
| HR zones | Friel zones as a % of threshold HR. |
| Efficiency factor | Metres per minute ÷ average HR, on easy runs. |
| Decoupling | Change in pace:HR between the first and second half of runs of 40 minutes or more. |

## Project layout
```
app/                pages (Today, HYROX, Progress, Running, Log, Ergs, Settings, Check-in) and API routes
app/actions.ts      server actions (save check-in, settings, ski sessions)
lib/analysis.ts     all training-science maths (pure functions, unit tested)
lib/data.ts         loads and aggregates data for each page
lib/strava.ts       Strava OAuth and API client
lib/sync.ts         import, stream analysis, webhook handling
lib/hyrox.ts        HYROX race model and prediction (pure, unit tested)
lib/plan.ts         weekly add/hold/reduce advice (pure, unit tested)
lib/vision.ts       reads erg monitors and HYROX result screenshots with Claude
supabase/schema.sql database schema
tests/              unit tests (npm test)
```

## Ideas for later
- Concept2 Logbook sync, so SkiErg sessions import without a photo.
- Push notification reminding you to check in each morning.
- Offline support (service worker).
- Workout detection (intervals vs tempo vs easy) from pace streams.
