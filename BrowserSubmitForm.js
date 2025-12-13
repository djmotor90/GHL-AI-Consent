import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import { config } from 'dotenv';

puppeteer.use(StealthPlugin());

config();

const API_KEY = process.env.CAPTCHA_API_KEY;
const formUrl = 'https://go.gurver.org/widget/form/0d07wx5ICGuq9dFgCaoM';
const siteKey = '6LeDBFwpAAAAAJe8ux9-imrqZ2ueRsEtdiWoDDpX';

async function solveRecaptchaV2(pageUrl, siteKey) {
  console.log('🔐 Solving reCAPTCHA v2...');

  const response = await axios.post('https://api.2captcha.com/createTask', {
    clientKey: API_KEY,
    task: {
      type: 'RecaptchaV2TaskProxyless',
      websiteURL: pageUrl,
      websiteKey: siteKey,
      isInvisible: false
    }
  });

  const taskId = response.data.taskId;

  for (let i = 0; i < 60; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const result = await axios.post('https://api.2captcha.com/getTaskResult', {
      clientKey: API_KEY,
      taskId: taskId
    });

    if (result.data.status === 'ready') {
      console.log(`✅ v2 solved! Cost: $${result.data.cost}`);
      return result.data.solution.gRecaptchaResponse;
    }

    process.stdout.write('.');
  }

  throw new Error('v2 solving timed out');
}

async function submitFormPhoneOnly() {
  console.log('📱 FORM SUBMISSION - PHONE ONLY');
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage'
    ]
  });

  try {
    const page = await browser.newPage();

    let submissionResponse = null;
    page.on('response', async (response) => {
      if (response.url().includes('/forms/submit') && response.request().method() === 'POST') {
        try {
          const text = await response.text();
          try {
            submissionResponse = JSON.parse(text);
          } catch (e) {
            submissionResponse = { status: response.status(), text: text.substring(0, 200) };
          }
          console.log('\n📥 SUBMISSION RESPONSE:');
          console.log('Status:', response.status());
          if (submissionResponse.contactId) {
            console.log('✅ Contact ID:', submissionResponse.contactId);
          }
        } catch (e) {
          // ignore
        }
      }
    });

    console.log('🌐 Opening form...');
    await page.goto(formUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('input[name="phone"]', { timeout: 10000 });

    console.log('\n✍️  Filling phone number...');
    await page.type('input[name="phone"]', '8722355215', { delay: 50 });
    console.log('✅ Phone number filled');

    const checkbox = await page.$('input[name="terms_and_conditions"]');
    if (checkbox) {
      await checkbox.click();
      console.log('✅ Checkbox checked');
    }

    // Wait for reCAPTCHA v3
    console.log('\n⏳ Waiting for reCAPTCHA v3...');
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Check for v2 challenge
    const frames = page.frames();
    const recaptchaV2Frame = frames.find(frame =>
      frame.url().includes('google.com/recaptcha') && frame.url().includes('anchor')
    );

    if (recaptchaV2Frame) {
      console.log('🤖 v2 challenge detected! Solving with 2Captcha...');

      const v2Token = await solveRecaptchaV2(formUrl, siteKey);

      if (v2Token) {
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

        console.log('✅ v2 token injected');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log('❌ Failed to solve v2 captcha');
        return { success: false, error: 'v2 captcha solving failed' };
      }
    } else {
      console.log('✅ No v2 challenge - v3 worked');
    }

    console.log('\n🚀 Submitting form...');
    const submitButton = await page.$('button[type="submit"]');
    if (submitButton) {
      await submitButton.click();
    } else {
      throw new Error('Submit button not found');
    }

    console.log('⏳ Waiting for response...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    if (submissionResponse) {
      console.log('\n✅ Response captured!');
      console.log('Status:', submissionResponse.status);
      if (submissionResponse.contactId) {
        console.log('🎉 SUCCESS!');
        console.log('Contact ID:', submissionResponse.contactId);
        return { success: true, contactId: submissionResponse.contactId };
      } else {
        console.log('Full response:', submissionResponse);
        return { success: false };
      }
    } else {
      console.log('\n⚠️  No submission response captured');
      return { success: false };
    }

  } catch (error) {
    console.log('\n❌ ERROR:', error.message);
    return { success: false };
  } finally {
    await browser.close();
  }
}

submitFormPhoneOnly();
