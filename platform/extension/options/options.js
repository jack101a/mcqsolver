'use strict';

// ── Globals & Constants ──────────────────────────────────────────────────────
const PROFILE_FIELDS = [
    'full_name','first_name','last_name','dob','gender','father_name','mother_name',
    'email','phone','aadhar','pan','dl_number','address','city','state','pincode'
];

let state = {
    profiles: [],
    activeProfileId: 'default',
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
    const data = await storageGet(['apiKey', 'serverUrl', 'isMaster', 'profiles', 'activeProfileId', 'rules', 'autofillSettings', 'captchaEnabled', 'solverEnabled', 'autofillEnabled', 'autoRefresh', 'autoScreenshot', 'theme']);
    
    // Check Master Access
    if (!data.isMaster && data.apiKey) {
        document.body.innerHTML = `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 40px; text-align:center;">
                <div style="font-size: 48px; margin-bottom: 20px;">🛡️</div>
                <h1 style="font-size: 24px; font-weight: 800; margin-bottom: 12px;">Restricted Access</h1>
                <p style="color:var(--muted); max-width: 400px; line-height: 1.6; margin-bottom: 30px;">
                    This options page contains advanced configuration tools reserved for Master Key holders. 
                    Regular users can manage their settings directly through the extension popup.
                </p>
                <button onclick="window.close()" style="background:var(--primary); color:#fff; border:none; padding:12px 24px; border-radius:12px; font-weight:600; cursor:pointer;">Close Settings</button>
            </div>
        `;
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
    
    // Profiles
    state.profiles = data.profiles || [{ id: 'default', name: 'Default Profile', data: {} }];
    state.activeProfileId = data.activeProfileId || 'default';
    renderProfileSelect();
    loadProfileData(state.activeProfileId);

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
    }
}

// ── Profile Manager ──────────────────────────────────────────────────────────
function renderProfileSelect() {
    const sel = el('pm-profile-select');
    sel.innerHTML = '';
    state.profiles.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === state.activeProfileId) opt.selected = true;
        sel.appendChild(opt);
    });
}

function loadProfileData(profileId) {
    const profile = state.profiles.find(p => p.id === profileId) || state.profiles[0];
    const data = profile.data || {};
    PROFILE_FIELDS.forEach(f => {
        const inp = el('p-' + f);
        if (inp) inp.value = data[f] || '';
    });
}

el('pm-profile-select').addEventListener('change', e => {
    state.activeProfileId = e.target.value;
    loadProfileData(state.activeProfileId);
    chrome.storage.local.set({ activeProfileId: state.activeProfileId });
});

el('pm-add-btn').addEventListener('click', () => {
    const name = prompt('Enter new profile name:');
    if (!name) return;
    const id = 'p_' + Date.now();
    state.profiles.push({ id, name, data: {} });
    state.activeProfileId = id;
    renderProfileSelect();
    loadProfileData(id);
    chrome.storage.local.set({ profiles: state.profiles, activeProfileId: id });
});

el('pm-rename-btn').addEventListener('click', () => {
    const profile = state.profiles.find(p => p.id === state.activeProfileId);
    const name = prompt('Rename profile:', profile.name);
    if (!name) return;
    profile.name = name;
    renderProfileSelect();
    chrome.storage.local.set({ profiles: state.profiles });
});

el('pm-delete-btn').addEventListener('click', () => {
    if (state.profiles.length <= 1) return alert('Cannot delete the last profile.');
    if (!confirm('Delete this profile and all its data?')) return;
    state.profiles = state.profiles.filter(p => p.id !== state.activeProfileId);
    state.activeProfileId = state.profiles[0].id;
    renderProfileSelect();
    loadProfileData(state.activeProfileId);
    chrome.storage.local.set({ profiles: state.profiles, activeProfileId: state.activeProfileId });
});

el('btn-save-profile').addEventListener('click', () => {
    const profile = state.profiles.find(p => p.id === state.activeProfileId);
    PROFILE_FIELDS.forEach(f => {
        profile.data[f] = el('p-' + f).value.trim();
    });
    chrome.storage.local.set({ profiles: state.profiles }, () => {
        showMsg('profile-msg', '✓ Profile saved locally.');
    });
});

