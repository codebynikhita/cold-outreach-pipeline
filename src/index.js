import readline from 'readline';
import { validateConfig } from './config.js';
import { getLookalikeDomains } from './services/oceanService.js';
import { findDecisionMakers } from './services/prospeoService.js';
import { enrichEmails } from './services/eazyreachService.js';
import { runSafetyCheckpoint } from './safetyCheckpoint.js';
import { sendOutreachEmails } from './services/brevoService.js';

/**
 * Main Orchestration Loop
 */
async function main() {
  console.log('\n🚀 Starting Automated Cold-Outreach Pipeline CLI...');

  // 0. Validate configuration first
  if (!validateConfig()) {
    process.exit(1);
  }

  // Retrieve seed domain from CLI arguments or prompt user
  let seedDomain = process.argv[2];

  if (!seedDomain) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    seedDomain = await new Promise((resolve) => {
      rl.question('\n🌐 Enter seed domain to start pipeline (e.g., stripe.com): ', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  if (!seedDomain) {
    console.error('\x1b[31m❌ Error: Seed domain is required to run the pipeline.\x1b[0m');
    process.exit(1);
  }

  console.log(`\nStarting pipeline for seed domain: \x1b[36m${seedDomain}\x1b[0m\n`);

  try {
    // -------------------------------------------------------------
    // Stage 1: Ocean.io (Lookalike Domains Search)
    // -------------------------------------------------------------
    let domains = [];
    try {
      domains = await getLookalikeDomains(seedDomain);
      if (domains.length === 0) {
        console.log('\n⚠️ No lookalike company domains returned by Ocean.io. Pipeline stopping.');
        process.exit(0);
      }
      console.log(`\x1b[32m✔ [Stage 1 Complete] Found lookalike domains: ${domains.join(', ')}\x1b[0m\n`);
    } catch (err) {
      console.error('\x1b[31m❌ Error in Stage 1 (Ocean.io):', err.message, '\x1b[0m');
      console.error('Aborting pipeline run.');
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Stage 2: Prospeo (C-Suite / VP Contacts Finder)
    // -------------------------------------------------------------
    let rawLeads = [];
    try {
      rawLeads = await findDecisionMakers(domains);
      if (rawLeads.length === 0) {
        console.log('\n⚠️ No C-Suite or VP level decision-makers found by Prospeo. Pipeline stopping.');
        process.exit(0);
      }
      console.log(`\x1b[32m✔ [Stage 2 Complete] Found ${rawLeads.length} leads with LinkedIn profiles.\x1b[0m\n`);
    } catch (err) {
      console.error('\x1b[31m❌ Error in Stage 2 (Prospeo):', err.message, '\x1b[0m');
      console.error('Aborting pipeline run.');
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Stage 3: Eazyreach (LinkedIn to Email Enrichment)
    // -------------------------------------------------------------
    let enrichedLeads = [];
    try {
      enrichedLeads = await enrichEmails(rawLeads);
      if (enrichedLeads.length === 0) {
        console.log('\n⚠️ No verified emails were resolved by Eazyreach. Pipeline stopping.');
        process.exit(0);
      }
      console.log(`\x1b[32m✔ [Stage 3 Complete] Resolved ${enrichedLeads.length} verified work emails.\x1b[0m\n`);
    } catch (err) {
      console.error('\x1b[31m❌ Error in Stage 3 (Eazyreach):', err.message, '\x1b[0m');
      console.error('Aborting pipeline run.');
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Safety Checkpoint (Visual Review & Prompt Confirmation)
    // -------------------------------------------------------------
    let approvedLeads = [];
    try {
      approvedLeads = await runSafetyCheckpoint(enrichedLeads);
      if (approvedLeads.length === 0) {
        console.log('\nℹ️ Campaign stopped at Safety Checkpoint. No emails sent.');
        process.exit(0);
      }
    } catch (err) {
      console.error('\x1b[31m❌ Error in Safety Checkpoint:', err.message, '\x1b[0m');
      console.error('Aborting pipeline for safety.');
      process.exit(1);
    }

    // -------------------------------------------------------------
    // Stage 4: Brevo (Personalized Outreach Emails Send)
    // -------------------------------------------------------------
    try {
      const { successCount, failCount } = await sendOutreachEmails(approvedLeads);
      console.log(`\n\x1b[32m🎉 Pipeline completed! Successfully sent ${successCount} emails, failed ${failCount}.\x1b[0m\n`);
    } catch (err) {
      console.error('\x1b[31m❌ Error in Stage 4 (Brevo):', err.message, '\x1b[0m');
      process.exit(1);
    }

  } catch (error) {
    console.error('\x1b[31m❌ Unexpected Pipeline Crash:', error.message, '\x1b[0m');
    process.exit(1);
  }
}

// Run the script
main();
