'use strict';

// ── Globals & Constants ──────────────────────────────────────────────────────
const PROFILE_FIELDS = [];

let state = {
    rules: [],
    settings: {},
    theme: 'dark'
};

function storageGet(keys) {
    return new Promise(resolve => {
        chrome.storage.local.get(keys, resolve);
    });
}

// ── Tab Navigation ──────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        item.classList.add('active');
        document.getElementById('tab-' + item.dataset.tab).classList.add('active');
    });
});

function el(id) { return document.getElementById(id); }

function showMsg(msgId, text, isOk = true) {
    const el2 = el(msgId);
    if (!el2) return;
    el2.textContent = text;
    el2.className = `msg ${isOk ? 'ok' : 'err'}`;
    el2.style.display = 'block';
    setTimeout(() => { el2.style.display = 'none'; }, 4000);
}

// ── Initialization ───────────────────────────────────────────────────────────
async function init() {
    const data = await storageGet(['apiKey', 'serverUrl', 'isMaster', 'rules', 'autofillSettings', 'captchaEnabled', 'solverEnabled', 'autofillEnabled', 'autoRefresh', 'autoScreenshot', 'theme']);
    
    // Check Master Access
    if (!data.isMaster && data.apiKey) {
        document.body.innerHTML = `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 40px; text-align:center;">
                <div style="font-size: 48px; margin-bottom: 20px;">🛡️</div>
                <h1 style="font-size: 24px; font-weight: 800; margin-bottom: 12px;">Master Access Required</h1>
                <p style="color:var(--muted); max-width: 400px; line-height: 1.6; margin-bottom: 30px;">
                    This dashboard is restricted to administrative keys. 
                    Closing in 3 seconds...
                </p>
            </div>
        `;
        setTimeout(() => window.close(), 3000);
        return;
    }

    if (!data.apiKey) {
        document.body.innerHTML = `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 40px; text-align:center;">
                <div style="font-size: 48px; margin-bottom: 20px;">🔑</div>
                <h1 style="font-size: 24px; font-weight: 800; margin-bottom: 12px;">Authentication Required</h1>
                <p style="color:var(--muted); max-width: 400px; line-height: 1.6; margin-bottom: 30px;">
                    Please enter your secret key in the extension popup first to access settings.
                </p>
                <button onclick="window.close()" style="background:var(--primary); color:#fff; border:none; padding:12px 24px; border-radius:12px; font-weight:600; cursor:pointer;">Close</button>
            </div>
        `;
        return;
    }

    // Theme
    state.theme = data.theme || 'dark';
    applyTheme(state.theme);
    // Connection
    if (data.apiKey)    el('api-key').value    = data.apiKey;
    if (data.serverUrl) el('server-url').value = data.serverUrl;
    
    // Rules
    state.rules = data.rules || [];
    renderRules();

    // Services & Settings
    el('tog-captcha').checked  = data.captchaEnabled !== false;
    el('tog-exam').checked     = data.solverEnabled  !== false;
    el('tog-autofill').checked = data.autofillEnabled!== false;
    
    const settings = data.autofillSettings || { skipHidden: true, skipLocked: true, skipPassword: true };
    if (el('set-skip-hidden')) el('set-skip-hidden').checked = settings.skipHidden !== false;
    if (el('set-skip-locked')) el('set-skip-locked').checked = settings.skipLocked !== false;
    if (el('set-skip-password')) el('set-skip-password').checked = settings.skipPassword !== false;

    // Exam
    el('tog-refresh').checked    = data.autoRefresh    !== false;
    el('tog-screenshot').checked = data.autoScreenshot !== false;
    
    if (data.apiKey && data.serverUrl) {
        verifyKey(data.apiKey, data.serverUrl);
        syncRulesFromServer(data.apiKey, data.serverUrl);
    }

    setupDataPortability();
}

