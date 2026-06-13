import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import config from './src/config.js';
import { encrypt, decrypt } from './src/utils/cryptoHelper.js';
import { getLookalikeDomains } from './src/services/oceanService.js';
import { findDecisionMakers } from './src/services/prospeoService.js';
import { enrichEmails } from './src/services/eazyreachService.js';
import { sendOutreachEmails } from './src/services/brevoService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'outreachflow_super_secret_session_token_key';

// In-memory Idempotency locks to prevent double-clicks or overlapping pipeline runs
const activeLocks = new Map();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database File Paths
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const TEMPLATES_FILE = path.join(__dirname, 'data', 'templates.json');
const SUPPRESSION_FILE = path.join(__dirname, 'data', 'suppression_list.json');
const CAMPAIGNS_FILE = path.join(__dirname, 'data', 'campaigns.json');

// Ensure data folder and files exist
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(TEMPLATES_FILE)) fs.writeFileSync(TEMPLATES_FILE, '[]');
if (!fs.existsSync(SUPPRESSION_FILE)) fs.writeFileSync(SUPPRESSION_FILE, '[]');
if (!fs.existsSync(CAMPAIGNS_FILE)) fs.writeFileSync(CAMPAIGNS_FILE, '[]');

// Database Migration: Automatically clean up old template references on start
if (fs.existsSync(TEMPLATES_FILE)) {
  try {
    let tText = fs.readFileSync(TEMPLATES_FILE, 'utf8');
    if (tText.includes('Ocean.io, Prospeo, Eazyreach, and Brevo')) {
      tText = tText.replaceAll('Ocean.io, Prospeo, Eazyreach, and Brevo', 'Prospeo, Hunter.io, and Brevo');
      fs.writeFileSync(TEMPLATES_FILE, tText, 'utf8');
      console.log('Migrated templates database successfully.');
    }
  } catch (migErr) {
    console.error('Migration error:', migErr);
  }
}

// JSON DB Helpers
const readUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
const writeUsers = (users) => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
const readTemplates = () => JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
const writeTemplates = (templates) => fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
const readSuppressionList = () => JSON.parse(fs.readFileSync(SUPPRESSION_FILE, 'utf8'));
const writeSuppressionList = (list) => fs.writeFileSync(SUPPRESSION_FILE, JSON.stringify(list, null, 2));
const readCampaigns = () => JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf8'));
const writeCampaigns = (campaigns) => fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2));

// Hashing Helpers
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

// Input Validation RegEx Patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const DOMAIN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,6}$/;

// HTML Sanitizer to prevent XSS injection vulnerabilities
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Custom in-memory rate limiting middleware
const rateLimitStore = new Map();
function rateLimiter(windowMs, maxRequests) {
  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    
    if (!rateLimitStore.has(ip)) {
      rateLimitStore.set(ip, []);
    }
    
    let timestamps = rateLimitStore.get(ip);
    timestamps = timestamps.filter(t => now - t < windowMs);
    
    if (timestamps.length >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    
    timestamps.push(now);
    rateLimitStore.set(ip, timestamps);
    next();
  };
}

// Authentication Middleware (Scoped JWT validation)
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required.' });

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    // Scoped Payload contains only user id
    req.user = { id: decodedUser.id };
    next();
  });
}

