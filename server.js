import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();

// Add stealth plugin
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

const DEFAULT_FORM_URL = 'https://go.gurver.org/widget/form/0d07wx5ICGuq9dFgCaoM';
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || 'c846b4413ffeaf576240b92c8e3cc3a0';
const DEFAULT_SITE_KEY = '6LeDBFwpAAAAAJe8ux9-imrqZ2ueRsEtdiWoDDpX';
const PORT = process.env.PORT || 3001;

// Track active submissions
const activeSubmissions = new Map();

async function solveRecaptchaV2(page, siteKey) {
    console.log('🔍 Detected reCAPTCHA v2, sending to 2Captcha for solving...');
    
    const axios = (await import('axios')).default;
    const pageUrl = page.url();
    
    const submitResponse = await axios.get('http://2captcha.com/in.php', {
        params: {
            key: CAPTCHA_API_KEY,
            method: 'userrecaptcha',
            googlekey: siteKey,
            pageurl: pageUrl,
            json: 1
        }
    });
    
    if (submitResponse.data.status !== 1) {
        throw new Error(`2Captcha submission failed: ${submitResponse.data.request}`);
    }
    
    const captchaId = submitResponse.data.request;
    console.log(`⏳ Captcha submitted to 2Captcha (ID: ${captchaId}), waiting for solution...`);
    
    let solution = null;
    const maxAttempts = 60;
    
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const resultResponse = await axios.get('http://2captcha.com/res.php', {
            params: {
                key: CAPTCHA_API_KEY,
                action: 'get',
                id: captchaId,
                json: 1
            }
        });
        
        if (resultResponse.data.status === 1) {
            solution = resultResponse.data.request;
            console.log('✅ Captcha solved!');
            break;
        } else if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
            throw new Error(`2Captcha error: ${resultResponse.data.request}`);
        }
    }
    
    if (!solution) {
        throw new Error('Captcha solving timed out after 180 seconds');
    }
    
    await page.evaluate((token) => {
        document.getElementById('g-recaptcha-response').innerHTML = token;
        if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
            Object.keys(window.___grecaptcha_cfg.clients).forEach(key => {
                const client = window.___grecaptcha_cfg.clients[key];
                if (client && client.callback) {
                    client.callback(token);
                }
            });
        }
    }, solution);
    
    console.log('✅ Captcha solution injected into page');
    return solution;
}

async function submitConsentForm(phoneNumber, submissionId, formUrl, siteKey) {
    console.log(`\n🚀 [${submissionId}] Starting form submission for: ${phoneNumber}`);
    console.log(`📍 [${submissionId}] Form URL: ${formUrl}`);
    
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    try {
        const page = await browser.newPage();
        
        await page.setViewport({
            width: 1920,
            height: 1080
        });
        
        console.log(`📍 [${submissionId}] Navigating to form...`);
        
        await page.goto(formUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Fill phone number
        console.log(`📝 [${submissionId}] Filling phone number: ${phoneNumber}`);
        const phoneSelector = 'input[name="phone"]';
        await page.waitForSelector(phoneSelector);
        await page.type(phoneSelector, phoneNumber);
        
        // Check terms and conditions
        console.log(`📋 [${submissionId}] Checking terms and conditions`);
        const termsSelector = 'input[name="terms_and_conditions"]';
        await page.waitForSelector(termsSelector);
        await page.click(termsSelector);
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check for reCAPTCHA v2
        const v2CaptchaExists = await page.$('iframe[src*="google.com/recaptcha/api2/anchor"]');
        
        if (v2CaptchaExists) {
            console.log(`🤖 [${submissionId}] reCAPTCHA v2 detected, solving...`);
            await solveRecaptchaV2(page, siteKey);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Set up response listener
        let responseData = null;
        let responseReceived = false;
        
        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('forms/submit') && response.request().method() === 'POST') {
                const status = response.status();
                
                console.log(`\n📥 [${submissionId}] Form submission response: ${status}`);
                
                try {
                    const text = await response.text();
                    
                    if (status === 201 || status === 200) {
                        try {
                            const json = JSON.parse(text);
                            responseData = json;
                            responseReceived = true;
                        } catch (e) {
                            console.log(`⚠️  [${submissionId}] Response is not JSON`);
                        }
                    } else {
                        responseData = { error: text, status };
                        responseReceived = true;
                    }
                } catch (e) {
                    console.log(`❌ [${submissionId}] Error reading response:`, e.message);
                }
            }
        });
        
        // Submit the form
        console.log(`🔄 [${submissionId}] Submitting form...`);
        const submitButton = await page.$('button[type="submit"]');
        
        if (submitButton) {
            await submitButton.click();
            
            // Wait for response
            const waitStart = Date.now();
            while (!responseReceived && (Date.now() - waitStart) < 10000) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            if (responseData) {
                console.log(`✅ [${submissionId}] Form submitted successfully!`);
                return {
                    success: true,
                    contactId: responseData.contact?.id,
                    data: responseData
                };
            } else {
                throw new Error('No response received from form submission');
            }
        } else {
            throw new Error('Could not find submit button');
        }
        
    } catch (error) {
        console.error(`❌ [${submissionId}] Error:`, error.message);
        throw error;
    } finally {
        await browser.close();
        console.log(`👋 [${submissionId}] Browser closed`);
    }
}