function setupDataPortability() {
    el('btn-export').onclick = async () => {
        const data = await chrome.storage.local.get(null);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tata_backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        showMsg('port-msg', 'Backup exported successfully!');
    };

    el('btn-import-trigger').onclick = () => el('input-import').click();

    el('input-import').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (confirm('Are you sure? This will overwrite your current settings and local rules.')) {
                    await chrome.storage.local.set(data);
                    showMsg('port-msg', 'Data imported! Reloading...');
                    setTimeout(() => location.reload(), 1500);
                }
            } catch (err) {
                showMsg('port-msg', 'Invalid JSON file.', false);
            }
        };
        reader.readAsText(file);
    };
}

// ── Profile Manager (REMOVED) ───────────────────────────────────────────────

// ── Connection ───────────────────────────────────────────────────────────────
el('btn-save-conn').addEventListener('click', async () => {
    const apiKey = el('api-key').value.trim();
    const serverUrl = el('server-url').value.trim().replace(/\/$/, '');
    if (!apiKey || !serverUrl) return showMsg('conn-msg', 'API Key and URL required', false);
    
    await chrome.storage.local.set({ apiKey, serverUrl });
    verifyKey(apiKey, serverUrl);
    syncRulesFromServer(apiKey, serverUrl);
});

el('btn-test').addEventListener('click', () => {
    const apiKey = el('api-key').value.trim();
    const serverUrl = el('server-url').value.trim().replace(/\/$/, '');
    verifyKey(apiKey, serverUrl);
});

async function verifyKey(apiKey, serverUrl) {
    showMsg('conn-msg', 'Verifying…');
    try {
        const raw = await new Promise(resolve => {
            chrome.runtime.sendMessage({ type: 'VERIFY_KEY', apiKey, serverUrl }, resolve);
        });
        if (!raw) throw new Error('No response from extension background');
        if (raw.ok === false) throw new Error(raw.error || 'Request failed');
        const data = raw.data || raw;
        if (data.valid) {
            el('key-name').value = data.key_name;
            el('key-expires').value = data.expires_at || 'Never';
            showMsg('conn-msg', `✓ Connected as: ${data.key_name}`);
        } else {
            showMsg('conn-msg', '✗ Invalid API Key', false);
        }
    } catch (e) {
        showMsg('conn-msg', '✗ Connection failed: ' + e.message, false);
    }
}

