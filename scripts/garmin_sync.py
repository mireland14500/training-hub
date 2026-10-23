#!/usr/bin/env python3
"""Imports recovery data and lactate threshold from Garmin Connect into Training Hub.

What it imports:
  * Daily check-in fields: overnight HRV, sleep score + hours, resting HR,
    Body Battery at wake, Garmin Training Readiness (your soreness/energy
    entries are left alone).
  * Garmin's running lactate threshold (pace + heart rate), VO2max and race predictions.
  * Per-activity training load, Training Effect and activity type, matched to the
    activities already imported from Strava (by start time).

Garmin has no public API for individuals, so this uses the unofficial
`garminconnect` library and logs in as you. Your password is only used for the
first login; after that, tokens are stored in ~/.garminconnect.

Usage (from the training-hub folder):
  npm run garmin                 # last 7 days (30 on the first run)
  npm run garmin -- --days 60    # backfill more recovery history
  npm run garmin -- --debug      # print Garmin's raw responses
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

try:
    from garminconnect import (
        Garmin,
        GarminConnectAuthenticationError,
        GarminConnectConnectionError,
        GarminConnectTooManyRequestsError,
    )
except ImportError:
    sys.exit("The Garmin library isn't installed. Run it with:  npm run garmin")

ROOT = Path(__file__).resolve().parent.parent
TOKENSTORE = os.getenv("GARMINTOKENS", "~/.garminconnect")
DEBUG = False


# ---------------------------------------------------------------------------
# Config & Supabase
# ---------------------------------------------------------------------------

def load_env() -> dict[str, str]:
    """Reads .env.local (KEY=VALUE lines), letting real environment variables win."""
    env: dict[str, str] = {}
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    env.update({k: v for k, v in os.environ.items() if k.startswith(("SUPABASE_", "GARMIN_"))})
    return env


class Supabase:
    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/").removesuffix("/rest/v1") + "/rest/v1"
        self.key = key

    def request(self, method: str, path: str, body: object | None = None, prefer: str = "return=minimal") -> object:
        req = urllib.request.Request(
            self.base + path,
            method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={
                "apikey": self.key,
                "Authorization": f"Bearer {self.key}",
                "Content-Type": "application/json",
                "Prefer": prefer,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                text = res.read().decode()
                return json.loads(text) if text else None
        except urllib.error.HTTPError as e:
            sys.exit(f"Supabase error {e.code} on {method} {path}: {e.read().decode()}")

    def upsert_checkin(self, row: dict) -> None:
        self.request("POST", "/checkins?on_conflict=date", row, "resolution=merge-duplicates,return=minimal")

    def update_athlete(self, fields: dict) -> None:
        self.request("PATCH", "/athlete?id=eq.1", fields)

    def activities_between(self, start_iso: str, end_iso: str) -> list[dict]:
        q = urllib.parse.urlencode(
            [("select", "id,start_time,duration_s"), ("start_time", f"gte.{start_iso}"), ("start_time", f"lte.{end_iso}")]
        )
        rows = self.request("GET", f"/activities?{q}", prefer="")
        return rows if isinstance(rows, list) else []

    def update_activity(self, activity_id: str, fields: dict) -> None:
        self.request("PATCH", f"/activities?id=eq.{urllib.parse.quote(activity_id)}", fields)

    def has_garmin_loads(self) -> bool:
        rows = self.request("GET", "/activities?select=id&garmin_load=not.is.null&limit=1", prefer="")
        return bool(rows)

    def last_garmin_sync(self) -> str | None:
        rows = self.request("GET", "/athlete?id=eq.1&select=garmin_synced_at", prefer="")
        return rows[0].get("garmin_synced_at") if isinstance(rows, list) and rows else None


# ---------------------------------------------------------------------------
# Garmin
# ---------------------------------------------------------------------------

def login(env: dict[str, str]) -> Garmin:
    """Logs in with saved tokens, falling back to email/password (+ MFA prompt) once."""
    try:
        api = Garmin()
        api.login(TOKENSTORE)
        return api
    except (GarminConnectAuthenticationError, FileNotFoundError):
        pass

    print("Log in to Garmin Connect (only needed once — tokens are saved to ~/.garminconnect).")
    email = env.get("GARMIN_EMAIL") or input("Garmin email: ").strip()
    password = env.get("GARMIN_PASSWORD") or getpass.getpass("Garmin password: ")
    api = Garmin(email, password, prompt_mfa=lambda: input("Garmin MFA code (check your email/app): ").strip())
    api.login(TOKENSTORE)
    return api


def debug(label: str, data: object) -> None:
    if DEBUG:
        print(f"--- {label} ---\n{json.dumps(data, indent=2, default=str)[:3000]}")


def safe(label: str, fn, *args, **kwargs):
    """Calls one Garmin endpoint; a failure skips that metric instead of the whole sync."""
    try:
        data = fn(*args, **kwargs)
        debug(label, data)
        return data
    except GarminConnectTooManyRequestsError:
        sys.exit("Garmin rate limit hit — wait an hour and run again.")
    except Exception as e:  # noqa: BLE001 — Garmin's responses vary by device/account
        if DEBUG:
            print(f"  ({label} failed: {e})")
        return None


def num(value) -> float | None:
    return value if isinstance(value, (int, float)) and value > 0 else None


def day_metrics(api: Garmin, d: str) -> dict:
    row: dict = {}

    hrv = safe(f"hrv {d}", api.get_hrv_data, d) or {}
    row["hrv_ms"] = num((hrv.get("hrvSummary") or {}).get("lastNightAvg"))

    sleep = safe(f"sleep {d}", api.get_sleep_data, d) or {}
    dto = sleep.get("dailySleepDTO") or {}
    row["sleep_score"] = num(((dto.get("sleepScores") or {}).get("overall") or {}).get("value"))
    secs = num(dto.get("sleepTimeSeconds"))
    row["sleep_hours"] = round(secs / 3600, 1) if secs else None

    summary = safe(f"summary {d}", api.get_user_summary, d) or {}
    row["resting_hr"] = num(summary.get("restingHeartRate"))
    row["body_battery"] = num(summary.get("bodyBatteryAtWakeTime")) or num(summary.get("bodyBatteryHighestValue"))

    readiness = safe(f"readiness {d}", api.get_training_readiness, d)
    if isinstance(readiness, list) and readiness:
        # Several entries per day are possible; the morning one is first.
        row["training_readiness"] = num(readiness[-1].get("score"))
    elif isinstance(readiness, dict):
        row["training_readiness"] = num(readiness.get("score"))

    return {k: (round(v) if k != "sleep_hours" and v is not None else v) for k, v in row.items() if v is not None}


def threshold_and_vo2max(api: Garmin) -> dict:
    fields: dict = {}
    lt = safe("lactate threshold", api.get_lactate_threshold) or {}
    shr = lt.get("speed_and_heart_rate") or {}
    speed = num(shr.get("speed"))
    if speed:
        # Garmin stores this in tenths of m/s on some accounts (e.g. 0.37 = 3.7 m/s).
        if speed < 1.5:
            speed *= 10
        if 2.0 <= speed <= 7.0:
            fields["garmin_lt_speed"] = round(speed, 3)
    if num(shr.get("heartRate")):
        fields["garmin_lt_hr"] = round(shr["heartRate"])
    if shr.get("calendarDate"):
        fields["garmin_lt_date"] = str(shr["calendarDate"])[:10]

    mm = safe("max metrics", api.get_max_metrics, date.today().isoformat())
    entry = mm[0] if isinstance(mm, list) and mm else mm if isinstance(mm, dict) else {}
    generic = (entry or {}).get("generic") or {}
    vo2 = num(generic.get("vo2MaxPreciseValue")) or num(generic.get("vo2MaxValue"))
    if vo2:
        fields["garmin_vo2max"] = round(vo2, 1)
    return fields


def race_predictions(api: Garmin) -> dict:
    data = safe("race predictions", api.get_race_predictions)
    entry = data[-1] if isinstance(data, list) and data else data if isinstance(data, dict) else {}
    keys = {"time5K": "garmin_pred_5k", "time10K": "garmin_pred_10k", "timeHalfMarathon": "garmin_pred_half", "timeMarathon": "garmin_pred_marathon"}
    return {col: round(entry[k]) for k, col in keys.items() if num((entry or {}).get(k))}


TREADMILL_TYPES = {"treadmill_running", "indoor_running", "virtual_run"}


def parse_gmt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def match_activities(api: Garmin, db: Supabase, days: int) -> tuple[int, int]:
    """Copies Garmin's load / Training Effect onto the matching Strava activities (start within 3 min)."""
    end = date.today()
    start = end - timedelta(days=days)
    garmin = safe("activities", api.get_activities_by_date, start.isoformat(), end.isoformat()) or []
    ours = db.activities_between(f"{start.isoformat()}T00:00:00Z", f"{(end + timedelta(days=1)).isoformat()}T23:59:59Z")
    parsed = [(o, datetime.fromisoformat(o["start_time"].replace("Z", "+00:00"))) for o in ours if o.get("start_time")]

    matched = 0
    for g in garmin:
        t = parse_gmt(g.get("startTimeGMT"))
        if not t:
            continue
        best = min(parsed, key=lambda p: abs((p[1] - t).total_seconds()), default=None)
        if not best or abs((best[1] - t).total_seconds()) > 180:
            continue
        type_key = (g.get("activityType") or {}).get("typeKey")
        fields = {
            "garmin_load": num(g.get("activityTrainingLoad")),
            "garmin_te_aerobic": num(g.get("aerobicTrainingEffect")),
            "garmin_te_anaerobic": g.get("anaerobicTrainingEffect") if isinstance(g.get("anaerobicTrainingEffect"), (int, float)) else None,
            "garmin_type": type_key,
        }
        if type_key in TREADMILL_TYPES:
            fields["trainer"] = True
        db.update_activity(best[0]["id"], {k: v for k, v in fields.items() if v is not None})
        matched += 1
    return matched, len(garmin)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    global DEBUG
    parser = argparse.ArgumentParser(description="Import Garmin recovery data into Training Hub")
    parser.add_argument("--days", type=int, help="days of recovery data (default 7, or 30 on the first run)")
    parser.add_argument("--activity-days", type=int, help="days of activities to match (default 14, or 120 the first time)")
    parser.add_argument("--debug", action="store_true", help="print Garmin's raw responses")
    args = parser.parse_args()
    DEBUG = args.debug

    env = load_env()
    if not env.get("SUPABASE_URL") or not env.get("SUPABASE_SERVICE_ROLE_KEY"):
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local")
    db = Supabase(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    try:
        api = login(env)
    except GarminConnectAuthenticationError as e:
        sys.exit(f"Garmin login failed: {e}")
    except GarminConnectConnectionError as e:
        sys.exit(f"Could not reach Garmin Connect: {e}")

    days = args.days or (7 if db.last_garmin_sync() else 30)
    today = date.today()
    print(f"Importing {days} days of Garmin data…")
    imported = 0
    for i in range(days - 1, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        row = day_metrics(api, d)
        if row:
            db.upsert_checkin({"date": d, **row})
            imported += 1
            print(f"  {d}  " + "  ".join(f"{k}={v}" for k, v in row.items()))

    fields = threshold_and_vo2max(api)
    fields.update(race_predictions(api))
    fields["garmin_synced_at"] = datetime.now(timezone.utc).isoformat()
    db.update_athlete(fields)

    # ~4 months of activities the first time (one request — enough for fitness/fatigue history),
    # then a rolling two weeks.
    activity_days = args.activity_days or (14 if db.has_garmin_loads() else 120)
    matched, total = match_activities(api, db, activity_days)

    print(f"\nDone: {imported} day(s) of recovery data.")
    if "garmin_lt_speed" in fields:
        s = 1000 / fields["garmin_lt_speed"]
        print(f"Lactate threshold: {int(s // 60)}:{round(s % 60):02d}/km @ {fields.get('garmin_lt_hr', '?')} bpm ({fields.get('garmin_lt_date', '?')})")
    else:
        print("No lactate threshold found on Garmin (run the guided LT test on your watch to get one).")
    if "garmin_vo2max" in fields:
        print(f"VO2max: {fields['garmin_vo2max']}")
    preds = [(label, fields[col]) for label, col in (("5K", "garmin_pred_5k"), ("10K", "garmin_pred_10k"), ("Half", "garmin_pred_half"), ("Marathon", "garmin_pred_marathon")) if col in fields]
    if preds:
        print("Race predictor: " + "  ".join(f"{label} {v // 3600}:{v % 3600 // 60:02d}:{v % 60:02d}" if v >= 3600 else f"{label} {v // 60}:{v % 60:02d}" for label, v in preds))
    print(f"Training load: matched {matched} of {total} Garmin activities to your Strava sessions.")
    if total and matched < total:
        print("  (Unmatched ones aren't on Strava yet — sync Strava in the app, then run this again.)")


if __name__ == "__main__":
    main()
