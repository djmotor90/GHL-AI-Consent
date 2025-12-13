#!/bin/bash

# Test script for running with virtual display on macOS
# On macOS, we simulate the server environment

echo "🧪 Testing virtual display setup (macOS simulation)..."
echo ""

# Check if script argument is provided
SCRIPT_NAME=${1:-BrowserSubmitForm.js}

# On macOS, we'll just run normally but show it would work with Xvfb on Linux
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "ℹ️  Running on macOS - executing normally"
    echo "   On Ubuntu server, this would use: xvfb-run -a --server-args=\"-screen 0 1920x1080x24\" node $SCRIPT_NAME"
    echo ""
    echo "🚀 Starting test run..."
    echo ""
    
    # Run the script normally on Mac
    node "$SCRIPT_NAME"
    
    EXIT_CODE=$?
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ Test completed successfully!"
        echo ""
        echo "📋 On Ubuntu server, run with:"
        echo "   xvfb-run -a --server-args=\"-screen 0 1920x1080x24\" node $SCRIPT_NAME"
    else
        echo "❌ Test failed with exit code: $EXIT_CODE"
    fi
    echo ""
    
else
    # On Linux, use xvfb-run
    echo "🐧 Running on Linux with Xvfb..."
    echo ""
    
    if ! command -v xvfb-run &> /dev/null; then
        echo "❌ xvfb-run not found. Install with:"
        echo "   sudo apt-get install -y xvfb"
        exit 1
    fi
    
    xvfb-run -a --server-args="-screen 0 1920x1080x24 -ac -nolisten tcp -dpi 96 +extension RANDR" \
        node "$SCRIPT_NAME"
    
    EXIT_CODE=$?
    
    echo ""
    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ Script completed successfully"
    else
        echo "❌ Script failed with exit code: $EXIT_CODE"
    fi
fi

exit $EXIT_CODE