// ── Rules UI & Modal Logic ───────────────────────────────────────────────────
function renderRules() {
    const tbody = el('rules-table').querySelector('tbody');
    tbody.innerHTML = '';
    const search = el('rule-search')?.value.toLowerCase() || '';
    
    let filtered = state.rules.filter(r => {
        const text = (r.site?.pattern || r.site || '') + JSON.stringify(r.steps || {}) + (r.name || '') + (r.elementId || '') + (r.selector || '');
        return text.toLowerCase().includes(search);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--muted);">No rules found.</td></tr>`;
        return;
    }

    filtered.forEach((r, idx) => {
        const tr = document.createElement('tr');
        
        const site = r.site?.pattern || r.site || 'Global';
        
        let targetDisplay = '';
        if (r.steps && r.steps.length > 0) {
            const s = r.steps[0].selector || {};
            if (s.name) targetDisplay = `<span style="color:var(--success); font-weight:600;">NAME:</span> ${s.name}`;
            else if (s.id) targetDisplay = `<span style="color:var(--primary); font-weight:600;">ID:</span> #${s.id}`;
            else if (s.css) targetDisplay = `<span style="color:var(--warning); font-weight:600;">CSS:</span> ${s.css}`;
        } else {
            if (r.name) targetDisplay = `<span style="color:var(--success); font-weight:600;">NAME:</span> ${r.name}`;
            else if (r.elementId) targetDisplay = `<span style="color:var(--primary); font-weight:600;">ID:</span> #${r.elementId}`;
            else if (r.selector) targetDisplay = `<span style="color:var(--warning); font-weight:600;">CSS:</span> ${r.selector}`;
        }

        let actionDisplay = '';
        const action = r.steps?.[0]?.action || r.action;
        const value = r.steps?.[0]?.value || r.value;
        
        if (action === 'click') actionDisplay = '<span style="color:var(--primary)">🖱️ Click</span>';
        else if (action === 'checkbox') actionDisplay = value ? '☑ Checked' : '☐ Unchecked';
        else actionDisplay = String(value || '');

        tr.innerHTML = `
            <td><input type="checkbox" class="rule-sel" data-id="${idx}"></td>
            <td style="font-size:12px; color:var(--muted);">${site}</td>
            <td style="font-family:monospace; font-size:12px;">${targetDisplay}</td>
            <td><b>${actionDisplay}</b></td>
            <td style="text-align:right">
                <button class="btn btn-outline btn-edit" data-idx="${idx}" style="padding:4px 8px; width:auto; display:inline-block;">✏️</button>
                <button class="btn btn-danger btn-delete" data-idx="${idx}" style="padding:4px 8px; width:auto; display:inline-block;">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

el('rule-search')?.addEventListener('input', renderRules);

// Select All Logic
el('rules-select-all')?.addEventListener('change', e => {
    document.querySelectorAll('.rule-sel').forEach(cb => cb.checked = e.target.checked);
});

// Modal Logic
const ruleModal = el('ruleModal');
function openModal(idx = null) {
    if (idx !== null) {
        const r = state.rules[idx];
        el('editId').value = idx;
        el('editServerRuleId').value = r.server_rule_id || '';
        el('editSite').value = r.site?.pattern || r.site || '';
        
        const target = r.steps?.[0]?.selector || r;
        el('editName').value = target.name || '';
        el('editElementId').value = target.id || target.elementId || '';
        el('editSelector').value = target.css || target.selector || '';
        
        el('editAction').value = r.steps?.[0]?.action || r.action || 'text';
        el('editValue').value = r.steps?.[0]?.value || r.value || '';
    } else {
        el('editId').value = '';
        el('editServerRuleId').value = '';
        el('editSite').value = '';
        el('editName').value = '';
        el('editElementId').value = '';
        el('editSelector').value = '';
        el('editAction').value = 'text';
        el('editValue').value = '';
    }
    ruleModal.style.display = 'flex';
}

el('cancelModal')?.addEventListener('click', () => ruleModal.style.display = 'none');

el('saveModal')?.addEventListener('click', async () => {
    const idx = el('editId').value;
    const site = el('editSite').value.trim();
    const name = el('editName').value.trim();
    const elementId = el('editElementId').value.trim();
    const selector = el('editSelector').value.trim();
    
    if (!site || (!name && !elementId && !selector)) {
        alert("Site and at least one Target (Name, ID, or Selector) are required");
        return;
    }

    let strategy = 'css';
    if (elementId) strategy = 'id';
    else if (name) strategy = 'name';

    const newRule = {
        server_rule_id: el('editServerRuleId').value || null,
        site: { match_mode: 'domainPath', pattern: site },
        steps: [{
            order: 1,
            action: el('editAction').value,
            selector: { strategy, name, id: elementId, css: selector },
            value: el('editValue').value
        }],
        timestamp: Date.now()
    };

    if (idx !== '') {
        state.rules[parseInt(idx)] = newRule;
    } else {
        state.rules.push(newRule);
    }

    await chrome.storage.local.set({ rules: state.rules });
    renderRules();
    ruleModal.style.display = 'none';
    showMsg('rules-msg', '✓ Rule saved locally.');
});

el('rules-table')?.addEventListener('click', async (e) => {
    const target = e.target.closest('button');
    if (!target) return;
    const idx = target.getAttribute('data-idx');
    
    if (target.classList.contains('btn-edit')) {
        openModal(idx);
    } else if (target.classList.contains('btn-delete')) {
        if (confirm("Delete this rule?")) {
            state.rules.splice(idx, 1);
            await chrome.storage.local.set({ rules: state.rules });
            renderRules();
        }
    }
});

el('rules-add-btn')?.addEventListener('click', () => openModal(null));

el('rules-delete-all-btn')?.addEventListener('click', async () => {
    if (confirm("Delete ALL rules?")) {
        state.rules = [];
        await chrome.storage.local.set({ rules: [] });
        renderRules();
        showMsg('rules-msg', '✓ All rules deleted.');
    }
});

// ── Server Sync ──────────────────────────────────────────────────────────────
async function syncRulesFromServer(apiKey, serverUrl) {
    if (!apiKey || !serverUrl) return;
    try {
        const resp = await fetch(`${serverUrl}/v1/autofill/sync`, {
            headers: { 'X-API-Key': apiKey }
        });
        const data = await resp.json();
        if (data.rules) {
            // Merge rules: replace existing server rules with new ones
            const localRules = state.rules.filter(r => !r.server_rule_id);
            state.rules = [...localRules, ...data.rules];
            await chrome.storage.local.set({ rules: state.rules });
            renderRules();
            showMsg('rules-msg', `✓ Auto-synced ${data.rules.length} rules.`);
        }
    } catch (e) {
        console.error('Auto-sync failed:', e);
    }
}

el('rules-sync-btn').addEventListener('click', async () => {
    const { apiKey, serverUrl } = await storageGet(['apiKey', 'serverUrl']);
    if (!apiKey || !serverUrl) return showMsg('rules-msg', 'Set API credentials first', false);

    showMsg('rules-msg', 'Syncing…');
    await syncRulesFromServer(apiKey, serverUrl);
});

el('rules-propose-btn').addEventListener('click', async () => {
    const selectedIdx = Array.from(document.querySelectorAll('.rule-sel:checked')).map(cb => cb.dataset.id);
    if (!selectedIdx.length) return alert('Select rules to propose first.');

    const { apiKey, serverUrl } = await storageGet(['apiKey', 'serverUrl']);
    if (!apiKey || !serverUrl) return alert('Set API credentials first.');

    showMsg('rules-msg', `Proposing ${selectedIdx.length} rules…`);
    let count = 0;
    for (const idx of selectedIdx) {
        const rule = state.rules[parseInt(idx)];
        if (rule.server_rule_id) continue; // Already on server

        try {
            const resp = await fetch(`${serverUrl}/v1/autofill/proposals`, {
                method: 'POST',
                headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idempotency_key: `opt_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
                    submitted_at: new Date().toISOString(),
                    client: {
                        extension_version: chrome.runtime.getManifest().version,
                        schema_version: 26,
                        device_id: 'options_page',
                        browser: 'chrome',
                        os: navigator.platform
                    },
                    rule
                })
            });
            if (resp.ok) count++;
            else {
                const err = await resp.json().catch(() => ({}));
                console.error('[Propose] Failed:', err);
            }
        } catch (e) {
            console.error('[Propose] Error:', e);
        }
    }
    showMsg('rules-msg', `✓ Proposed ${count} rules for review.`);
});

