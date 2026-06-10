import dotenv from 'dotenv';
import path from 'path';

// Load environmental variables
dotenv.config();

const config = {
  mockMode: process.env.MOCK_MODE === 'true',
  oceanApiKey: process.env.OCEAN_API_KEY,
  prospeoApiKey: process.env.PROSPEO_API_KEY,
  eazyreachApiKey: process.env.EAZYREACH_API_KEY,
  brevoApiKey: process.env.BREVO_API_KEY,
  senderEmail: process.env.SENDER_EMAIL || 'outreach@example.com',
  senderName: process.env.SENDER_NAME || 'Outreach Bot',
};

// Simple utility to validate keys when NOT in mock mode
export function validateConfig() {
  if (config.mockMode) {
    console.log('\x1b[33m%s\x1b[0m', '⚠️ Running in MOCK_MODE. Simulated API outputs will be used.');
    return true;
  }

  const missingKeys = [];
  const placeholderPatterns = [/your_/i, /mock_/i];

  const keysToVerify = [
    { name: 'OCEAN_API_KEY', val: config.oceanApiKey },
    { name: 'PROSPEO_API_KEY', val: config.prospeoApiKey },
    { name: 'EAZYREACH_API_KEY', val: config.eazyreachApiKey },
    { name: 'BREVO_API_KEY', val: config.brevoApiKey },
  ];

  for (const item of keysToVerify) {
    if (!item.val || placeholderPatterns.some(pat => pat.test(item.val))) {
      missingKeys.push(item.name);
    }
  }

  if (missingKeys.length > 0) {
    console.error('\x1b[31m%s\x1b[0m', '❌ Configuration Validation Failed!');
    console.error('\x1b[31m%s\x1b[0m', `The following environment variables are missing or have placeholders in your .env:`);
    missingKeys.forEach(k => console.error(` - ${k}`));
    console.error('\nEnsure you have configured them correctly in your .env file or set MOCK_MODE=true for testing.\n');
    return false;
  }

  console.log('\x1b[32m%s\x1b[0m', '✅ Configuration successfully validated for Production (Real API Mode).');
  return true;
}

export default config;
