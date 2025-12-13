# GHL Consent Form API Server

A REST API server that automates consent form submissions with automated captcha solving.

## Quick Start

### Start the Server

```bash
node server.js
```

Server will start on port 3000 (or `PORT` environment variable)

### API Endpoints

#### Submit Consent Form
```bash
POST /api/submit-consent
```

**Request Body:**
```json
{
  "phoneNumber": "8722355215",
  "formUrl": "https://go.gurver.org/widget/form/0d07wx5ICGuq9dFgCaoM",
  "siteKey": "6LeDBFwpAAAAAJe8ux9-imrqZ2ueRsEtdiWoDDpX"
}
```

**Fields:**
- `phoneNumber` (required): Phone number to submit
- `formUrl` (optional): Custom form URL. Uses default if not provided.
- `siteKey` (optional): reCAPTCHA site key. Uses default if not provided.

**Success Response (200):**
```json
{
  "success": true,
  "submissionId": "SUB-1765659254209-d1po14o10",
  "phoneNumber": "8722355215",
  "formUrl": "https://go.gurver.org/widget/form/0d07wx5ICGuq9dFgCaoM",
  "contactId": "BfJkxcI2xwQ3ETO3k586",
  "message": "Consent form submitted successfully",
  "timestamp": "2025-12-13T20:54:23.979Z"
}
```

**Error Response (400/429/500):**
```json
{
  "success": false,
  "error": "Error message",
  "submissionId": "SUB-...",
  "phoneNumber": "8722355215",
  "timestamp": "2025-12-13T20:54:23.979Z"
}
```

#### Check Server Status
```bash
GET /api/status
```

**Response:**
```json
{
  "status": "online",
  "activeSubmissions": 0,
  "uptime": 12.931697375,
  "timestamp": "2025-12-13T20:54:04.538Z"
}
```

#### Check Active Submissions
```bash
GET /api/active
```

**Response:**
```json
{
  "count": 1,
  "submissions": [
    {
      "phoneNumber": "8722355215",
      "submissionId": "SUB-1765659254209-d1po14o10"
    }
  ]
}
```

#### Health Check
```bash
GET /health
```

**Response:**
```json
{
  "status": "healthy"
}
```

## Usage Examples

### Using cURL

```bash
# Submit consent form
curl -X POST http://localhost:3000/api/submit-consent \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "8722355215"}'

# Submit with custom form URL
curl -X POST http://localhost:3000/api/submit-consent \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "8722355215",
    "formUrl": "https://custom-form.com/widget/form/abc123"
  }'

# Check status
curl http://localhost:3000/api/status

# Check active submissions
curl http://localhost:3000/api/active
```

### Using Test Client

```bash
# Submit a phone number
node testClient.js submit 8722355215

# Submit with custom form URL
node testClient.js submit 8722355215 https://custom-form.com/widget/form/abc123

# Check server status
node testClient.js status

# Check active submissions
node testClient.js active
```

### Using JavaScript/Node.js

```javascript
import axios from 'axios';

async function submitConsent(phoneNumber, formUrl = null) {
  const payload = { phoneNumber };
  if (formUrl) payload.formUrl = formUrl;
  
  const response = await axios.post('http://localhost:3000/api/submit-consent', payload);
  
  console.log('Contact ID:', response.data.contactId);
  return response.data;
}

// Default form
submitConsent('8722355215');

// Custom form
submitConsent('8722355215', 'https://custom-form.com/widget/form/abc123');
```

### Using Python

```python
import requests

def submit_consent(phone_number, form_url=None):
    payload = {'phoneNumber': phone_number}
    if form_url:
        payload['formUrl'] = form_url
    
    response = requests.post(
        'http://localhost:3000/api/submit-consent',
        json=payload
    )
    
    if response.status_code == 200:
        data = response.json()
        print(f"Contact ID: {data['contactId']}")
        return data
    else:
        print(f"Error: {response.json()['error']}")

# Default form
submit_consent('8722355215')

# Custom form
submit_consent('8722355215', 'https://custom-form.com/widget/form/abc123')
```

## Running on Ubuntu Server

### With Xvfb (Recommended)

```bash
# Install Xvfb
sudo apt-get install -y xvfb

# Run server with virtual display
xvfb-run -a --server-args="-screen 0 1920x1080x24" node server.js
```

### As a systemd Service

Create `/etc/systemd/system/ghl-consent-api.service`:

```ini
[Unit]
Description=GHL Consent Form API Server
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/opt/GHLconsent
Environment="DISPLAY=:99"
Environment="PORT=3000"
ExecStart=/usr/bin/xvfb-run -a --server-args="-screen 0 1920x1080x24" /usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ghl-consent-api
sudo systemctl start ghl-consent-api
sudo systemctl status ghl-consent-api
```

### With Docker

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Environment Variables

Create a `.env` file:

```env
PORT=3000
CAPTCHA_API_KEY=your_2captcha_api_key_here
NODE_ENV=production
```

## Features

- ✅ REST API for consent form submissions
- ✅ Automated captcha solving (2Captcha integration)
- ✅ Phone number validation and cleaning
- ✅ Duplicate submission prevention
- ✅ Detailed logging with submission IDs
- ✅ Active submission tracking
- ✅ Health check endpoints
- ✅ Stealth plugin for bot detection bypass
- ✅ Works on headless servers with Xvfb

## Rate Limiting & Concurrency

- One submission per phone number at a time
- Returns 429 if phone number already has active submission
- Each submission gets unique ID for tracking
- Browser instances are cleaned up after each submission

## Error Handling

The API handles various error scenarios:

- **400**: Invalid or missing phone number
- **429**: Duplicate submission in progress
- **500**: Form submission failed (captcha timeout, network issues, etc.)

## Monitoring

```bash
# Watch server logs
tail -f /var/log/ghl-consent-api.log

# Check active submissions
curl http://localhost:3000/api/active

# Monitor system resources
htop  # Look for node and chrome processes
```

## Performance Considerations

- Each submission takes 10-30 seconds (depending on captcha)
- Chrome process uses ~200-500MB RAM per submission
- Recommend at least 2GB RAM for reliable operation
- Consider adding a queue system for high volume (e.g., BullMQ, Redis)

## Troubleshooting

### Port already in use
```bash
# Find process using port 3000
lsof -ti:3000

# Kill the process
kill -9 $(lsof -ti:3000)
```

### Chrome fails to launch on server
```bash
# Install missing dependencies
sudo apt-get install -y $(apt-cache depends chromium-browser | grep Depends | sed "s/.*ends:\ //" | tr '\n' ' ')
```

### 2Captcha timeout
- Check your 2Captcha balance
- Increase timeout in server.js (maxAttempts variable)
- Verify CAPTCHA_API_KEY in .env file

## Security Notes

- This server should be behind a reverse proxy (nginx)
- Add API authentication for production use
- Rate limit the API endpoints
- Monitor for abuse/unusual patterns
- Keep sensitive data (API keys) in environment variables

## Support

For issues or questions, check the logs and submission IDs for debugging.