// POST endpoint to submit consent form
app.post('/api/submit-consent', async (req, res) => {
    const { phoneNumber, formUrl, siteKey } = req.body;
    
    // Validate phone number
    if (!phoneNumber) {
        return res.status(400).json({
            success: false,
            error: 'Phone number is required'
        });
    }
    
    // Use provided formUrl or default
    const targetFormUrl = formUrl || DEFAULT_FORM_URL;
    const targetSiteKey = siteKey || DEFAULT_SITE_KEY;
    
    // Validate form URL format
    if (!targetFormUrl.startsWith('http://') && !targetFormUrl.startsWith('https://')) {
        return res.status(400).json({
            success: false,
            error: 'Invalid form URL. Must start with http:// or https://'
        });
    }
    
    // Clean phone number (remove non-digits)
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    if (cleanPhone.length < 10) {
        return res.status(400).json({
            success: false,
            error: 'Invalid phone number format. Must be at least 10 digits.'
        });
    }
    
    // Generate unique submission ID
    const submissionId = `SUB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if there's already an active submission for this phone
    if (activeSubmissions.has(cleanPhone)) {
        return res.status(429).json({
            success: false,
            error: 'A submission is already in progress for this phone number',
            submissionId: activeSubmissions.get(cleanPhone)
        });
    }
    
    // Mark as active
    activeSubmissions.set(cleanPhone, submissionId);
    
    try {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📞 New consent request for: ${cleanPhone}`);
        console.log(`🆔 Submission ID: ${submissionId}`);
        console.log(`📍 Form URL: ${targetFormUrl}`);
        console.log(`${'='.repeat(60)}\n`);
        
        const result = await submitConsentForm(cleanPhone, submissionId, targetFormUrl, targetSiteKey);
        
        // Remove from active submissions
        activeSubmissions.delete(cleanPhone);
        
        return res.status(200).json({
            success: true,
            submissionId,
            phoneNumber: cleanPhone,
            formUrl: targetFormUrl,
            contactId: result.contactId,
            message: 'Consent form submitted successfully',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        // Remove from active submissions
        activeSubmissions.delete(cleanPhone);
        
        console.error(`❌ [${submissionId}] Submission failed:`, error.message);
        
        return res.status(500).json({
            success: false,
            submissionId,
            phoneNumber: cleanPhone,
            formUrl: targetFormUrl,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// GET endpoint to check server status
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        activeSubmissions: activeSubmissions.size,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// GET endpoint to check active submissions
app.get('/api/active', (req, res) => {
    const active = Array.from(activeSubmissions.entries()).map(([phone, id]) => ({
        phoneNumber: phone,
        submissionId: id
    }));
    
    res.json({
        count: active.length,
        submissions: active
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Start server
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 GHL Consent Form API Server');
    console.log('='.repeat(60));
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`🔗 API endpoint: http://localhost:${PORT}/api/submit-consent`);
    console.log(`📊 Status endpoint: http://localhost:${PORT}/api/status`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    console.log('='.repeat(60) + '\n');
    console.log('📝 Example request:');
    console.log(`curl -X POST http://localhost:${PORT}/api/submit-consent \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"phoneNumber": "8722355215"}'\n`);
    console.log('📝 With custom form URL:');
    console.log(`curl -X POST http://localhost:${PORT}/api/submit-consent \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"phoneNumber": "8722355215", "formUrl": "https://your-form-url.com"}'\n`);
});