// Seed templates helper for new users
function seedUserTemplates(userId) {
  const templates = readTemplates();
  const defaultTemplates = [
    {
      id: crypto.randomUUID(),
      userId,
      positionKeyword: 'executive',
      name: 'Executive Template',
      subject: 'Scalability query re: {{company}}',
      body: 'Hi {{firstName}},\n\nI noticed your role as {{title}} at {{company}}. Since you are leading the executive team, I wanted to reach out regarding automation strategies that can cut lead generation costs by up to 40%.\n\nDo you have 10 minutes for a brief call next Tuesday?\n\nBest,\n{{senderName}}'
    },
    {
      id: crypto.randomUUID(),
      userId,
      positionKeyword: 'growth',
      name: 'Growth & Sales Template',
      subject: 'Accelerating {{company}}\'s sales pipeline',
      body: 'Hi {{firstName}},\n\nI saw you are heading up sales/growth as {{title}} at {{company}}.\n\nWe recently helped a similar firm boost their cold email reply rates by 25% using automated data workflows. I thought you might be interested in seeing the template sequence we used.\n\nAre you open to a quick chat this week?\n\nCheers,\n{{senderName}}'
    },
    {
      id: crypto.randomUUID(),
      userId,
      positionKeyword: 'technical',
      name: 'Technical Template',
      subject: 'API integration question re: {{company}}',
      body: 'Hi {{firstName}},\n\nNoticed your technical profile as {{title}} at {{company}}.\n\nI was looking at your developer integrations and wanted to share a lightweight automation wrapper we built that pipes lookalike company data directly into CRMs without custom scripts.\n\nWould love to get your feedback. Let me know if you have 5 minutes to connect.\n\nThanks,\n{{senderName}}'
    },
    {
      id: crypto.randomUUID(),
      userId,
      positionKeyword: 'general',
      name: 'General Template',
      subject: 'Quick question for {{firstName}} re: {{company}}',
      body: 'Hi {{firstName}},\n\nI was browsing LinkedIn and noticed your profile as {{title}} at {{company}}.\n\nI wanted to reach out and see how you currently handle outbound lead generation. We have built an automated modular stack that integrates Prospeo, Hunter.io, and Brevo to run cold outreach hands-free.\n\nWould you be open to a quick introduction?\n\nBest,\n{{senderName}}'
    }
  ];

  templates.push(...defaultTemplates);
  writeTemplates(templates);
}

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------

app.post('/api/auth/signup', rateLimiter(1 * 60 * 1000, 10), (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password || !username) {
    return res.status(400).json({ error: 'Email, username, and password are required.' });
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (!USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: 'Username must be alphanumeric and between 3 to 20 characters.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }

  const users = readUsers();
  if (users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'Email already exists.' });
  }
  if (users.find(u => u.username && u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'Username already exists.' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  
  // Encrypt default keys
  const newUser = {
    id: crypto.randomUUID(),
    email,
    username,
    salt,
    passwordHash,
    apiKeys: {
      mockMode: true, // User dry-run simulation enabled by default
      oceanApiKey: encrypt(''),
      prospeoApiKey: encrypt(''),
      eazyreachApiKey: encrypt(''),
      brevoApiKey: encrypt(''),
      senderName: 'Outreach Bot',
      senderEmail: 'outreach@yourdomain.com'
    }
  };

  users.push(newUser);
  writeUsers(users);

  seedUserTemplates(newUser.id);
  res.json({ success: true, message: 'Account created successfully! Please log in.' });
});

app.post('/api/auth/login', rateLimiter(1 * 60 * 1000, 10), (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const users = readUsers();
  const user = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(400).json({ error: 'Invalid email or password.' });
  }

  const calculatedHash = hashPassword(password, user.salt);
  if (calculatedHash !== user.passwordHash) {
    return res.status(400).json({ error: 'Invalid email or password.' });
  }

  // Scoped Payload contains ONLY user ID
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, email: user.email, username: user.username });
});

// -------------------------------------------------------------
// Config & Settings (User Scoped, AES Decrypted)
// -------------------------------------------------------------

