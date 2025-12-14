# GHL Consent Form Automation API

Automated REST API server for submitting GoHighLevel consent forms with captcha solving.

## 🚀 Quick Start

### Installation

```bash
npm install
```

### Configuration

Create `.env` file:
```env
PORT=3000
CAPTCHA_API_KEY=your_2captcha_api_key
```

### Start Server

```bash
# Local development
node server.js

# Production with PM2 (recommended)
npm run pm2:start

# On Ubuntu server with Xvfb
xvfb-run -a --server-args="-screen 0 1920x1080x24" node server.js

# Using wrapper script
./runOnServer.sh
```

### PM2 Commands

```bash
# Start server
npm run pm2:start

# Stop server
npm run pm2:stop

# Restart server
npm run pm2:restart

# View logs
npm run pm2:logs

# Monitor status
npm run pm2:status

# Remove from PM2
npm run pm2:delete
```

## 📁 Project Files

### Core Files
- **server.js** - Main API server
- **BrowserSubmitForm.js** - Form automation engine
- **testClient.js** - API testing client

### Deployment
- **runOnServer.sh** - Ubuntu server wrapper
- **testWithXvfb.sh** - Xvfb testing script
- **Dockerfile** - Docker container
- **docker-compose.yml** - Docker compose

### Documentation
- **API_README.md** - Complete API documentation
- **SERVER_DEPLOYMENT.md** - Server deployment guide

## 🔌 API Usage

### Submit Consent Form

```bash
# Default form URL
curl -X POST http://localhost:3000/api/submit-consent \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "8722355215"}'

# Custom form URL
curl -X POST http://localhost:3000/api/submit-consent \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "8722355215",
    "formUrl": "https://your-form.com/widget/form/abc123"
  }'
```

Response:
```json
{
  "success": true,
  "contactId": "BfJkxcI2xwQ3ETO3k586",
  "phoneNumber": "8722355215",
  "formUrl": "https://go.gurver.org/widget/form/0d07wx5ICGuq9dFgCaoM",
  "submissionId": "SUB-1765659254209-d1po14o10",
  "timestamp": "2025-12-13T20:54:23.979Z"
}
```

### Using Test Client

```bash
# Submit consent
node testClient.js submit 8722355215

# Submit with custom form
node testClient.js submit 8722355215 https://your-form.com/widget/form/abc123

# Check server status
node testClient.js status

# Check active submissions
node testClient.js active
```

## 🐧 Ubuntu Server Deployment

### Quick Setup

```bash
# Install Xvfb
sudo apt-get install -y xvfb

# Run with virtual display
xvfb-run -a --server-args="-screen 0 1920x1080x24" node server.js
```

See [SERVER_DEPLOYMENT.md](./SERVER_DEPLOYMENT.md) for complete setup.

## 🐳 Docker Deployment

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f
```

## ✨ Features

- ✅ REST API for consent submissions
- ✅ **Universal - accepts custom form URLs**
- ✅ Automated reCAPTCHA v2 solving (2Captcha)
- ✅ Phone number validation
- ✅ Duplicate submission prevention
- ✅ **PM2 process management - auto-restart & monitoring**
- ✅ Works on headless servers (Xvfb)
- ✅ Stealth plugin for bot detection bypass

## 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/submit-consent` | POST | Submit consent form |
| `/api/status` | GET | Server status |
| `/api/active` | GET | Active submissions |
| `/health` | GET | Health check |

See [API_README.md](./API_README.md) for complete documentation.

## 📚 Documentation

- [API Documentation](./API_README.md) - Complete API reference
- [Server Deployment](./SERVER_DEPLOYMENT.md) - Ubuntu/Docker setup

## 🐛 Troubleshooting

### Port Already in Use
```bash
lsof -ti:3000 | xargs kill -9
```

### Chrome Fails on Server
```bash
sudo apt-get install -y xvfb chromium-browser
```

### Captcha Timeout
- Check 2Captcha balance
- Verify CAPTCHA_API_KEY in .env

## 📄 License

MIT
