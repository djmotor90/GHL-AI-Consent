import axios from 'axios';

const API_URL = 'http://localhost:3000';

async function submitConsent(phoneNumber, formUrl = null, siteKey = null) {
    try {
        console.log(`📞 Submitting consent for: ${phoneNumber}`);
        if (formUrl) {
            console.log(`📍 Using custom form: ${formUrl}`);
        }
        console.log('');
        
        const payload = { phoneNumber };
        if (formUrl) payload.formUrl = formUrl;
        if (siteKey) payload.siteKey = siteKey;
        
        const response = await axios.post(`${API_URL}/api/submit-consent`, payload);
        
        console.log('✅ SUCCESS!');
        console.log('Response:', JSON.stringify(response.data, null, 2));
        
        return response.data;
        
    } catch (error) {
        if (error.response) {
            console.log('❌ ERROR:', error.response.status);
            console.log('Response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('❌ ERROR:', error.message);
        }
        throw error;
    }
}

async function checkStatus() {
    try {
        const response = await axios.get(`${API_URL}/api/status`);
        console.log('📊 Server Status:');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.log('❌ Could not connect to server');
        console.log('Make sure the server is running: node server.js');
    }
}

async function checkActive() {
    try {
        const response = await axios.get(`${API_URL}/api/active`);
        console.log('🔄 Active Submissions:');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.log('❌ Could not get active submissions');
    }
}

// Run based on command line arguments
const command = process.argv[2];
const phoneNumber = process.argv[3];
const formUrl = process.argv[4];
const siteKey = process.argv[5];

if (command === 'submit' && phoneNumber) {
    submitConsent(phoneNumber, formUrl, siteKey);
} else if (command === 'status') {
    checkStatus();
} else if (command === 'active') {
    checkActive();
} else {
    console.log('Usage:');
    console.log('  node testClient.js submit <phone-number> [form-url] [site-key]');
    console.log('  node testClient.js status');
    console.log('  node testClient.js active');
    console.log('');
    console.log('Examples:');
    console.log('  node testClient.js submit 8722355215');
    console.log('  node testClient.js submit 8722355215 https://custom-form.com/widget/form/abc123');
    console.log('  node testClient.js status');
}