app.get('/api/config', authenticateToken, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const keys = user.apiKeys || {};
  
  // Decrypt keys securely on backend
  const oceanDecrypted = decrypt(keys.oceanApiKey);
  const prospeoDecrypted = decrypt(keys.prospeoApiKey);
  const eazyreachDecrypted = decrypt(keys.eazyreachApiKey);
  const brevoDecrypted = decrypt(keys.brevoApiKey);

  res.json({
    mockMode: keys.mockMode !== false, // User-level Dry Run simulation toggle
    oceanApiKey: oceanDecrypted ? '••••••••' + oceanDecrypted.slice(-4) : '',
    prospeoApiKey: prospeoDecrypted ? '••••••••' + prospeoDecrypted.slice(-4) : '',
    eazyreachApiKey: eazyreachDecrypted ? '••••••••' + eazyreachDecrypted.slice(-4) : '',
    brevoApiKey: brevoDecrypted ? '••••••••' + brevoDecrypted.slice(-4) : '',
    senderEmail: keys.senderEmail || 'outreach@yourdomain.com',
    senderName: keys.senderName || 'Outreach Bot',
  });
});

app.post('/api/config', authenticateToken, (req, res) => {
  const { mockMode, oceanApiKey, prospeoApiKey, eazyreachApiKey, brevoApiKey, senderEmail, senderName } = req.body;
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === req.user.id);

  if (userIndex === -1) return res.status(404).json({ error: 'User not found.' });

  const currentKeys = users[userIndex].apiKeys || {};

  // AES Encrypt new keys at rest in database
  users[userIndex].apiKeys = {
    mockMode: typeof mockMode === 'boolean' ? mockMode : currentKeys.mockMode,
    oceanApiKey: (oceanApiKey && !oceanApiKey.startsWith('••••')) ? encrypt(oceanApiKey) : currentKeys.oceanApiKey,
    prospeoApiKey: (prospeoApiKey && !prospeoApiKey.startsWith('••••')) ? encrypt(prospeoApiKey) : currentKeys.prospeoApiKey,
    eazyreachApiKey: (eazyreachApiKey && !eazyreachApiKey.startsWith('••••')) ? encrypt(eazyreachApiKey) : currentKeys.eazyreachApiKey,
    brevoApiKey: (brevoApiKey && !brevoApiKey.startsWith('••••')) ? encrypt(brevoApiKey) : currentKeys.brevoApiKey,
    senderEmail: senderEmail || currentKeys.senderEmail,
    senderName: senderName || currentKeys.senderName
  };

  writeUsers(users);
  res.json({ success: true, message: 'Settings saved successfully.' });
});

// -------------------------------------------------------------
// Template Management Endpoints (User Scoped)
// -------------------------------------------------------------

app.get('/api/templates', authenticateToken, (req, res) => {
  const templates = readTemplates();
  const userTemplates = templates.filter(t => t.userId === req.user.id);
  res.json(userTemplates);
});

app.put('/api/templates/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { subject, body } = req.body;
  
  const templates = readTemplates();
  const templateIdx = templates.findIndex(t => t.id === id && t.userId === req.user.id);

  if (templateIdx === -1) {
    return res.status(404).json({ error: 'Template not found.' });
  }

  templates[templateIdx].subject = sanitizeInput(subject);
  templates[templateIdx].body = sanitizeInput(body);
  writeTemplates(templates);

  res.json({ success: true, template: templates[templateIdx] });
});

// -------------------------------------------------------------
// Suppression list Endpoints (Opt-out Compliance)
// -------------------------------------------------------------

app.get('/api/suppression', authenticateToken, (req, res) => {
  const list = readSuppressionList();
  res.json(list);
});

app.post('/api/suppression', authenticateToken, (req, res) => {
  const { emailOrDomain } = req.body;
  if (!emailOrDomain) return res.status(400).json({ error: 'Value required.' });

  const list = readSuppressionList();
  const item = emailOrDomain.trim().toLowerCase();
  
  if (!list.includes(item)) {
    list.push(item);
    writeSuppressionList(list);
  }
  res.json({ success: true, list });
});

// -------------------------------------------------------------
// Campaigns Analytics Endpoints
// -------------------------------------------------------------

app.get('/api/campaigns', authenticateToken, (req, res) => {
  const campaigns = readCampaigns();
  const userCampaigns = campaigns.filter(c => c.userId === req.user.id);
  res.json(userCampaigns);
});

