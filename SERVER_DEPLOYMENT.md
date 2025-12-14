# Running on Ubuntu Headless Server

## Quick Start

### Method 1: Direct with Xvfb (Simplest)

```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y xvfb

# Run with virtual display
xvfb-run -a --server-args="-screen 0 1920x1080x24" node BrowserSubmitForm.js
```

### Method 2: Using the wrapper script (Recommended)

```bash
# Make executable (first time only)
chmod +x runOnServer.sh

# Run the script
./runOnServer.sh BrowserSubmitForm.js
```

### Method 3: Docker (Production)

```bash
# Build the image
docker-compose build

# Run the container
docker-compose up

# Or run once
docker-compose run --rm consent-form
```

## Full Server Setup

### 1. Install Node.js

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Install Chrome Dependencies

```bash
sudo apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils
```

### 3. Install Xvfb

```bash
sudo apt-get install -y xvfb
```

### 4. Clone and Setup

```bash
# Clone your repo
cd /opt
git clone <your-repo-url> GHLconsent
cd GHLconsent

# Install dependencies
npm install

# Setup environment
cp .env.example .env
nano .env  # Add your API keys
```

### 5. Test Run

```bash
# Test with Xvfb
xvfb-run -a --server-args="-screen 0 1920x1080x24" node BrowserSubmitForm.js
```

## Running as a Service with PM2 (Recommended)

PM2 is the recommended way to run the server in production. It provides:
- Auto-restart on crashes
- Log management
- Monitoring
- Zero-downtime restarts
- Startup script generation

### Install PM2 Globally

```bash
sudo npm install -g pm2
```

### Start the Server

```bash
# Start server
npm run pm2:start

# Or use PM2 directly
pm2 start ecosystem.config.js
```

### Setup Auto-Start on Server Reboot

```bash
# Generate startup script
pm2 startup

# Copy and run the command it outputs (will be something like):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u your-username --hp /home/your-username

# Save PM2 process list
pm2 save
```

### PM2 Commands

```bash
# View status
pm2 status
pm2 list

# View logs
pm2 logs ghl-consent-api
pm2 logs --lines 100

# Monitor in real-time
pm2 monit

# Restart
pm2 restart ghl-consent-api

# Stop
pm2 stop ghl-consent-api

# Delete from PM2
pm2 delete ghl-consent-api

# Reload with zero downtime
pm2 reload ghl-consent-api
```

## Running as a Service (systemd - Alternative)

If you prefer systemd instead of PM2:

Create `/etc/systemd/system/ghl-consent.service`:

```ini
[Unit]
Description=GHL Consent Form Automation
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/opt/GHLconsent
Environment="DISPLAY=:99"
ExecStart=/usr/bin/xvfb-run -a --server-args="-screen 0 1920x1080x24" /usr/bin/node server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ghl-consent
sudo systemctl start ghl-consent
sudo systemctl status ghl-consent
```

## Troubleshooting

### Chrome fails to launch

```bash
# Check Chrome dependencies
ldd $(which google-chrome) | grep "not found"

# Or let Puppeteer download Chromium
npm install puppeteer  # Will download bundled Chromium
```

### Xvfb issues

```bash
# Check if Xvfb is running
ps aux | grep Xvfb

# Kill stale Xvfb processes
pkill Xvfb

# Test Xvfb manually
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99
node BrowserSubmitForm.js
```

### Memory issues on small servers

Add swap space:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## Performance Tips

1. **Use the wrapper script** - It handles cleanup automatically
2. **Monitor memory** - Chrome can use 200-500MB RAM
3. **Add retry logic** - Network issues are common on servers
4. **Use cron for scheduled runs**:

```bash
# Edit crontab
crontab -e

# Run every hour
0 * * * * cd /opt/GHLconsent && /usr/bin/xvfb-run -a --server-args="-screen 0 1920x1080x24" /usr/bin/node BrowserSubmitForm.js >> /var/log/ghl-consent.log 2>&1
```

## Why Xvfb Works

Xvfb (X Virtual Framebuffer) creates a virtual display that Chrome can render to. From Chrome's perspective, it's running in a normal graphical environment with `headless: false`, which bypasses the reCAPTCHA detection, but no actual screen is needed.

**Key insight**: `headless: false` + Xvfb = Works on headless server ✅
