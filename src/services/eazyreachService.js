import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SUPPRESSION_FILE = path.join(__dirname, '..', '..', 'data', 'suppression_list.json');

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

  const suppressionList = fs.existsSync(SUPPRESSION_FILE)
    ? JSON.parse(fs.readFileSync(SUPPRESSION_FILE, 'utf8'))
    : [];

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
        
        const emailLower = email.toLowerCase();
        const domainLower = lead.company.toLowerCase();
        const isSuppressed = suppressionList.some(item => {
          const itemLower = item.toLowerCase();
          return emailLower === itemLower || domainLower === itemLower || emailLower.endsWith('@' + itemLower);
        });

        if (isSuppressed) {
          console.log(`  🚨 [Suppression Check] Contact ${lead.firstName} ${lead.lastName} (${email}) matches item in global suppression list and has been blocked.`);
        } else {
          enrichedLeads.push({
            ...lead,
            verifiedEmail: email,
          });
        }
        continue;
      }

      // Real API integration
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
      const emailResolved = response.data?.email || response.data?.data?.email;
      if (emailResolved) {
        const emailLower = emailResolved.toLowerCase();
        const domainLower = lead.company.toLowerCase();
        const isSuppressed = suppressionList.some(item => {
          const itemLower = item.toLowerCase();
          return emailLower === itemLower || domainLower === itemLower || emailLower.endsWith('@' + itemLower);
        });

        if (isSuppressed) {
          console.log(`  🚨 [Suppression Check] Contact ${lead.firstName} ${lead.lastName} (${emailResolved}) matches item in global suppression list and has been blocked.`);
        } else {
          enrichedLeads.push({
            ...lead,
            verifiedEmail: emailResolved,
          });
        }
      } else {
        console.log(` 🔎 Email not found for ${lead.firstName} ${lead.lastName} via Eazyreach.`);
      }

      // Respect API rate limits with a small sleep
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`\x1b[31m[Stage 3 Error] Failed to enrich lead ${lead.firstName} ${lead.lastName}:\x1b[0m`);
      handleEazyreachError(error);
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
