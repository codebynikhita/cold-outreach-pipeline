import axios from 'axios';
import config from '../config.js';

/**
 * Stage 2: Prospeo decision-maker search
 * Input: domains (string[])
 * Output: array of Lead objects { firstName, lastName, title, company, linkedinUrl }
 */
export async function findDecisionMakers(domains) {
  if (!Array.isArray(domains) || domains.length === 0) {
    console.log('[Stage 2] No domains provided to Prospeo. Skipping.');
    return [];
  }

  console.log(`[Stage 2] Searching Prospeo for decision-makers at ${domains.length} companies...`);
  const leads = [];

  for (const domain of domains) {
    try {
      console.log(` - Finding decision-makers for domain: "${domain}"`);

      const isMock = config.mockMode || 
                     !config.prospeoApiKey || 
                     ['mock', 'simulation', ''].includes(config.prospeoApiKey.toLowerCase().trim()) || 
                     config.prospeoApiKey.toLowerCase().startsWith('your_');

      if (isMock) {
        // Simulate API network latency
        await new Promise(resolve => setTimeout(resolve, 800));

        // Generate mock C-level and VP contacts
        const mockLeads = getMockLeadsForDomain(domain);
        leads.push(...mockLeads);
        continue;
      }

      // Real API integration
      // We use Prospeo /search-person endpoint to find contacts at this domain
      const response = await axios.post(
        'https://api.prospeo.io/search-person',
        {
          filters: {
            // Filter by the company's domain
            person_search: [domain],
            // Target C-level and VP decision-makers
            person_seniority: ['cxo', 'vp', 'director'],
          },
          page: 1,
        },
        {
          headers: {
            'X-KEY': config.prospeoApiKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      // Parse the results from the Prospeo API response structure
      if (response.data && response.data.results && Array.isArray(response.data.results)) {
        const domainLeads = response.data.results.map(item => {
          return {
            firstName: item.first_name || '',
            lastName: item.last_name || '',
            title: item.title || 'Decision Maker',
            company: domain,
            linkedinUrl: item.linkedin_url || null,
          };
        }).filter(lead => lead.linkedinUrl); // Must have LinkedIn URL for Stage 3 (Eazyreach)

        leads.push(...domainLeads);
      }

      // Small delay between requests to be respectful of rate limits
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`\x1b[31m[Stage 2 Error] Failed to search contacts for "${domain}":\x1b[0m`);
      handleProspeoError(error);
      // Continue loop for other domains instead of throwing error and crashing
    }
  }

  console.log(`[Stage 2] Found ${leads.length} total decision-makers with LinkedIn profiles.`);
  return leads;
}

/**
 * Helper to generate mock leads
 */
function getMockLeadsForDomain(domain) {
  const companyName = domain.split('.')[0];
  const capitalizedCompany = companyName.charAt(0).toUpperCase() + companyName.slice(1);

  // Generate realistic mock people names based on the company domain
  if (domain.includes('microsoft')) {
    return [
      { firstName: 'Satya', lastName: 'Nadella', title: 'CEO', company: capitalizedCompany, linkedinUrl: 'https://www.linkedin.com/in/satyanadella' },
      { firstName: 'Judson', lastName: 'Althoff', title: 'Chief Commercial Officer', company: capitalizedCompany, linkedinUrl: 'https://www.linkedin.com/in/judsonalthoff' }
    ];
  } else if (domain.includes('apple')) {
    return [
      { firstName: 'Tim', lastName: 'Cook', title: 'CEO', company: capitalizedCompany, linkedinUrl: 'https://www.linkedin.com/in/timcook' }
    ];
  } else if (domain.includes('paypal')) {
    return [
      { firstName: 'Dan', lastName: 'Schulman', title: 'Board Director (Ex-CEO)', company: capitalizedCompany, linkedinUrl: 'https://www.linkedin.com/in/danschulman' },
      { firstName: 'Alex', lastName: 'Chriss', title: 'President & CEO', company: capitalizedCompany, linkedinUrl: 'https://www.linkedin.com/in/alexchriss' }
    ];
  }

  // Generic fallback leads
  return [
    {
      firstName: 'Jane',
      lastName: 'Doe',
      title: 'VP of Sales & Growth',
      company: capitalizedCompany,
      linkedinUrl: `https://www.linkedin.com/in/jane-doe-${companyName}`
    },
    {
      firstName: 'John',
      lastName: 'Smith',
      title: 'Co-Founder & CEO',
      company: capitalizedCompany,
      linkedinUrl: `https://www.linkedin.com/in/john-smith-${companyName}`
    }
  ];
}

/**
 * Handle Prospeo API errors gracefully
 */
function handleProspeoError(error) {
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;
    console.error(`Status code: ${status}`, data);
    if (status === 401) {
      console.error('🔑 Invalid Prospeo API Key. Check your X-KEY configuration.');
    } else if (status === 429) {
      console.error('⏳ Prospeo rate limit hit. Slow down requests.');
    }
  } else {
    console.error('Message:', error.message);
  }
}
