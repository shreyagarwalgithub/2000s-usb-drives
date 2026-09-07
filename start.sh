#!/usr/bin/env bash
#
# Startup script for the USB Drive Classifier.
# Verifies the toolchain, installs dependencies if needed, and starts the app.
#
# Usage:
#   ./start.sh          Start the dev server (default)
#   ./start.sh dev      Start the dev server
#   ./start.sh build    Produce a production build in dist/
#   ./start.sh preview  Build, then serve the production build

set -euo pipefail

# Run from the directory this script lives in, regardless of where it's called.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${1:-dev}"

# ---- Check Node.js ----
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed or not on your PATH." >&2
  echo "Install Node.js 20.19+ from https://nodejs.org and try again." >&2
  exit 1
fi

# Vite 8 requires Node 20.19+. Warn if the major version is clearly too old.
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Warning: detected Node $(node --version). This project targets Node 20.19+." >&2
  echo "The dev server may fail to start on older versions." >&2
fi

# ---- Install dependencies if needed ----
# Reinstall when node_modules is missing, or when the lockfile is newer than
# the last install (a reasonable heuristic for "deps changed").
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "Installing dependencies..."
  npm install
else
  echo "Dependencies already installed. Skipping npm install."
fi

# ---- Launch ----
case "$MODE" in
  dev)
    echo "Starting dev server (Ctrl+C to stop)..."
    exec npm run dev
    ;;
  build)
    echo "Building for production..."
    exec npm run build
    ;;
  preview)
    echo "Building for production, then serving the build..."
    npm run build
    exec npm run preview
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    echo "Usage: ./start.sh [dev|build|preview]" >&2
    exit 1
    ;;
esac
