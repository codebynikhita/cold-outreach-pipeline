import axios from 'axios';
import config from '../config.js';

/**
 * Stage 3: Eazyreach email finder
 * Input: leads (Lead[]: { firstName, lastName, title, company, linkedinUrl })
 * Output: leads with verified emails (Lead[]: { firstName, lastName, title, company, linkedinUrl, verifiedEmail })
 */
export async function enrichEmails(leads) {
  if (!Array.isArray(leads) || leads.length === 0) {
    console.log('[Stage 3] No leads provided for Eazyreach email enrichment. Skipping.');
    return [];
  }

  console.log(`[Stage 3] Running Eazyreach enrichment for ${leads.length} leads...`);
  const enrichedLeads = [];

  for (const lead of leads) {
    if (!lead.linkedinUrl) {
      console.log(` ⚠️ Skipping lead ${lead.firstName} ${lead.lastName} (No LinkedIn URL)`);
      continue;
    }

    try {
      console.log(` - Enriching contact: ${lead.firstName} ${lead.lastName} (${lead.linkedinUrl})`);

      if (config.mockMode) {
        // Simulate API network latency
        await new Promise(resolve => setTimeout(resolve, 600));

        // Generate mock verified email
        const cleanCompany = lead.company.toLowerCase().replace(/\s+/g, '');
        const domain = cleanCompany.includes('.') ? cleanCompany : `${cleanCompany}.com`;
        const email = `${lead.firstName.toLowerCase()}.${lead.lastName.toLowerCase()}@${domain}`;
        
        enrichedLeads.push({
          ...lead,
          verifiedEmail: email,
        });
        continue;
      }

      // Real API integration
      // Note: Since Eazyreach does not expose a public developer API documentation, 
      // this is structured as a standard RESTful call to their proposed endpoint.
      // Replace with your exact email finder API (e.g. Tomba, CUFinder, or Eazyreach extension endpoint)
      const response = await axios.post(
        'https://api.eazyreach.io/v1/enrich',
        {
          linkedin_url: lead.linkedinUrl,
          enrich_fields: ['email'],
        },
        {
          headers: {
            'Authorization': `Bearer ${config.eazyreachApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      // Check response and extract email
      if (response.data && response.data.email) {
        enrichedLeads.push({
          ...lead,
          verifiedEmail: response.data.email,
        });
      } else if (response.data && response.data.data && response.data.data.email) {
        enrichedLeads.push({
          ...lead,
          verifiedEmail: response.data.data.email,
        });
      } else {
        console.log(` 🔎 Email not found for ${lead.firstName} ${lead.lastName} via Eazyreach.`);
      }

      // Respect API rate limits with a small sleep
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`\x1b[31m[Stage 3 Error] Failed to enrich lead ${lead.firstName} ${lead.lastName}:\x1b[0m`);
      handleEazyreachError(error);
      // Let the pipeline proceed with other successful enrichments
    }
  }

  console.log(`[Stage 3] Email enrichment complete. Found ${enrichedLeads.length}/${leads.length} verified emails.`);
  return enrichedLeads;
}

/**
 * Handle Eazyreach API errors gracefully
 */
function handleEazyreachError(error) {
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;
    console.error(`Status code: ${status}`, data);
    if (status === 401) {
      console.error('🔑 Invalid Eazyreach API key. Check your Bearer authorization.');
    } else if (status === 429) {
      console.error('⏳ Eazyreach API rate limit hit. Slow down requests.');
    }
  } else {
    console.error('Message:', error.message);
  }
}
