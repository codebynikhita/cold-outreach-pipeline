import axios from 'axios';
import config from '../config.js';
import { filterValidMailDomains } from '../utils/dnsValidator.js';

/**
 * Stage 1: Ocean.io lookalike finder
 * Input: seedDomain (string)
 * Output: array of company domains (string[])
 */
export async function getLookalikeDomains(seedDomain) {
  if (!seedDomain) {
    throw new Error('Seed domain is required for Ocean.io lookalike search.');
  }

  console.log(`[Stage 1] Querying Ocean.io for lookalikes of: "${seedDomain}"...`);
  let lookalikes = [];

  if (config.mockMode) {
    // Simulate API network latency
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Dynamic mock response based on common SaaS seed domains
    if (seedDomain.includes('google')) {
      lookalikes = ['microsoft.com', 'apple.com', 'meta.com', 'amazon.com'];
    } else if (seedDomain.includes('stripe')) {
      lookalikes = ['paypal.com', 'adyen.com', 'block.xyz', 'checkout.com'];
    } else if (seedDomain.includes('slack')) {
      lookalikes = ['zoom.us', 'microsoft.com', 'asana.com', 'monday.com'];
    } else {
      // Default mock lookalikes
      const name = seedDomain.split('.')[0];
      lookalikes = [
        `competitor1-of-${name}.com`,
        `competitor2-of-${name}.com`,
        `competitor3-of-${name}.com`
      ];
    }
  } else {
    // Real API integration
    try {
      // Ocean.io POST lookalikes endpoint
      const response = await axios.post(
        'https://api.ocean.io/v1/companies/lookalikes',
        {
          domain: seedDomain,
          limit: 5,
        },
        {
          headers: {
            'Authorization': `Bearer ${config.oceanApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10s timeout
        }
      );

      // Assuming API returns an array of company objects with a domain property
      if (response.data && Array.isArray(response.data.companies)) {
        lookalikes = response.data.companies.map(c => c.domain).filter(Boolean);
      } else if (response.data && Array.isArray(response.data)) {
        lookalikes = response.data;
      }
    } catch (error) {
      handleOceanError(error);
      // Return empty array instead of crashing, allowing pipeline to handle graceful fallback or stop
      return [];
    }
  }

  // Pre-flight Domain Validation: Filter out domains without active mail servers
  const validLookalikes = await filterValidMailDomains(lookalikes, config.mockMode);
  return validLookalikes;
}

/**
 * Handle Ocean.io API errors gracefully
 */
function handleOceanError(error) {
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;
    console.error(`\x1b[31m[Stage 1 Error] Ocean.io API returned status ${status}:\x1b[0m`, data);
    
    if (status === 401) {
      console.error('🔑 Invalid Ocean.io API Key. Please verify in your .env file.');
    } else if (status === 429) {
      console.error('⏳ Ocean.io API Rate Limit exceeded. Consider increasing rate limits or adding a delay.');
    }
  } else if (error.request) {
    console.error('🌐 Ocean.io API network error. No response received from server.');
  } else {
    console.error('⚙️ Ocean.io configuration error:', error.message);
  }
}
