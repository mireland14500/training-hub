#!/bin/sh
# Sets up a Python environment for the Garmin sync (once) and runs it.
# Usage: npm run garmin [-- --days 60 | --debug]
set -e
cd "$(dirname "$0")/.."
VENV=.venv-garmin

# The garminconnect library needs Python 3.12+ (macOS ships 3.9).
ok() { "$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' 2>/dev/null; }

PY=""
for c in python3.14 python3.13 python3.12 /opt/homebrew/bin/python3 /usr/local/bin/python3 python3; do
  if command -v "$c" >/dev/null 2>&1 && ok "$c"; then PY="$c"; break; fi
done

# Rebuild the environment if it's missing, broken, or was made with an old Python.
if [ ! -x "$VENV/bin/python" ] || ! ok "$VENV/bin/python"; then
  if [ -z "$PY" ]; then
    echo "The Garmin sync needs Python 3.12 or newer (you have $(python3 --version 2>&1 || echo 'no python3'))."
    echo "Install it with Homebrew:   brew install python@3.12"
    echo "or from https://www.python.org/downloads/ — then run: npm run garmin"
    exit 1
  fi
  echo "Setting up the Garmin sync with $($PY --version)…"
  rm -rf "$VENV"
  "$PY" -m venv "$VENV"
fi

# Install (or repair) the library if it isn't importable.
if ! "$VENV/bin/python" -c 'import garminconnect' 2>/dev/null; then
  echo "Installing the Garmin library (one-off, about a minute)…"
  "$VENV/bin/python" -m pip install -q --upgrade pip
  "$VENV/bin/python" -m pip install -q -r scripts/requirements.txt
fi

exec "$VENV/bin/python" scripts/garmin_sync.py "$@"
