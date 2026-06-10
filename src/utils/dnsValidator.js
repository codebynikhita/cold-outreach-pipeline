import dns from 'dns';

/**
 * Pre-flight Domain Validation
 * Verifies if a domain has active MX (Mail Exchange) records.
 * Bypasses DNS check in mock/simulation runs to preserve mock data pipeline tests.
 * 
 * @param {string} domain - Domain name to check (e.g. microsoft.com)
 * @param {boolean} isMock - True if running in simulation/mock mode
 * @returns {Promise<boolean>} - True if domain is valid and has active mail servers
 */
export async function validateMailServers(domain, isMock = false) {
  if (isMock) {
    // Skip DNS query for simulated lookalike competitors that do not exist
    return true;
  }

  if (!domain) return false;
  
  // Clean domain name string
  const cleanDomain = domain.trim().toLowerCase();

  try {
    const records = await dns.promises.resolveMx(cleanDomain);
    
    // Check if at least one MX server with a valid hostname is returned
    if (Array.isArray(records) && records.length > 0) {
      const activeServers = records.filter(r => r.exchange && r.exchange.trim().length > 0);
      return activeServers.length > 0;
    }
    
    return false;
  } catch (error) {
    // DNS errors (e.g., ENOTFOUND, ENODATA) indicate no mail servers exist
    console.log(` 🔎 [Pre-flight DNS] Domain "${cleanDomain}" failed MX check: ${error.code || error.message}`);
    return false;
  }
}

/**
 * Validate a batch of domains concurrently
 */
export async function filterValidMailDomains(domains, isMock = false) {
  if (!Array.isArray(domains) || domains.length === 0) return [];
  if (isMock) return domains; // Return directly in simulation mode

  console.log(`[Pre-flight DNS] Resolving MX records for ${domains.length} domains...`);
  
  const results = await Promise.allSettled(
    domains.map(async (domain) => {
      const isValid = await validateMailServers(domain, false);
      return { domain, isValid };
    })
  );

  const validDomains = [];
  results.forEach(res => {
    if (res.status === 'fulfilled' && res.value.isValid) {
      validDomains.push(res.value.domain);
    }
  });

  const droppedCount = domains.length - validDomains.length;
  if (droppedCount > 0) {
    console.log(` 🚫 [Pre-flight DNS] Dropped ${droppedCount} inactive domains (no active mail servers).`);
  }

  return validDomains;
}
