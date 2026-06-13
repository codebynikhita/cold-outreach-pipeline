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
  const placeholderPatterns = [/your_/i, /mock_/i, /simulation/i];

  const keysToVerify = [
    { name: 'OCEAN_API_KEY', val: config.oceanApiKey, stage: 'Stage 1 (Ocean.io lookalikes)' },
    { name: 'PROSPEO_API_KEY', val: config.prospeoApiKey, stage: 'Stage 2 (Prospeo decision-makers)' },
    { name: 'EAZYREACH_API_KEY', val: config.eazyreachApiKey, stage: 'Stage 3 (Eazyreach email finder)' },
    { name: 'BREVO_API_KEY', val: config.brevoApiKey, stage: 'Stage 4 (Brevo email sender)' },
  ];

  for (const item of keysToVerify) {
    if (!item.val || placeholderPatterns.some(pat => pat.test(item.val))) {
      missingKeys.push(item);
    }
  }

  if (missingKeys.length > 0) {
    console.log('\x1b[33m%s\x1b[0m', '⚠️ Running in HYBRID Fallback Mode:');
    missingKeys.forEach(k => {
      console.log(` - ${k.name} is missing or placeholder. ${k.stage} will run in SIMULATED mode.`);
    });
  } else {
    console.log('\x1b[32m%s\x1b[0m', '✅ Configuration successfully validated for full Production (All Real APIs).');
  }

  return true;
}

export default config;
