#!/bin/bash
# ---------------------------------------------------------------------------
# Domus — double-click this file to start the app.
#
# It installs what it needs the first time, then opens Domus in your browser.
# Leave the black Terminal window open while you use the app. Close it to stop.
# ---------------------------------------------------------------------------

cd "$(dirname "$0")" || exit 1

echo ""
echo "  DOMUS — Your properties, in order"
echo "  ---------------------------------"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js is not installed on this Mac."
  echo ""
  echo "  1. Go to  https://nodejs.org"
  echo "  2. Download the big green LTS button and install it."
  echo "  3. Close this window and double-click start.command again."
  echo ""
  read -r -p "  Press Return to close. "
  exit 1
fi

PLATFORM="$(uname -s)-$(uname -m)"
MARKER="node_modules/.domus-platform"

if [ ! -d node_modules ] || [ ! -f "$MARKER" ] || [ "$(cat "$MARKER" 2>/dev/null)" != "$PLATFORM" ]; then
  if [ -d node_modules ]; then
    echo "  Cleaning up an installation built for a different machine…"
    rm -rf node_modules
  fi
  echo "  Installing Domus (first run only, about a minute)…"
  echo ""
  npm install --no-audit --no-fund || {
    echo ""
    echo "  Install failed. Check your internet connection and try again."
    read -r -p "  Press Return to close. "
    exit 1
  }
  mkdir -p node_modules
  echo "$PLATFORM" > "$MARKER"
fi

if [ ! -f .env ]; then
  echo ""
  echo "  No .env file found — starting in DEMO MODE."
  echo "  Data will be saved in your browser only. Verification code: 123456"
  echo "  See README.md to connect a real database."
fi

echo ""
echo "  Starting Domus… your browser will open at http://localhost:5173"
echo "  Keep this window open. Close it to stop the app."
echo ""

npm run dev
