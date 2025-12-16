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
    
    console.log(`📋 Captcha solve details:
   - Page URL: ${pageUrl}
   - Site Key: ${siteKey}
   - Using 2Captcha NEW API (createTask/getTaskResult)`);
    
    try {
        // Create task using new API
        console.log('Creating 2Captcha task...');
        const createResponse = await axios.post('https://api.2captcha.com/createTask', {
            clientKey: CAPTCHA_API_KEY,
            task: {
                type: 'RecaptchaV2TaskProxyless',
                websiteURL: pageUrl,
                websiteKey: siteKey,
                isInvisible: false
            }
        });
        
        if (createResponse.data.errorId !== 0) {
            throw new Error(`Task creation failed: ${createResponse.data.errorCode}`);
        }
        
        const taskId = createResponse.data.taskId;
        console.log(`⏳ Task created (ID: ${taskId}), waiting for solution...`);
        
        // Poll for result
        let solution = null;
        const maxAttempts = 60; // 2 minutes (2s intervals)
        
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const resultResponse = await axios.post('https://api.2captcha.com/getTaskResult', {
                clientKey: CAPTCHA_API_KEY,
                taskId: taskId
            });
            
            if (resultResponse.data.status === 'ready') {
                solution = resultResponse.data.solution.gRecaptchaResponse;
                console.log(`✅ Captcha solved! (Cost: $${resultResponse.data.cost})`);
                break;
            } else if (resultResponse.data.status === 'processing') {
                // Still processing
                process.stdout.write('.');
            } else if (resultResponse.data.errorId !== 0) {
                throw new Error(`2Captcha error: ${resultResponse.data.errorCode}`);
            }
        }
        
        if (!solution) {
            throw new Error('Captcha solving timed out after 2 minutes');
        }
        
        // Inject the solution token and trigger callbacks
        await page.evaluate((token) => {
            // Set the response token in multiple ways
        const responseElement = document.getElementById('g-recaptcha-response');
        const responseTextarea = document.querySelector('textarea[name="g-recaptcha-response"]');
        
        if (responseElement) {
            responseElement.innerHTML = token;
            responseElement.value = token;
        }
        
        if (responseTextarea) {
            responseTextarea.value = token;
            responseTextarea.innerHTML = token;
        }
        
        // Trigger all possible callbacks
        if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
            Object.keys(window.___grecaptcha_cfg.clients).forEach(key => {
                const client = window.___grecaptcha_cfg.clients[key];
                
                // Trigger the main callback
                if (client && client.callback) {
                    try {
                        client.callback(token);
                    } catch (e) {
                        console.log('Callback error:', e);
                    }
                }
                
                // Mark as solved in client state
                if (client) {
                    client.response = token;
                }
            });
        }
        
        // Look for data-callback attribute
        const recaptchaElements = document.querySelectorAll('[data-callback]');
        recaptchaElements.forEach(elem => {
            const callbackName = elem.getAttribute('data-callback');
            if (callbackName && typeof window[callbackName] === 'function') {
                try {
                    window[callbackName](token);
                } catch (e) {
                    console.log('Data-callback error:', e);
                }
            }
        });
        
        // Dispatch events
        if (responseElement) {
            ['input', 'change'].forEach(eventType => {
                const event = new Event(eventType, { bubbles: true });
                responseElement.dispatchEvent(event);
            });
        }
    }, solution);
    
    console.log('✅ Captcha solution injected into page');
    return solution;
    } catch (error) {
        console.error('❌ Captcha solving error:', error.message);
        throw error;
    }
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
        
        // Fill phone number - one digit at a time like a human
        console.log(`📝 [${submissionId}] Filling phone number: ${phoneNumber}`);
        const phoneSelector = 'input[name="phone"]';
        await page.waitForSelector(phoneSelector);
        await page.click(phoneSelector); // Focus the input first
        
        // Type each digit with human-like delays
        for (const digit of phoneNumber) {
            await page.type(phoneSelector, digit, { delay: Math.floor(Math.random() * 100) + 50 });
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 100) + 50));
        }
        console.log(`✓ [${submissionId}] Phone number entered`);
        
        // Check terms and conditions
        console.log(`📋 [${submissionId}] Checking terms and conditions`);
        const termsSelector = 'input[name="terms_and_conditions"]';
        await page.waitForSelector(termsSelector);
        await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause before clicking
        await page.click(termsSelector);
        console.log(`✓ [${submissionId}] Terms accepted`);
        
        // Wait longer for reCAPTCHA to fully initialize
        console.log(`⏳ [${submissionId}] Waiting for captcha to initialize...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check for reCAPTCHA v2 in iframe
        console.log(`🔍 [${submissionId}] Checking for reCAPTCHA v2...`);
        const v2CaptchaExists = await page.$('iframe[src*="google.com/recaptcha/api2/anchor"]');
        
        if (v2CaptchaExists) {
            console.log(`🤖 [${submissionId}] reCAPTCHA v2 detected, solving...`);
            await solveRecaptchaV2(page, siteKey);
            
            // Wait and verify captcha was solved
            console.log(`⏳ [${submissionId}] Waiting for captcha verification...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check if captcha response token exists
            const captchaToken = await page.evaluate(() => {
                const response = document.getElementById('g-recaptcha-response');
                return response ? response.value : null;
            });
            
            if (captchaToken) {
                console.log(`✅ [${submissionId}] Captcha token verified`);
            } else {
                console.log(`⚠️ [${submissionId}] Warning: No captcha token found`);
            }
        } else {
            console.log(`ℹ️ [${submissionId}] No v2 captcha detected yet, will check after submit attempt...`);
        }
        
        // Set up response listener
        let responseData = null;
        let responseReceived = false;
        let submissionAttempts = 0;
        
        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('forms/submit') && response.request().method() === 'POST') {
                const status = response.status();
                submissionAttempts++;
                
                console.log(`\n📥 [${submissionId}] Form submission response #${submissionAttempts}: ${status}`);
                
                try {
                    const text = await response.text();
                    
                    if (status === 201 || status === 200) {
                        try {
                            const json = JSON.parse(text);
                            responseData = json;
                            responseReceived = true;
                            console.log(`✅ [${submissionId}] Got successful response (201/200)`);
                        } catch (e) {
                            console.log(`⚠️  [${submissionId}] Response is not JSON`);
                        }
                    } else if (status === 429) {
                        console.log(`⚠️  [${submissionId}] Got 429 - captcha required or rate limited`);
                        // Don't mark as received yet - wait for captcha solve attempt
                    } else {
                        responseData = { error: text, status };
                        responseReceived = true;
                        console.log(`❌ [${submissionId}] Got error response: ${status}`);
                    }
                } catch (e) {
                    console.log(`❌ [${submissionId}] Error reading response:`, e.message);
                }
            }
        });
        
        // Submit the form
        console.log(`🔄 [${submissionId}] Clicking submit button...`);
        const submitButton = await page.$('button[type="submit"]');
        
        if (submitButton) {
            await submitButton.click();
            console.log(`✓ [${submissionId}] Submit button clicked, waiting for response...`);
            
            // Wait a moment to see if captcha error appears
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check for "Please fill captcha to proceed" error
            const captchaError = await page.$('text=Please fill captcha to proceed');
            
            if (captchaError || await page.$('iframe[src*="google.com/recaptcha/api2/anchor"]')) {
                console.log(`🚨 [${submissionId}] Captcha required! Checking for v2 challenge...`);
                
                // Wait longer for v2 iframe to fully load and be interactive
                console.log(`⏳ [${submissionId}] Waiting for v2 captcha iframe to fully load...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const v2Iframe = await page.$('iframe[src*="google.com/recaptcha/api2/anchor"]');
                if (v2Iframe) {
                    console.log(`🤖 [${submissionId}] v2 captcha iframe found, solving with 2Captcha...`);
                    
                    try {
                        await solveRecaptchaV2(page, siteKey);
                        
                        // Wait longer for solution to be fully applied
                        console.log(`⏳ [${submissionId}] Waiting 5 seconds for captcha solution to apply...`);
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        
                        // Click submit again after solving captcha
                        console.log(`🔄 [${submissionId}] Re-clicking submit button after captcha solve...`);
                        await submitButton.click();
                        console.log(`✓ [${submissionId}] Submit re-clicked, waiting for response...`);
                    } catch (captchaError) {
                        console.error(`❌ [${submissionId}] Captcha solving failed:`, captchaError.message);
                        throw new Error(`Captcha solving failed: ${captchaError.message}`);
                    }
                } else {
                    console.log(`⚠️ [${submissionId}] Captcha error detected but no v2 iframe found yet`);
                }
            }
            
            // Wait for response
            const waitStart = Date.now();
            const maxWait = 20000; // 20 seconds
            console.log(`⏳ [${submissionId}] Waiting for final response (max ${maxWait/1000}s)...`);
            while (!responseReceived && (Date.now() - waitStart) < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            console.log(`📊 [${submissionId}] Wait complete - Received: ${responseReceived}, Data: ${!!responseData}`);
            
            if (responseData && responseData.contact) {
                console.log(`✅ [${submissionId}] Form submitted successfully with contact!`);
                return {
                    success: true,
                    contactId: responseData.contact?.id,
                    data: responseData
                };
            } else if (responseData && !responseData.error) {
                console.log(`✅ [${submissionId}] Form submitted successfully!`);
                return {
                    success: true,
                    contactId: responseData.contact?.id,
                    data: responseData
                };
            } else if (responseData && responseData.error) {
                throw new Error(`Form submission failed: ${responseData.error} (Status: ${responseData.status})`);
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