// ── Service Toggles ──────────────────────────────────────────────────────────
el('tog-captcha').addEventListener('change',  e => chrome.storage.local.set({ captchaEnabled:  e.target.checked }));
el('tog-exam').addEventListener('change',     e => chrome.storage.local.set({ solverEnabled:   e.target.checked }));
el('tog-autofill').addEventListener('change', e => chrome.storage.local.set({ autofillEnabled: e.target.checked }));

function saveSettings() {
    const settings = {
        skipHidden: el('set-skip-hidden')?.checked,
        skipLocked: el('set-skip-locked')?.checked,
        skipPassword: el('set-skip-password')?.checked
    };
    chrome.storage.local.set({ autofillSettings: settings });
}

if (el('set-skip-hidden')) el('set-skip-hidden').addEventListener('change', saveSettings);
if (el('set-skip-locked')) el('set-skip-locked').addEventListener('change', saveSettings);
if (el('set-skip-password')) el('set-skip-password').addEventListener('change', saveSettings);

// ── Exam Tab ──────────────────────────────────────────────────────────────────
el('btn-save-exam').addEventListener('click', () => {
    chrome.storage.local.set({
        autoRefresh:    el('tog-refresh').checked,
        autoScreenshot: el('tog-screenshot').checked,
    }, () => showMsg('exam-msg', '✓ Exam settings saved'));
});

// ── Theme Management ─────────────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = el('themeToggleBtn');
    if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
}

el('themeToggleBtn').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(state.theme);
    chrome.storage.local.set({ theme: state.theme });
});

// ── Bootstrap ────────────────────────────────────────────────────────────────
init();