// ── Connection ───────────────────────────────────────────────────────────────
el('btn-save-conn').addEventListener('click', async () => {
    const apiKey = el('api-key').value.trim();
    const serverUrl = el('server-url').value.trim().replace(/\/$/, '');
    if (!apiKey || !serverUrl) return showMsg('conn-msg', 'API Key and URL required', false);
    
    await chrome.storage.local.set({ apiKey, serverUrl });
    verifyKey(apiKey, serverUrl);
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

// ── Rules Manager ────────────────────────────────────────────────────────────
function renderRules() {
    const tbody = el('rules-table').querySelector('tbody');
    tbody.innerHTML = '';
    
    const filter = el('rule-search').value.toLowerCase();
    const profileFilter = el('rule-profile-filter').value;

    state.rules.forEach((rule, idx) => {
        if (filter && !rule.site.pattern.toLowerCase().includes(filter)) return;
        if (profileFilter !== 'all' && rule.profile_scope !== profileFilter) return;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="rule-sel" data-id="${idx}"></td>
            <td>
                <div class="badge badge-id">${rule.server_rule_id || 'LOCAL'}</div>
                <div style="margin-top:4px; font-family:monospace; font-size:11px">${rule.site.pattern}</div>
            </td>
            <td style="font-family:monospace; font-size:11px">${rule.steps[0]?.selector?.css || rule.steps[0]?.selector?.id || '—'}</td>
            <td><span class="badge badge-action">${rule.steps[0]?.action || '—'}</span></td>
            <td><div style="max-width:150px; overflow:hidden; text-overflow:ellipsis" title="${rule.steps[0]?.value}">${rule.steps[0]?.value || '—'}</div></td>
            <td>
                <div class="btn-row" style="margin-top:0">
                    <button class="btn2 btn-outline btn-xs btn-edit" data-id="${idx}">Edit</button>
                    <button class="btn2 btn-danger btn-xs btn-del" data-id="${idx}">Del</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

el('rule-search').addEventListener('input', renderRules);

el('rules-add-btn').addEventListener('click', () => {
    el('rule-modal-title').textContent = 'Add New Rule';
    el('rm-pattern').value = '';
    el('rm-selector').value = '';
    el('rm-value').value = '';
    el('rule-modal').classList.add('active');
});

el('rm-cancel-btn').addEventListener('click', () => el('rule-modal').classList.remove('active'));

el('rm-save-btn').addEventListener('click', () => {
    const pattern = el('rm-pattern').value.trim();
    const action = el('rm-action').value;
    const strategy = el('rm-strategy').value;
    const selectorVal = el('rm-selector').value.trim();
    const value = el('rm-value').value.trim();

    if (!pattern || !selectorVal) return alert('Pattern and Selector are required');

    const selector = { strategy };
    if (strategy === 'id') selector.id = selectorVal;
    else if (strategy === 'name') selector.name = selectorVal;
    else if (strategy === 'css') selector.css = selectorVal;

    const newRule = {
        site: { match_mode: 'domainPath', pattern },
        profile_scope: state.activeProfileId,
        steps: [{ order: 1, action, value, selector }]
    };

    state.rules.push(newRule);
    chrome.storage.local.set({ rules: state.rules });
    renderRules();
    el('rule-modal').classList.remove('active');
});

el('rules-table').addEventListener('click', e => {
    if (e.target.classList.contains('btn-del')) {
        const idx = e.target.dataset.id;
        state.rules.splice(idx, 1);
        chrome.storage.local.set({ rules: state.rules });
        renderRules();
    }
});

// ── Server Sync ──────────────────────────────────────────────────────────────
el('rules-sync-btn').addEventListener('click', async () => {
    const { apiKey, serverUrl } = await storageGet(['apiKey', 'serverUrl']);
    if (!apiKey || !serverUrl) return showMsg('rules-msg', 'Set API credentials first', false);

    showMsg('rules-msg', 'Syncing…');
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
            showMsg('rules-msg', `✓ Synced ${data.rules.length} approved rules.`);
        }
    } catch (e) {
        showMsg('rules-msg', '✗ Sync failed', false);
    }
});

el('rules-propose-btn').addEventListener('click', async () => {
    const selectedIdx = Array.from(document.querySelectorAll('.rule-sel:checked')).map(cb => cb.dataset.id);
    if (!selectedIdx.length) return alert('Select rules to propose first.');

    const { apiKey, serverUrl } = await storageGet(['apiKey', 'serverUrl']);
    if (!apiKey || !serverUrl) return alert('Set API credentials first.');

    showMsg('rules-msg', `Proposing ${selectedIdx.length} rules…`);
    let count = 0;
    for (const idx of selectedIdx) {
        const rule = state.rules[idx];
        if (rule.server_rule_id) continue; // Already on server

        try {
            await fetch(`${serverUrl}/v1/autofill/proposals`, {
                method: 'POST',
                headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idempotency_key: `opt_${Date.now()}_${idx}`,
                    submitted_at: new Date().toISOString(),
                    client: {
                        extension_version: '2.1.0',
                        schema_version: 2,
                        device_id: 'options_page',
                        browser: 'chrome',
                        os: navigator.platform
                    },
                    rule
                })
            });
            count++;
        } catch (e) {}
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
