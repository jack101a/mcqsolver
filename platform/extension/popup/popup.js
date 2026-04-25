'use strict';

const KEYS = ['captchaEnabled', 'solverEnabled', 'autofillEnabled', 'apiKey', 'serverUrl', 'isMaster', 'keyName', 'expiresAt'];

function el(id) { return document.getElementById(id); }

// --- View Management ---
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = el(viewId);
    if (target) target.classList.add('active');
    
    // Update header subtitle
    const sub = el('sub-header');
    if (viewId === 'view-auth') sub.textContent = 'Setup Required';
    else if (viewId === 'view-user') sub.textContent = 'User Mode';
    else if (viewId === 'view-master') sub.textContent = 'Master Control';
}

// --- Status & UI Helpers ---
function updateStatusDot(dotId, state) {
    const dot = el(dotId);
    if (dot) dot.className = `status-dot ${state}`;
}

function calculateExpiry(expiryStr) {
    if (!expiryStr) return 'No Expiry';
    try {
        const exp = new Date(expiryStr);
        const now = new Date();
        const diff = exp.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (days <= 0) return 'Expired';
        return `${days} days remaining`;
    } catch (_) {
        return 'Unknown Expiry';
    }
}

// --- Auth Logic ---
async function handleLogin() {
    const key = el('input-key').value.trim();
    const url = el('input-url').value.trim();
    const errNode = el('auth-error');
    
    if (!key) {
        errNode.textContent = 'Please enter an API key.';
        return;
    }
    
    errNode.textContent = 'Verifying...';
    errNode.style.color = 'var(--warning)';
    
    chrome.runtime.sendMessage({ type: 'VERIFY_KEY', apiKey: key, serverUrl: url }, async (resp) => {
        if (resp?.ok) {
            await chrome.storage.local.set({ 
                apiKey: key, 
                serverUrl: url,
                isMaster: !!resp.data.is_master,
                keyName: resp.data.key_name || 'Generic Key',
                expiresAt: resp.data.expires_at || null
            });
            initApp();
        } else {
            errNode.textContent = resp?.error || 'Verification failed. Check key/URL.';
            errNode.style.color = 'var(--danger)';
        }
    });
}

async function handleLogout() {
    await chrome.storage.local.remove(['apiKey', 'isMaster', 'keyName', 'expiresAt']);
    showView('view-auth');
}

// --- Main Init ---
async function initApp() {
    const data = await chrome.storage.local.get(KEYS);
    
    if (!data.apiKey) {
        showView('view-auth');
        return;
    }

    if (data.isMaster) {
        showView('view-master');
        el('master-tag').style.display = 'block';
        setupMasterUI(data);
    } else {
        showView('view-user');
        el('master-tag').style.display = 'none';
        setupUserUI(data);
    }
}

function setupUserUI(data) {
    el('user-tog-autofill').checked = data.autofillEnabled !== false;
    el('user-tog-captcha').checked = data.captchaEnabled !== false;
    el('user-tog-exam').checked = data.solverEnabled !== false;
    el('user-expiry').textContent = calculateExpiry(data.expiresAt);
    el('user-key-name').textContent = data.keyName || 'Active User';
    
    // Connectivity check placeholder
    updateStatusDot('user-dot', 'ok');
}

function setupMasterUI(data) {
    el('tog-autofill').checked = data.autofillEnabled !== false;
    el('tog-captcha').checked = data.captchaEnabled !== false;
    el('tog-exam').checked = data.solverEnabled !== false;
    
    updateStatusDot('master-dot', 'ok');
    
    // Load stats
    chrome.storage.local.get(['statCaptcha', 'statExam', 'statFill'], s => {
        el('u-captcha').textContent = s.statCaptcha || 0;
        el('u-exam').textContent = s.statExam || 0;
        el('u-fill').textContent = s.statFill || 0;
    });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();

    // Auth
    el('btn-auth-submit').addEventListener('click', handleLogin);
    el('btn-logout').addEventListener('click', handleLogout);
    el('btn-master-logout').addEventListener('click', handleLogout);

    // Toggles - User
    el('user-tog-autofill').addEventListener('change', e => chrome.storage.local.set({ autofillEnabled: e.target.checked }));
    el('user-tog-captcha').addEventListener('change', e => chrome.storage.local.set({ captchaEnabled: e.target.checked }));
    el('user-tog-exam').addEventListener('change', e => chrome.storage.local.set({ solverEnabled: e.target.checked }));

    // Toggles - Master
    el('tog-autofill').addEventListener('change', e => chrome.storage.local.set({ autofillEnabled: e.target.checked }));
    el('tog-captcha').addEventListener('change', e => chrome.storage.local.set({ captchaEnabled: e.target.checked }));
    el('tog-exam').addEventListener('change', e => chrome.storage.local.set({ solverEnabled: e.target.checked }));

    // Master Actions
    el('btn-record').addEventListener('click', async () => {
        const s = await chrome.storage.local.get('isRecording');
        const newState = !s.isRecording;
        await chrome.storage.local.set({ isRecording: newState });
        el('btn-record').textContent = newState ? 'Stop Recording' : 'Start Rule Recording';
        el('btn-record').style.borderColor = newState ? 'var(--danger)' : 'var(--panel-border)';
    });

    el('btn-sync-routes').addEventListener('click', () => {
        el('btn-sync-routes').textContent = 'Syncing...';
        chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, () => {
            el('btn-sync-routes').textContent = 'Sync Complete';
            setTimeout(() => el('btn-sync-routes').textContent = 'Sync Rules with Cloud', 2000);
        });
    });

    el('btn-dashboard').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
});

// Sync recording button state on startup
chrome.storage.local.get('isRecording', s => {
    const btn = el('btn-record');
    if (btn) {
        btn.textContent = s.isRecording ? 'Stop Recording' : 'Start Rule Recording';
        btn.style.borderColor = s.isRecording ? 'var(--danger)' : 'var(--panel-border)';
    }
});
