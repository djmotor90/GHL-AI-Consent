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
    
    const response = await axios.post('https://api.2captcha.com/createTask', {
        clientKey: CAPTCHA_API_KEY,
        task: {
            type: 'RecaptchaV2TaskProxyless',
            websiteURL: pageUrl,
            websiteKey: siteKey,
            isInvisible: false
        }
    });
    
    if (!response.data.taskId) {
        throw new Error(`2Captcha submission failed: ${JSON.stringify(response.data)}`);
    }
    
    const taskId = response.data.taskId;
    console.log(`⏳ Captcha submitted to 2Captcha (ID: ${taskId}), waiting for solution...`);
    
    // Poll for solution
    for (let i = 0; i < 60; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const result = await axios.post('https://api.2captcha.com/getTaskResult', {
            clientKey: CAPTCHA_API_KEY,
            taskId: taskId
        });
        
        if (result.data.status === 'ready') {
            console.log(`✅ Captcha solved! Cost: $${result.data.cost}`);
            return result.data.solution.gRecaptchaResponse;
        }
        
        process.stdout.write('.');
    }
    
    throw new Error('Captcha solving timed out after 120 seconds');
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
        
        // Wait for reCAPTCHA v3 to load and potentially trigger v2 challenge
        console.log(`⏳ [${submissionId}] Waiting for reCAPTCHA v3...`);
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        // Check for reCAPTCHA v2 challenge (appears after v3 detects bot)
        const frames = page.frames();
        const recaptchaV2Frame = frames.find(frame =>
            frame.url().includes('google.com/recaptcha') && frame.url().includes('anchor')
        );
        
        if (recaptchaV2Frame) {
            console.log(`🤖 [${submissionId}] reCAPTCHA v2 challenge detected! Solving with 2Captcha...`);
            const v2Token = await solveRecaptchaV2(page, siteKey);
            
            if (v2Token) {
                // Inject the v2 token
                await page.evaluate((token) => {
                    const responseField = document.querySelector('textarea[name="g-recaptcha-response"]');
                    if (responseField) {
                        responseField.value = token;
                        responseField.innerHTML = token;
                    }
                    
                    const responseInput = document.querySelector('input[name="g-recaptcha-response"]');
                    if (responseInput) {
                        responseInput.value = token;
                    }
                    
                    if (window.grecaptcha && window.grecaptcha.getResponse) {
                        window.grecaptcha.getResponse = function() { return token; };
                    }
                }, v2Token);
                
                console.log(`✅ [${submissionId}] v2 token injected`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                throw new Error('Failed to solve reCAPTCHA v2');
            }
        } else {
            console.log(`✅ [${submissionId}] No v2 challenge - v3 passed`);
        }
        
        // Set up response listener
        let responseData = null;
        let responseError = null;
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
                            console.log(`✅ [${submissionId}] Success! Contact ID: ${json.contact?.id}`);
                        } catch (e) {
                            console.log(`⚠️  [${submissionId}] Response is not JSON`);
                        }
                    } else {
                        console.log(`❌ [${submissionId}] Error response: ${text}`);
                        responseError = { error: text, status };
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
                console.log(`🎉 [${submissionId}] Form submitted successfully!`);
                return {
                    success: true,
                    contactId: responseData.contact?.id,
                    data: responseData
                };
            } else if (responseError) {
                throw new Error(`Form submission failed with status ${responseError.status}: ${responseError.error}`);
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
