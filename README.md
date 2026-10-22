# Training Hub

A personal training app for phone and desktop. It pulls your Garmin runs in through Strava, reads SkiErg sessions from a photo of the monitor, and gives you:

- **Recovery dashboard**
  - A readiness score (0–100) that combines form (TSB) with your morning Garmin numbers: HRV, resting HR, sleep score and Body Battery.
  - A Fitness / Fatigue / Form chart.
  - Acute:chronic load ratio, intensity split across HR zones, weekly load by sport, and plain-language guidance for today.
- **Running analysis**
  - Threshold pace estimated from critical speed and your best efforts, or from a recent race.
  - VDOT, Daniels training paces, race predictions and a threshold trend.
  - Weekly volume, aerobic efficiency on easy runs, and aerobic decoupling on long runs.
- **SkiErg logging**
  - Snap the PM5 monitor and the app fills in time, metres, calories, pace, watts, stroke rate and splits. Check the numbers, add RPE, save.
  - If you also recorded the session on your watch, link the two. The app then uses that heart rate, and the session isn't counted twice.

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

### 3. Anthropic API key (for reading monitor photos)
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
- **A goal race (optional).** It adds a countdown and a predicted time.

## How the numbers are calculated

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
app/                pages (Recovery, Running, SkiErg, Log, Settings, Check-in) and API routes
app/actions.ts      server actions (save check-in, settings, ski sessions)
lib/analysis.ts     all training-science maths (pure functions, unit tested)
lib/data.ts         loads and aggregates data for each page
lib/strava.ts       Strava OAuth and API client
lib/sync.ts         import, stream analysis, webhook handling
lib/ski-vision.ts   reads monitor photos with Claude (structured output)
supabase/schema.sql database schema
tests/              unit tests for the analysis maths (npm test)
```

## Ideas for later
- Concept2 Logbook sync, so SkiErg sessions import without a photo.
- Push notification reminding you to check in each morning.
- Offline support (service worker).
- Workout detection (intervals vs tempo vs easy) from pace streams.
