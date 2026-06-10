import axios from 'axios';
import config from '../config.js';

/**
 * Stage 4: Brevo email outreach
 * Input: leads (Lead[]: { firstName, lastName, title, company, verifiedEmail })
 * Output: result summary { successCount, failCount }
 */
export async function sendOutreachEmails(leads) {
  if (!Array.isArray(leads) || leads.length === 0) {
    console.log('[Stage 4] No leads approved for Brevo outreach. Exiting.');
    return { successCount: 0, failCount: 0 };
  }

  console.log(`\n[Stage 4] Initiating Brevo cold outreach for ${leads.length} leads...`);
  let successCount = 0;
  let failCount = 0;

  for (const lead of leads) {
    const recipientName = `${lead.firstName} ${lead.lastName}`;
    console.log(` - Sending personalized email to: ${recipientName} <${lead.verifiedEmail}>`);

    // Draft a personalized email (support dynamic draft compile from SaaS server)
    const subject = lead.draftSubject || `Question for ${lead.firstName} re: ${lead.company}'s growth`;
    const htmlContent = lead.draftBody 
      ? `<html><body>${lead.draftBody.replace(/\n/g, '<br>')}</body></html>`
      : `
      <html>
        <body>
          <p>Hi ${lead.firstName},</p>
          <p>I noticed your profile as the <strong>${lead.title}</strong> at <strong>${lead.company}</strong> and wanted to reach out.</p>
          <p>We've been helping similar companies scale their automation pipelines, and I wanted to see if you have 5 minutes this Thursday for a brief chat.</p>
          <p>Best regards,<br>${config.senderName}</p>
        </body>
      </html>
    `;

    if (config.mockMode) {
      // Simulate API network latency
      await new Promise(resolve => setTimeout(resolve, 400));
      console.log(`   \x1b[32m[MOCK SENT]\x1b[0m Email sent to ${lead.verifiedEmail}`);
      successCount++;
      continue;
    }

    // Real API integration
    try {
      const response = await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
          sender: {
            name: config.senderName,
            email: config.senderEmail,
          },
          to: [
            {
              email: lead.verifiedEmail,
              name: recipientName,
            },
          ],
          subject: subject,
          htmlContent: htmlContent,
        },
        {
          headers: {
            'api-key': config.brevoApiKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      // Brevo returns standard messageId on success
      if (response.data && (response.data.messageId || response.status === 201 || response.status === 200)) {
        console.log(`   \x1b[32m[SUCCESS]\x1b[0m Email delivered via Brevo (MsgId: ${response.data.messageId || 'N/A'})`);
        successCount++;
      } else {
        console.log(`   \x1b[33m[WARNING]\x1b[0m Unexpected response status from Brevo:`, response.status);
        failCount++;
      }

      // Smart Throttling: Introduce a randomized jitter delay (between 2s and 7s)
      // to mimic natural human behavior and protect domain sending reputation
      const minDelay = 2000;
      const maxDelay = 7000;
      const jitter = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      console.log(`   ⏳ Throttling: sleeping for ${(jitter / 1000).toFixed(1)}s...`);
      await new Promise(resolve => setTimeout(resolve, jitter));

    } catch (error) {
      console.error(`   \x1b[31m[FAILED]\x1b[0m Failed to send email to ${lead.verifiedEmail}:`);
      handleBrevoError(error);
      failCount++;
    }
  }

  console.log(`\n[Stage 4] Outreach campaign complete: ${successCount} sent, ${failCount} failed.`);
  return { successCount, failCount };
}

/**
 * Handle Brevo API errors gracefully
 */
function handleBrevoError(error) {
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;
    console.error(`   Status code: ${status}`, data);
    if (status === 401) {
      console.error('   🔑 Invalid Brevo API key. Check api-key headers.');
    } else if (status === 403) {
      console.error('   🚫 Forbidden. Ensure your sending IP or domain is authenticated in Brevo.');
    }
  } else {
    console.error('   Message:', error.message);
  }
}
