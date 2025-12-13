#!/bin/bash

# Run Puppeteer script with Xvfb on headless server
# Usage: ./runOnServer.sh [script-name.js]

SCRIPT_NAME=${1:-BrowserSubmitForm.js}

# Check if Xvfb is installed
if ! command -v xvfb-run &> /dev/null; then
    echo "❌ Xvfb not found. Installing..."
    sudo apt-get update
    sudo apt-get install -y xvfb
fi

# Check if Chrome/Chromium is installed
if ! command -v google-chrome &> /dev/null && ! command -v chromium-browser &> /dev/null; then
    echo "⚠️  Chrome not found. Puppeteer will download its own Chromium."
fi

echo "🚀 Running $SCRIPT_NAME with virtual display..."

# Run with Xvfb
xvfb-run -a --server-args="-screen 0 1920x1080x24 -ac -nolisten tcp -dpi 96 +extension RANDR" \
  node "$SCRIPT_NAME"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Script completed successfully"
else
    echo "❌ Script failed with exit code: $EXIT_CODE"
fi

exit $EXIT_CODE
