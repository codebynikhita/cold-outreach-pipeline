import Table from 'cli-table3';
import readline from 'readline';

/**
 * Safety Checkpoint
 * Renders a clean terminal table of leads with verified emails.
 * Prompts the user to approve all, abort, or selectively exclude leads.
 * 
 * Input: leads (Lead[])
 * Output: approvedLeads (Lead[])
 */
export async function runSafetyCheckpoint(leads) {
  if (!Array.isArray(leads) || leads.length === 0) {
    console.log('\n\x1b[31m[Safety Checkpoint] No verified leads to display.\x1b[0m');
    return [];
  }

  console.log('\n========================================================================');
  console.log('🚨                  SAFETY CHECKPOINT: REVIEW LEADS                    🚨');
  console.log('========================================================================');
  console.log(`Below is a summary of the leads successfully enriched with verified work emails.\n`);

  // Initialize table with custom styling (dark header background, clean borders)
  const table = new Table({
    head: ['#', 'Name', 'Title', 'Company', 'LinkedIn URL', 'Verified Email'],
    colWidths: [4, 20, 25, 15, 35, 30],
    wordWrap: true,
    style: {
      head: ['cyan', 'bold'],
      border: ['grey']
    }
  });

  leads.forEach((lead, index) => {
    table.push([
      index + 1,
      `${lead.firstName} ${lead.lastName}`,
      lead.title,
      lead.company,
      lead.linkedinUrl || 'N/A',
      `\x1b[32m${lead.verifiedEmail}\x1b[0m` // Green color for email
    ]);
  });

  console.log(table.toString());
  console.log(`Total Leads Ready: ${leads.length}\n`);

  // Start CLI prompt
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) => new Promise((resolve) => rl.question(query, resolve));

  try {
    while (true) {
      console.log('Options:');
      console.log(' [y] Approve all leads and trigger Brevo cold-outreach');
      console.log(' [n] Abort pipeline (no emails will be sent)');
      console.log(' [e] Exclude specific leads (e.g., enter "2, 4" to remove those leads)');
      
      const answer = (await question('\nSelect an option: ')).trim().toLowerCase();

      if (answer === 'y') {
        rl.close();
        console.log('\n\x1b[32m✅ Campaign approved! Proceeding to Stage 4 (Brevo)...\x1b[0m');
        return leads;
      }

      if (answer === 'n') {
        rl.close();
        console.log('\n\x1b[31m❌ Campaign aborted. No emails were sent.\x1b[0m');
        return [];
      }

      if (answer === 'e') {
        const excludeInput = await question('Enter lead numbers to exclude (separated by commas, e.g., "1, 3"): ');
        const indicesToExclude = excludeInput
          .split(',')
          .map(num => parseInt(num.trim(), 10) - 1)
          .filter(idx => !isNaN(idx) && idx >= 0 && idx < leads.length);

        if (indicesToExclude.length === 0) {
          console.log('\x1b[33mNo valid lead indices entered. Please try again.\x1b[0m\n');
          continue;
        }

        const approvedLeads = leads.filter((_, idx) => !indicesToExclude.includes(idx));
        const excludedCount = leads.length - approvedLeads.length;

        console.log(`\n\x1b[32mRemoved ${excludedCount} lead(s).\x1b[0m`);
        console.log(`Approved leads list size: ${approvedLeads.length}\n`);

        rl.close();
        
        if (approvedLeads.length === 0) {
          console.log('\x1b[31mAll leads were excluded. Aborting pipeline.\x1b[0m');
          return [];
        }

        const finalConfirm = (await new Promise(resolve => {
          const confirmRl = readline.createInterface({ input: process.stdin, output: process.stdout });
          confirmRl.question(`Confirm and send to the remaining ${approvedLeads.length} leads? (y/n): `, ans => {
            confirmRl.close();
            resolve(ans.trim().toLowerCase());
          });
        }));

        if (finalConfirm === 'y') {
          console.log('\n\x1b[32m✅ Campaign approved! Proceeding to Stage 4 (Brevo)...\x1b[0m');
          return approvedLeads;
        } else {
          console.log('\n\x1b[31m❌ Campaign aborted.\x1b[0m');
          return [];
        }
      }

      console.log('\x1b[31mInvalid option. Please choose y, n, or e.\x1b[0m\n');
    }
  } catch (err) {
    rl.close();
    throw err;
  }
}