// Helper to check lock / clear locks
function checkAndAcquireLock(userId, seedDomain) {
  const cooldown = 5 * 60 * 1000; // 5 minute cooldown
  const now = Date.now();
  
  if (activeLocks.has(userId)) {
    const userLocks = activeLocks.get(userId);
    if (userLocks.has(seedDomain)) {
      const lockTime = userLocks.get(seedDomain);
      if (now - lockTime < cooldown) {
        return false;
      }
    }
  } else {
    activeLocks.set(userId, new Map());
  }
  
  activeLocks.get(userId).set(seedDomain, now);
  return true;
}

function releaseLock(userId, seedDomain) {
  if (activeLocks.has(userId)) {
    activeLocks.get(userId).delete(seedDomain);
  }
}

// -------------------------------------------------------------
// Outreach Pipeline (Auth, Decrypted Keys, Suppressions, Locks)
// -------------------------------------------------------------

app.post('/api/pipeline/domains', authenticateToken, rateLimiter(1 * 60 * 1000, 15), async (req, res) => {
  const { seedDomain } = req.body;
  if (!seedDomain) return res.status(400).json({ error: 'Seed domain is required.' });

  if (!DOMAIN_REGEX.test(seedDomain.trim())) {
    return res.status(400).json({ error: 'Invalid seed domain format. Please enter a valid domain (e.g. stripe.com).' });
  }

  // 1. Concurrency double-submit lock check
  if (!checkAndAcquireLock(req.user.id, seedDomain)) {
    return res.status(409).json({ error: `Pipeline run for "${seedDomain}" is already in progress. Please wait for it to complete.` });
  }

  const users = readUsers();
  const user = users.find(u => u.id === req.user.id);
  const keys = user?.apiKeys || {};

  // Mount configuration context dynamically
  config.mockMode = keys.mockMode !== false; // Binds to user dryRun config
  config.oceanApiKey = decrypt(keys.oceanApiKey) || config.oceanApiKey;

  try {
    const domains = await getLookalikeDomains(seedDomain);
    res.json({ domains });
  } catch (error) {
    releaseLock(req.user.id, seedDomain);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pipeline/leads', authenticateToken, rateLimiter(1 * 60 * 1000, 15), async (req, res) => {
  const { domains } = req.body;
  if (!Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({ error: 'Domains list is required.' });
  }

  const users = readUsers();
  const user = users.find(u => u.id === req.user.id);
  const keys = user?.apiKeys || {};

  config.mockMode = keys.mockMode !== false;
  config.prospeoApiKey = decrypt(keys.prospeoApiKey) || config.prospeoApiKey;

  try {
    const leads = await findDecisionMakers(domains);
    res.json({ leads });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pipeline/enrich', authenticateToken, rateLimiter(1 * 60 * 1000, 15), async (req, res) => {
  const { leads } = req.body;
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'Leads list is required.' });
  }

  const users = readUsers();
  const user = users.find(u => u.id === req.user.id);
  const keys = user?.apiKeys || {};

  config.mockMode = keys.mockMode !== false;
  config.eazyreachApiKey = decrypt(keys.eazyreachApiKey) || config.eazyreachApiKey;

  try {
    const enrichedLeads = await enrichEmails(leads);

    // -------------------------------------------------------------
    // Email personalization based on position and templates!
    // -------------------------------------------------------------
    const templates = readTemplates().filter(t => t.userId === req.user.id);
    const suppressionList = readSuppressionList();
    const senderName = keys.senderName || 'Outreach Bot';

    const leadsWithDrafts = enrichedLeads.map(lead => {
      const emailLower = (lead.verifiedEmail || '').toLowerCase();
      const domainLower = (lead.company || '').toLowerCase();
      
      // Global Suppression Check (Compliance)
      const isSuppressed = suppressionList.some(item => {
        const itemLower = item.toLowerCase();
        return emailLower === itemLower || domainLower === itemLower || emailLower.endsWith('@' + itemLower);
      });

      if (isSuppressed) {
        return {
          ...lead,
          suppressed: true,
          draftSubject: '🚨 BLOCKED: suppression list',
          draftBody: `This lead (${lead.verifiedEmail}) is registered on your global suppression opt-out list and has been blocked.`
        };
      }

      const title = (lead.title || '').toLowerCase();
      let matchedTemplate = templates.find(t => t.positionKeyword === 'general');

      // Keyword segment matching
      if (title.includes('ceo') || title.includes('founder') || title.includes('president') || title.includes('chief')) {
        matchedTemplate = templates.find(t => t.positionKeyword === 'executive') || matchedTemplate;
      } else if (title.includes('sales') || title.includes('growth') || title.includes('marketing') || title.includes('cmo')) {
        matchedTemplate = templates.find(t => t.positionKeyword === 'growth') || matchedTemplate;
      } else if (title.includes('cto') || title.includes('tech') || title.includes('engineer') || title.includes('developer') || title.includes('product')) {
        matchedTemplate = templates.find(t => t.positionKeyword === 'technical') || matchedTemplate;
      }

      // Variable Compiler Helper
      const compile = (templateStr) => {
        return templateStr
          .replace(/{{firstName}}/g, lead.firstName || '')
          .replace(/{{lastName}}/g, lead.lastName || '')
          .replace(/{{title}}/g, lead.title || '')
          .replace(/{{company}}/g, lead.company || '')
          .replace(/{{senderName}}/g, senderName);
      };

      return {
        ...lead,
        suppressed: false,
        draftSubject: compile(matchedTemplate?.subject || 'Quick question re: {{company}}'),
        draftBody: compile(matchedTemplate?.body || 'Hi {{firstName}},\n\nI was looking at {{company}}...')
      };
    });

    res.json({ leads: leadsWithDrafts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stage 4 Endpoint: Brevo - logs metrics & records campaign analytics
app.post('/api/pipeline/send', authenticateToken, rateLimiter(1 * 60 * 1000, 15), async (req, res) => {
  const { leads, seedDomain } = req.body;
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'Approved leads list is required.' });
  }

  const users = readUsers();
  const user = users.find(u => u.id === req.user.id);
  const keys = user?.apiKeys || {};

  config.mockMode = keys.mockMode !== false;
  config.brevoApiKey = decrypt(keys.brevoApiKey) || config.brevoApiKey;
  config.senderEmail = keys.senderEmail || config.senderEmail;
  config.senderName = keys.senderName || config.senderName;

  try {
    // Escape and sanitize email templates to avoid script injection vulnerabilities
    const sanitizedLeads = leads.map(lead => ({
      ...lead,
      draftSubject: sanitizeInput(lead.draftSubject),
      draftBody: sanitizeInput(lead.draftBody)
    }));

    const summary = await sendOutreachEmails(sanitizedLeads);
    
    // Save Campaign History Analytics
    const campaigns = readCampaigns();
    const newCampaign = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      seedDomain: seedDomain || 'unknown',
      date: new Date().toISOString(),
      totalSourced: leads.length,
      successCount: summary.successCount,
      failCount: summary.failCount,
      mockMode: config.mockMode
    };
    campaigns.push(newCampaign);
    writeCampaigns(campaigns);

    // Release double-submit lock
    if (seedDomain) {
      releaseLock(req.user.id, seedDomain);
    }

    res.json({ ...summary, campaign: newCampaign });
  } catch (error) {
    if (seedDomain) releaseLock(req.user.id, seedDomain);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to abort campaign and unlock seedDomain
app.post('/api/pipeline/abort', authenticateToken, (req, res) => {
  const { seedDomain } = req.body;
  if (seedDomain) {
    releaseLock(req.user.id, seedDomain);
  }
  res.json({ success: true });
});

// Fallback index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Multi-User SaaS Outreach Server is running at http://localhost:${PORT}`);
  console.log(`💡 AES-256-GCM, DNS MX check, and campaigns analytics fully configured.`);
});
