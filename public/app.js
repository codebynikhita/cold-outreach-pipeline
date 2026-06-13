// OutreachFlow SaaS Client-Side Logic
let currentLeads = []; // Holds the current leads in the safety checkpoint
let selectedLeads = new Set(); // Holds indices of currently selected leads
let activeEditLeadIndex = null; // Index of lead currently being edited in modal
let activeSeedDomain = null; // Holds the seed domain of the active campaign

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // -------------------------------------------------------------
  // DOM Elements
  // -------------------------------------------------------------
  
  // Auth Overlays
  const authOverlay = document.getElementById('auth-overlay');
  const mainApp = document.getElementById('main-app');
  const loginFormContainer = document.getElementById('login-form-container');
  const signupFormContainer = document.getElementById('signup-form-container');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const authError = document.getElementById('auth-error-message');
  const toggleToSignup = document.getElementById('toggle-to-signup');
  const toggleToLogin = document.getElementById('toggle-to-login');
  const logoutBtn = document.getElementById('logout-btn');
  const userDisplay = document.getElementById('user-display');

  // Navigation Tabs
  const tabPipeline = document.getElementById('tab-pipeline');
  const tabTemplates = document.getElementById('tab-templates');
  const tabAnalytics = document.getElementById('tab-analytics');
  const pipelineWorkspace = document.getElementById('pipeline-workspace');
  const templatesWorkspace = document.getElementById('templates-workspace');
  const analyticsWorkspace = document.getElementById('analytics-workspace');

  // Templates Manager
  const templatesLoading = document.getElementById('templates-loading');
  const templatesListContainer = document.getElementById('templates-list-container');

  // Pipeline Input & Stepper
  const seedInput = document.getElementById('seed-domain-input');
  const startBtn = document.getElementById('start-pipeline-btn');
  const stepper = document.getElementById('pipeline-stepper');
  
  // Console Drawer
  const consoleDrawer = document.getElementById('console-drawer');
  const consoleToggle = document.getElementById('console-toggle');
  const consoleBody = document.getElementById('console-body');
  const consoleChevron = document.getElementById('console-chevron');

  // Settings
  const settingsPanel = document.getElementById('settings-panel');
  const toggleSettingsBtn = document.getElementById('toggle-settings-btn');
  const closeSettingsBtn = document.getElementById('close-settings-btn');
  const settingsForm = document.getElementById('settings-form');
  const mockModeSwitch = document.getElementById('mock-mode-switch');
  const modeBadge = document.getElementById('mode-badge');
  const modeBadgeText = modeBadge.querySelector('.badge-text');

  // Stage Views
  const stage1View = document.getElementById('stage-1-view');
  const stage2View = document.getElementById('stage-2-view');
  const checkpointView = document.getElementById('checkpoint-view');
  const brevoCompleteView = document.getElementById('brevo-complete-view');

  // Checkpoint Controls
  const selectAllCheckbox = document.getElementById('select-all-leads');
  const tableBody = document.getElementById('leads-table-body');
  const searchInput = document.getElementById('checkpoint-search');
  const totalCheckpointCount = document.getElementById('total-checkpoint-count');
  const selectedCheckpointCount = document.getElementById('selected-checkpoint-count');
  const btnAbortCampaign = document.getElementById('btn-abort-campaign');
  const btnTriggerBrevo = document.getElementById('btn-trigger-brevo');
  const btnRunAnother = document.getElementById('btn-run-another');

  // Draft Editor Modal Elements
  const draftModal = document.getElementById('draft-modal');
  const closeDraftModalBtn = document.getElementById('close-draft-modal-btn');
  const modalLeadName = document.getElementById('modal-lead-name');
  const modalLeadTitle = document.getElementById('modal-lead-title');
  const modalLeadCompany = document.getElementById('modal-lead-company');
  const modalEmailSubject = document.getElementById('modal-email-subject');
  const modalEmailBody = document.getElementById('modal-email-body');
  const btnSaveDraft = document.getElementById('btn-save-draft');

  // State
  let token = localStorage.getItem('saas_jwt');
  let email = localStorage.getItem('saas_email');

  // -------------------------------------------------------------
  // Authentication & Session Handlers
  // -------------------------------------------------------------
  
  function checkAuth() {
    if (token) {
      authOverlay.classList.add('hidden');
      mainApp.classList.remove('hidden');
      const cachedUsername = localStorage.getItem('saas_username') || email;
      userDisplay.innerText = `Hello, ${cachedUsername}`;
      loadConfig();
      loadTemplates();
    } else {
      authOverlay.classList.remove('hidden');
      mainApp.classList.add('hidden');
    }
  }

  // Toggle forms
  toggleToSignup.addEventListener('click', () => {
    loginFormContainer.classList.add('hidden');
    signupFormContainer.classList.remove('hidden');
    authError.classList.add('hidden');
  });

  toggleToLogin.addEventListener('click', () => {
    signupFormContainer.classList.add('hidden');
    loginFormContainer.classList.remove('hidden');
    authError.classList.add('hidden');
  });

  // Helper for auth requests
  async function handleAuthSubmit(endpoint, body) {
    authError.classList.add('hidden');
    authError.className = 'auth-error text-danger hidden';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (data.error) {
        authError.innerText = data.error;
        authError.className = 'auth-error text-danger';
        authError.classList.remove('hidden');
        return;
      }

      // Check if it's a successful signup (requires manual login)
      if (endpoint.includes('signup') && data.success) {
        signupForm.reset();
        signupFormContainer.classList.add('hidden');
        loginFormContainer.classList.remove('hidden');
        authError.innerText = data.message || 'Account created successfully! Please log in.';
        authError.className = 'auth-error text-success';
        authError.classList.remove('hidden');
        return;
      }

      if (data.token) {
        token = data.token;
        email = data.email;
        const username = data.username || email.split('@')[0];
        localStorage.setItem('saas_jwt', token);
        localStorage.setItem('saas_email', email);
        localStorage.setItem('saas_username', username);
        checkAuth();
      }
    } catch (err) {
      authError.innerText = 'Server connection failed.';
      authError.className = 'auth-error text-danger';
      authError.classList.remove('hidden');
    }
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailVal = document.getElementById('login-email').value.trim();
    const p = document.getElementById('login-password').value;
    handleAuthSubmit('/api/auth/login', { email: emailVal, password: p });
  });

  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailVal = document.getElementById('signup-email').value.trim();
    const usernameVal = document.getElementById('signup-username').value.trim();
    const p = document.getElementById('signup-password').value;
    handleAuthSubmit('/api/auth/signup', { email: emailVal, username: usernameVal, password: p });
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('saas_jwt');
    localStorage.removeItem('saas_email');
    localStorage.removeItem('saas_username');
    token = null;
    email = null;
    resetViews();
    clearLogs();
    checkAuth();
  });

  // Authorized Fetch Wrapper (injects bearer token automatically)
  async function authFetch(url, options = {}) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, options);
  }

  // Release campaign run concurrency locks
  async function abortCampaignLock() {
    if (activeSeedDomain) {
      try {
        await authFetch('/api/pipeline/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seedDomain: activeSeedDomain })
        });
      } catch (err) {
        console.error('Failed to release lock:', err);
      }
    }
  }

  // Fetch campaign histories and render metrics
  async function loadAnalytics() {
    try {
      const res = await authFetch('/api/campaigns');
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      const campaigns = await res.json();

      const totalCampaigns = campaigns.length;
      let totalLeads = 0;
      let totalDelivered = 0;
      let totalBounces = 0;

      campaigns.forEach(c => {
        totalLeads += c.totalSourced || 0;
        totalDelivered += c.successCount || 0;
        totalBounces += c.failCount || 0;
      });

      document.getElementById('analytics-campaigns-count').innerText = totalCampaigns;
      document.getElementById('analytics-leads-count').innerText = totalLeads;
      document.getElementById('analytics-delivered-count').innerText = totalDelivered;
      document.getElementById('analytics-bounces-count').innerText = totalBounces;

      const tbody = document.getElementById('analytics-history-table-body');
      tbody.innerHTML = '';

      if (campaigns.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No campaigns run yet.</td></tr>`;
      } else {
        campaigns.sort((a, b) => new Date(b.date) - new Date(a.date));

        campaigns.forEach(c => {
          const tr = document.createElement('tr');
          const dateStr = new Date(c.date).toLocaleString();
          const mockBadge = c.mockMode
            ? '<span class="badge mock-mode" style="padding: 2px 6px; font-size: 10px;">Simulation</span>'
            : '<span class="badge prod-mode" style="padding: 2px 6px; font-size: 10px;">Production</span>';
          
          tr.innerHTML = `
            <td>${dateStr}</td>
            <td><strong>${c.seedDomain}</strong></td>
            <td>${c.totalSourced}</td>
            <td class="text-green">${c.successCount}</td>
            <td class="text-danger">${c.failCount}</td>
            <td>${mockBadge}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (err) {
      log(`Error loading analytics: ${err.message}`, 'danger');
    }
  }

  // -------------------------------------------------------------
  // Config & Settings Drawer
  // -------------------------------------------------------------
  
  async function loadConfig() {
    try {
      const res = await authFetch('/api/config');
      const config = await res.json();
      
      mockModeSwitch.checked = config.mockMode;
      document.getElementById('prospeo-key').value = config.prospeoApiKey;
      document.getElementById('eazyreach-key').value = config.eazyreachApiKey;
      document.getElementById('brevo-key').value = config.brevoApiKey;
      document.getElementById('sender-name').value = config.senderName;
      document.getElementById('sender-email').value = config.senderEmail;

      updateModeBadge(config.mockMode);
    } catch (err) {
      log(`Error loading configuration: ${err.message}`, 'danger');
    }
  }

  function updateModeBadge(isMock) {
    if (isMock) {
      modeBadge.className = 'badge mock-mode';
      modeBadgeText.innerText = 'Mock Mode Active';
    } else {
      modeBadge.className = 'badge prod-mode';
      modeBadgeText.innerText = 'Production Mode';
    }
  }

  toggleSettingsBtn.addEventListener('click', () => settingsPanel.classList.toggle('hidden'));
  closeSettingsBtn.addEventListener('click', () => settingsPanel.classList.add('hidden'));

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mockMode = mockModeSwitch.checked;
    const prospeoApiKey = document.getElementById('prospeo-key').value;
    const eazyreachApiKey = document.getElementById('eazyreach-key').value;
    const brevoApiKey = document.getElementById('brevo-key').value;
    const senderName = document.getElementById('sender-name').value;
    const senderEmail = document.getElementById('sender-email').value;

    try {
      const res = await authFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mockMode,
          oceanApiKey: 'mock',
          prospeoApiKey,
          eazyreachApiKey,
          brevoApiKey,
          senderName,
          senderEmail
        })
      });
      const data = await res.json();
      if (data.success) {
        log('API configuration successfully saved in profile.', 'success');
        updateModeBadge(mockMode);
        settingsPanel.classList.add('hidden');
      } else {
        log('Failed to save settings: ' + data.error, 'danger');
      }
    } catch (err) {
      log('Error saving settings: ' + err.message, 'danger');
    }
  });

  // -------------------------------------------------------------
  // Tab Navigation Controls
  // -------------------------------------------------------------
  
  tabPipeline.addEventListener('click', () => {
    tabPipeline.classList.add('active');
    tabTemplates.classList.remove('active');
    tabAnalytics.classList.remove('active');
    pipelineWorkspace.classList.remove('hidden');
    templatesWorkspace.classList.add('hidden');
    analyticsWorkspace.classList.add('hidden');
  });

  tabTemplates.addEventListener('click', () => {
    tabTemplates.classList.add('active');
    tabPipeline.classList.remove('active');
    tabAnalytics.classList.remove('active');
    templatesWorkspace.classList.remove('hidden');
    pipelineWorkspace.classList.add('hidden');
    analyticsWorkspace.classList.add('hidden');
    loadTemplates();
  });

  tabAnalytics.addEventListener('click', () => {
    tabAnalytics.classList.add('active');
    tabPipeline.classList.remove('active');
    tabTemplates.classList.remove('active');
    analyticsWorkspace.classList.remove('hidden');
    pipelineWorkspace.classList.add('hidden');
    templatesWorkspace.classList.add('hidden');
    loadAnalytics();
  });

  // -------------------------------------------------------------
  // Template Manager Operations
  // -------------------------------------------------------------
  
  // Spam Scanner Keyword triggers list
  const SPAM_KEYWORDS = ['free', 'guarantee', '100% free', 'risk-free', 'make money', 'click here', 'act now', 'cash', 'earn', 'winner'];

  function checkSpamWords(subject, body, card) {
    const combined = (subject + ' ' + body).toLowerCase();
    const matched = SPAM_KEYWORDS.filter(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      return regex.test(combined);
    });
    
    const warningContainer = card.querySelector('.spam-warning-container');
    const warningSpan = card.querySelector('.spam-words');
    
    if (matched.length > 0) {
      warningContainer.classList.remove('hidden');
      warningSpan.innerText = matched.map(w => `"${w}"`).join(', ');
    } else {
      warningContainer.classList.add('hidden');
    }
  }

  async function loadTemplates() {
    templatesLoading.classList.remove('hidden');
    templatesListContainer.classList.add('hidden');
    templatesListContainer.innerHTML = '';
    
    try {
      const res = await authFetch('/api/templates');
      const templates = await res.json();
      
      templates.forEach(t => {
        const editor = document.createElement('div');
        editor.className = 'template-editor-card';
        editor.innerHTML = `
          <div class="template-editor-header">
            <h3>${t.name}</h3>
            <span class="keyword-badge">Title Contains: "${t.positionKeyword}"</span>
          </div>
          <form class="template-editor-body" data-id="${t.id}">
            <div class="form-group">
              <label>Subject Line Template</label>
              <input type="text" class="template-subject-input" value="${t.subject || ''}" required>
            </div>
            <div class="form-group">
              <label>Email Body Template</label>
              <textarea class="template-body-textarea" rows="6" required>${t.body || ''}</textarea>
            </div>
            <div class="spam-warning-container text-warning hidden" style="margin-bottom: 12px;">
              <i data-lucide="alert-triangle"></i>
              <span>⚠️ Spam Risk: contains flagged keywords <span class="spam-words"></span></span>
            </div>
            <button type="submit" class="btn btn-secondary btn-md">
              <i data-lucide="save" style="width: 14px; height: 14px;"></i> Save Template
            </button>
          </form>
        `;
        templatesListContainer.appendChild(editor);

        // Bind real-time input spam scanners
        const subjectInput = editor.querySelector('.template-subject-input');
        const bodyTextarea = editor.querySelector('.template-body-textarea');
        const runSpamCheck = () => checkSpamWords(subjectInput.value, bodyTextarea.value, editor);
        
        subjectInput.addEventListener('input', runSpamCheck);
        bodyTextarea.addEventListener('input', runSpamCheck);
        runSpamCheck(); // Execute immediately
      });

      // Bind Save actions for each template form
      templatesListContainer.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const id = e.target.dataset.id;
          const subject = e.target.querySelector('.template-subject-input').value;
          const body = e.target.querySelector('.template-body-textarea').value;
          
          try {
            const saveRes = await authFetch(`/api/templates/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subject, body })
            });
            const data = await saveRes.json();
            if (data.success) {
              alert('Template saved successfully!');
            }
          } catch (err) {
            alert('Failed to save template: ' + err.message);
          }
        });
      });

      templatesLoading.classList.add('hidden');
      templatesListContainer.classList.remove('hidden');
      lucide.createIcons();
    } catch (err) {
      templatesLoading.innerText = 'Failed to load templates: ' + err.message;
    }
  }

  // -------------------------------------------------------------
  // Stepper & Logging Console
  // -------------------------------------------------------------
  
  function log(text, type = 'info') {
    const line = document.createElement('div');
    line.className = `log-line text-${type}`;
    let prefix = '> ';
    if (type === 'success') prefix = '✔ ';
    if (type === 'warning') prefix = '⚠️ ';
    if (type === 'danger') prefix = '❌ ';
    if (type === 'muted-log') prefix = '  ';

    line.innerText = `${prefix}${text}`;
    consoleBody.appendChild(line);
    consoleBody.scrollTop = consoleBody.scrollHeight;
  }

  function clearLogs() {
    consoleBody.innerHTML = '';
  }

  function setStepStatus(stepNum, status) {
    const steps = document.querySelectorAll('.step');
    const connectors = document.querySelectorAll('.step-connector');

    steps.forEach((step, idx) => {
      const stepVal = idx + 1;
      if (stepVal === stepNum) {
        step.className = `step ${status}`;
      } else if (stepVal < stepNum) {
        step.className = 'step completed';
      } else {
        step.className = 'step';
      }
    });

    connectors.forEach((conn, idx) => {
      const connVal = idx + 1;
      if (connVal < stepNum) {
        conn.className = 'step-connector completed';
      } else if (connVal === stepNum - 1) {
        conn.className = `step-connector ${status}`;
      } else {
        conn.className = 'step-connector';
      }
    });
  }

  consoleToggle.addEventListener('click', () => {
    consoleBody.classList.toggle('collapsed');
    consoleChevron.style.transform = consoleBody.classList.contains('collapsed') ? 'rotate(180deg)' : 'rotate(0deg)';
  });

  // Reset UI back to start state
  function resetViews() {
    stage1View.classList.add('hidden');
    stage2View.classList.add('hidden');
    checkpointView.classList.add('hidden');
    brevoCompleteView.classList.add('hidden');
    
    document.getElementById('domains-list-tags').innerHTML = '';
    document.getElementById('leads-list-cards').innerHTML = '';
    tableBody.innerHTML = '';
    
    currentLeads = [];
    selectedLeads.clear();
  }

  // -------------------------------------------------------------
  // RUN OUTREACH PIPELINE PIPING
  // -------------------------------------------------------------
  
  startBtn.addEventListener('click', async () => {
    const seedDomain = seedInput.value.trim();
    if (!seedDomain) {
      alert('Please enter a seed domain.');
      return;
    }
    activeSeedDomain = seedDomain;
    startBtn.disabled = true;

    resetViews();
    clearLogs();
    
    stepper.classList.remove('hidden');
    consoleDrawer.classList.remove('hidden');
    consoleBody.classList.remove('collapsed');
    consoleChevron.style.transform = 'rotate(0deg)';

    log(`Initializing dynamic cold-outreach campaign for domain: "${seedDomain}"`);

    // 1. Stage 1: Ocean.io (Lookalikes)
    setStepStatus(1, 'active');
    log('Stage 1: Querying Ocean.io for competitors...');
    let domains = [];
    try {
      const res = await authFetch('/api/pipeline/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedDomain })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      domains = data.domains || [];
      if (domains.length === 0) {
        log('Ocean.io found 0 lookalike company domains. Pipeline stopped.', 'warning');
        setStepStatus(1, 'error');
        await abortCampaignLock();
        startBtn.disabled = false;
        return;
      }
      log(`Ocean.io complete. Discovered ${domains.length} lookalike domains: [${domains.join(', ')}]`, 'success');
      setStepStatus(1, 'completed');
      renderStage1Tags(domains);
    } catch (err) {
      log(`Stage 1 Ocean.io search failed: ${err.message}`, 'danger');
      setStepStatus(1, 'error');
      await abortCampaignLock();
      startBtn.disabled = false;
      return;
    }

    // 2. Stage 2: Prospeo (C-Suite / VP Finder)
    setStepStatus(2, 'active');
    log('Stage 2: Quering Prospeo for CXO/VP level decision makers...');
    let rawLeads = [];
    try {
      const res = await authFetch('/api/pipeline/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      rawLeads = data.leads || [];
      if (rawLeads.length === 0) {
        log('Prospeo returned 0 decision-makers. Pipeline stopped.', 'warning');
        setStepStatus(2, 'error');
        await abortCampaignLock();
        startBtn.disabled = false;
        return;
      }
      log(`Prospeo complete. Discovered ${rawLeads.length} leads with LinkedIn profiles.`, 'success');
      setStepStatus(2, 'completed');
      renderStage2Cards(rawLeads);
    } catch (err) {
      log(`Stage 2 Prospeo lookup failed: ${err.message}`, 'danger');
      setStepStatus(2, 'error');
      await abortCampaignLock();
      startBtn.disabled = false;
      return;
    }

    // 3. Stage 3: Eazyreach (Enrichment + Position Template Personalization)
    setStepStatus(3, 'active');
    log('Stage 3: Running Eazyreach email resolution & position-based draft compiling...');
    let enrichedLeads = [];
    try {
      const res = await authFetch('/api/pipeline/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: rawLeads })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      enrichedLeads = data.leads || [];
      if (enrichedLeads.length === 0) {
        log('Eazyreach resolved 0 verified emails. Pipeline stopped.', 'warning');
        setStepStatus(3, 'error');
        await abortCampaignLock();
        startBtn.disabled = false;
        return;
      }
      log(`Eazyreach complete. Resolved ${enrichedLeads.length}/${rawLeads.length} verified emails and drafted personalized messages.`, 'success');
      setStepStatus(3, 'completed');
    } catch (err) {
      log(`Stage 3 Eazyreach enrichment failed: ${err.message}`, 'danger');
      setStepStatus(3, 'error');
      await abortCampaignLock();
      startBtn.disabled = false;
      return;
    }

    // 4. Safety Checkpoint
    setStepStatus(4, 'active');
    log('Pipeline paused at Safety Checkpoint. Please review leads and draft emails below.', 'warning');
    
    currentLeads = enrichedLeads;
    renderCheckpointTable(currentLeads);
  });

  // Render Ocean.io Tags
  function renderStage1Tags(domains) {
    stage1View.classList.remove('hidden');
    document.getElementById('domains-count-badge').innerText = domains.length;
    const tagsContainer = document.getElementById('domains-list-tags');
    tagsContainer.innerHTML = '';
    
    domains.forEach(domain => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.innerHTML = `<i data-lucide="building-2"></i> ${domain}`;
      tagsContainer.appendChild(tag);
    });
    lucide.createIcons();
  }

  // Render Prospeo Cards
  function renderStage2Cards(leads) {
    stage2View.classList.remove('hidden');
    document.getElementById('leads-count-badge').innerText = leads.length;
    const grid = document.getElementById('leads-list-cards');
    grid.innerHTML = '';

    leads.forEach(lead => {
      const card = document.createElement('div');
      card.className = 'lead-card';
      card.innerHTML = `
        <div class="lead-card-header">
          <div>
            <h4>${lead.firstName} ${lead.lastName}</h4>
            <p>${lead.title}</p>
          </div>
          <span class="lead-company-badge">${lead.company}</span>
        </div>
        <a href="${lead.linkedinUrl}" target="_blank" class="linkedin-btn"><i data-lucide="linkedin" style="width: 14px; height: 14px;"></i> LinkedIn Profile</a>
      `;
      grid.appendChild(card);
    });
    lucide.createIcons();
  }

  // Render Safety Checkpoint Table (with dynamic draft previews!)
  function renderCheckpointTable(leads) {
    checkpointView.classList.remove('hidden');
    tableBody.innerHTML = '';
    
    selectedLeads.clear();
    leads.forEach((lead, idx) => {
      if (lead.suppressed !== true) {
        selectedLeads.add(idx);
      }
    });
    selectAllCheckbox.checked = true;

    leads.forEach((lead, index) => {
      const row = document.createElement('tr');
      row.dataset.index = index;
      
      const isSuppressed = lead.suppressed === true;
      if (isSuppressed) {
        row.className = 'suppressed-row';
      }

      const checkboxHtml = isSuppressed
        ? `<input type="checkbox" class="lead-select-checkbox" disabled data-index="${index}">`
        : `<input type="checkbox" class="lead-select-checkbox" checked data-index="${index}">`;

      const editBtnHtml = isSuppressed
        ? `<button class="btn-edit-draft hidden" data-index="${index}">
            <i data-lucide="mail-open"></i> Edit Draft
          </button>`
        : `<button class="btn-edit-draft" data-index="${index}">
            <i data-lucide="mail-open"></i> Edit Draft
          </button>`;

      row.innerHTML = `
        <td>${checkboxHtml}</td>
        <td class="cell-name">${lead.firstName} ${lead.lastName}</td>
        <td class="cell-title">${lead.title}</td>
        <td class="cell-company">${lead.company}</td>
        <td><a href="${lead.linkedinUrl}" target="_blank" class="linkedin-btn"><i data-lucide="linkedin" style="width: 13px; height: 13px;"></i> Profile</a></td>
        <td class="table-email-display">${lead.verifiedEmail}</td>
        <td>
          ${editBtnHtml}
        </td>
        <td>
          <button class="btn-remove-row" data-index="${index}"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></button>
        </td>
      `;
      tableBody.appendChild(row);
    });

    lucide.createIcons();
    updateCheckpointCounts();
    attachCheckpointEventListeners();
  }

  function updateCheckpointCounts() {
    totalCheckpointCount.innerText = currentLeads.length;
    selectedCheckpointCount.innerText = selectedLeads.size;
    
    const unsuppressedLeads = currentLeads.filter(l => l.suppressed !== true);
    selectAllCheckbox.checked = (selectedLeads.size === unsuppressedLeads.length && unsuppressedLeads.length > 0);

    btnTriggerBrevo.disabled = (selectedLeads.size === 0);
    if (selectedLeads.size === 0) {
      btnTriggerBrevo.classList.add('btn-secondary');
      btnTriggerBrevo.classList.remove('btn-success', 'glow-green');
    } else {
      btnTriggerBrevo.classList.remove('btn-secondary');
      btnTriggerBrevo.classList.add('btn-success', 'glow-green');
    }
  }

  function attachCheckpointEventListeners() {
    // Checkboxes
    tableBody.querySelectorAll('.lead-select-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index, 10);
        if (e.target.checked) selectedLeads.add(index);
        else selectedLeads.delete(index);
        updateCheckpointCounts();
      });
    });

    // Delete single lead
    tableBody.querySelectorAll('.btn-remove-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const btnElement = e.target.closest('.btn-remove-row');
        const index = parseInt(btnElement.dataset.index, 10);
        tableBody.querySelector(`tr[data-index="${index}"]`)?.remove();
        selectedLeads.delete(index);
        updateCheckpointCounts();
        log(`Lead excluded: ${currentLeads[index].firstName} ${currentLeads[index].lastName}`, 'warning');
      });
    });

    // Open Edit Draft Modal
    tableBody.querySelectorAll('.btn-edit-draft').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const btnElement = e.target.closest('.btn-edit-draft');
        const index = parseInt(btnElement.dataset.index, 10);
        openDraftModal(index);
      });
    });
  }

  // Select all leads checkbox
  selectAllCheckbox.addEventListener('change', (e) => {
    tableBody.querySelectorAll('.lead-select-checkbox').forEach(cb => {
      if (cb.disabled) return;
      cb.checked = e.target.checked;
      const index = parseInt(cb.dataset.index, 10);
      if (e.target.checked) selectedLeads.add(index);
      else selectedLeads.delete(index);
    });
    updateCheckpointCounts();
  });

  // Search filter
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    tableBody.querySelectorAll('tr').forEach(row => {
      const name = row.querySelector('.cell-name').innerText.toLowerCase();
      const title = row.querySelector('.cell-title').innerText.toLowerCase();
      const company = row.querySelector('.cell-company').innerText.toLowerCase();
      row.style.display = (name.includes(query) || title.includes(query) || company.includes(query)) ? '' : 'none';
    });
  });

  // -------------------------------------------------------------
  // Draft Customization Modal Functions
  // -------------------------------------------------------------
  
  function openDraftModal(index) {
    activeEditLeadIndex = index;
    const lead = currentLeads[index];

    modalLeadName.innerText = `${lead.firstName} ${lead.lastName}`;
    modalLeadTitle.innerText = lead.title;
    modalLeadCompany.innerText = lead.company;
    
    modalEmailSubject.value = lead.draftSubject || '';
    modalEmailBody.value = lead.draftBody || '';

    draftModal.classList.remove('hidden');
  }

  closeDraftModalBtn.addEventListener('click', () => {
    draftModal.classList.add('hidden');
    activeEditLeadIndex = null;
  });

  btnSaveDraft.addEventListener('click', () => {
    if (activeEditLeadIndex !== null) {
      const subject = modalEmailSubject.value.trim();
      const body = modalEmailBody.value.trim();

      if (!subject || !body) {
        alert('Subject and Body cannot be empty.');
        return;
      }

      currentLeads[activeEditLeadIndex].draftSubject = subject;
      currentLeads[activeEditLeadIndex].draftBody = body;
      
      log(`Custom email draft saved for lead: ${currentLeads[activeEditLeadIndex].firstName} ${currentLeads[activeEditLeadIndex].lastName}`);
      
      draftModal.classList.add('hidden');
      activeEditLeadIndex = null;
    }
  });

  // -------------------------------------------------------------
  // Trigger Campaigns
  // -------------------------------------------------------------
  
  btnTriggerBrevo.addEventListener('click', async () => {
    const approvedLeads = [];
    selectedLeads.forEach(index => {
      approvedLeads.push(currentLeads[index]);
    });

    if (approvedLeads.length === 0) return;

    log(`Launching Brevo Campaign. Dispatched outreach for ${approvedLeads.length} leads with personalized position drafts.`);
    setStepStatus(5, 'active');

    try {
      const res = await authFetch('/api/pipeline/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: approvedLeads, seedDomain: activeSeedDomain })
      });
      const summary = await res.json();
      
      if (summary.error) throw new Error(summary.error);

      log(`Campaign finished! Deliveries: ${summary.successCount}, Bounces: ${summary.failCount}`, 'success');
      setStepStatus(5, 'completed');

      checkpointView.classList.add('hidden');
      brevoCompleteView.classList.remove('hidden');

      document.getElementById('stats-total').innerText = approvedLeads.length;
      document.getElementById('stats-success').innerText = summary.successCount;
      document.getElementById('stats-failed').innerText = summary.failCount;
      startBtn.disabled = false;
    } catch (err) {
      log(`Brevo send failed: ${err.message}`, 'danger');
      setStepStatus(5, 'error');
      startBtn.disabled = false;
    }
  });

  btnAbortCampaign.addEventListener('click', async () => {
    if (confirm('Abort outreach? Leads will be cleared.')) {
      await abortCampaignLock();
      resetViews();
      stepper.classList.add('hidden');
      log('Campaign cancelled at Safety Checkpoint.', 'danger');
      startBtn.disabled = false;
    }
  });

  btnRunAnother.addEventListener('click', () => {
    resetViews();
    seedInput.value = '';
    stepper.classList.add('hidden');
    consoleDrawer.classList.add('hidden');
    startBtn.disabled = false;
  });

  // Initial Auth Boot trigger
  checkAuth();
});
