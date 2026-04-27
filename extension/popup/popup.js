'use strict';

const KEYS = ['captchaEnabled', 'solverEnabled', 'autofillEnabled', 'apiKey', 'serverUrl', 'isMaster', 'keyName', 'expiresAt', 'profiles', 'activeProfileId', 'isRecording'];

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
            }, () => {
                // Immediate Sync on Login
                chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
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
        el('btn-dashboard').style.display = 'flex';
        setupMasterUI(data);
        initProfiles('master', data);
    } else {
        showView('view-user');
        el('master-tag').style.display = 'none';
        el('btn-dashboard').style.display = 'none';
        setupUserUI(data);
        initProfiles('user', data);
    }
}

// --- Profile Management ---
async function initProfiles(prefix, data) {
    const profiles = data.profiles || [{ id: 'default', name: 'Default Profile' }];
    const activeId = data.activeProfileId || 'default';
    const select = el(`${prefix}-profile-select`);
    const addBtn = el(`${prefix}-btn-add-profile`);

    if (!select || !addBtn) return;

    // Hide profile row for regular users (requested feature)
    if (prefix === 'user') {
        const row = el('user-profile-row');
        if (row) row.style.display = 'none';
    }

    // Render options
    select.innerHTML = profiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    select.value = activeId;

    // Listeners
    select.onchange = async () => {
        const newId = select.value;
        await chrome.storage.local.set({ activeProfileId: newId });
        console.log(`[Popup] Profile switched to: ${newId}`);
    };

    addBtn.onclick = async () => {
        const name = prompt('Enter new Profile Name:');
        if (!name) return;
        const id = 'p_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);
        
        const currentData = await chrome.storage.local.get(['profiles']);
        const currentProfiles = currentData.profiles || [{ id: 'default', name: 'Default Profile' }];
        
        currentProfiles.push({ id, name });
        await chrome.storage.local.set({ profiles: currentProfiles, activeProfileId: id });
        
        // Refresh UI
        initProfiles(prefix, { profiles: currentProfiles, activeProfileId: id });
    };
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
        
        const btn = el('btn-record');
        btn.textContent = newState ? 'Stop Recording' : 'Start Rule Recording';
        if (newState) btn.classList.add('recording-pulse');
        else btn.classList.remove('recording-pulse');
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

    // --- Route Locator Logic ---
    function startLocate(targetField) {
        const status = el('loc-status');
        status.textContent = 'Picker started on tab...';
        status.style.color = 'var(--warning)';
        chrome.storage.local.set({ _popupPendingField: targetField });
        chrome.runtime.sendMessage({ type: 'START_LOCATE', targetField }, (resp) => {
            if (!resp || !resp.ok) {
                status.textContent = resp?.error || 'Failed to start picker.';
                status.style.color = 'var(--danger)';
            } else {
                window.close(); // Close popup so user can pick on the page
            }
        });
    }

    el('btn-loc-img').addEventListener('click', () => startLocate('source'));
    el('btn-loc-input').addEventListener('click', () => startLocate('target'));

    el('btn-save-loc').addEventListener('click', async () => {
        const taskType = el('loc-task-type').value;
        const sourceSelector = el('loc-img').value.trim();
        const targetSelector = el('loc-input').value.trim();
        const status = el('loc-status');

        if (!sourceSelector || !targetSelector) {
            status.textContent = 'Enter source and target selectors.';
            status.style.color = 'var(--danger)';
            return;
        }

        // Get current domain
        let currentDomain = '';
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.url && /^https?:/.test(tabs[0].url)) {
            try { currentDomain = new URL(tabs[0].url).hostname.replace(/^www\./, ''); } catch (_) {}
        }

        if (!currentDomain) {
            status.textContent = 'Cannot detect current site domain.';
            status.style.color = 'var(--danger)';
            return;
        }

        status.textContent = 'Saving route...';
        status.style.color = 'var(--warning)';

        const fieldName = `${taskType}_default`;
        const payload = {
            domain: currentDomain,
            task_type: taskType,
            source_data_type: taskType,
            source_selector: sourceSelector,
            target_data_type: 'text_input',
            target_selector: targetSelector,
            proposed_field_name: fieldName
        };

        // Validate Selectors
        chrome.runtime.sendMessage({ type: 'VALIDATE_SELECTORS', sourceSelector, targetSelector }, (valResp) => {
            if (!valResp?.ok || !valResp.result?.ok) {
                status.textContent = `Invalid selectors: ${valResp?.error || valResp?.result?.error || 'Unknown'}`;
                status.style.color = 'var(--danger)';
                return;
            }
            if (!valResp.result.srcCount || !valResp.result.tgtCount) {
                status.textContent = `Selector not found (src:${valResp.result.srcCount}, tgt:${valResp.result.tgtCount})`;
                status.style.color = 'var(--danger)';
                return;
            }

            // Save to server
            chrome.runtime.sendMessage({ type: 'PROPOSE_FIELD_MAPPING', payload }, (resp) => {
                if (resp?.ok) {
                    // Also propose as locator if it's an image task (backward compat)
                    if (taskType === 'image') {
                        chrome.runtime.sendMessage({ 
                            type: 'PROPOSE_LOCATOR', 
                            domain: currentDomain, 
                            img: sourceSelector, 
                            input: targetSelector 
                        });
                    }

                    status.textContent = `Route saved for ${currentDomain}!`;
                    status.style.color = 'var(--success)';
                    el('loc-img').value = '';
                    el('loc-input').value = '';
                    chrome.storage.local.remove(['_locatedSource', '_locatedTarget', '_popupPendingField']);
                } else {
                    // Fallback to local
                    chrome.storage.local.get(['domainFieldRoutes'], data => {
                        const routes = Array.isArray(data.domainFieldRoutes) ? data.domainFieldRoutes : [];
                        const next = routes.filter(r => !(r.domain === currentDomain && r.sourceSelector === sourceSelector && r.targetSelector === targetSelector));
                        next.push({ domain: currentDomain, taskType, sourceSelector, targetSelector, fieldName, sourceFieldType: taskType, targetFieldType: 'text_input' });
                        chrome.storage.local.set({ domainFieldRoutes: next }, () => {
                            status.textContent = `Sync failed: ${resp?.error || 'Local save OK'}`;
                            status.style.color = 'var(--warning)';
                        });
                    });
                }
            });
        });
    });
});

// Sync state on startup
chrome.storage.local.get(['isRecording', '_locatedSource', '_locatedTarget'], s => {
    const btn = el('btn-record');
    if (btn) {
        btn.textContent = s.isRecording ? 'Stop Recording' : 'Start Rule Recording';
        if (s.isRecording) btn.classList.add('recording-pulse');
        else btn.classList.remove('recording-pulse');
    }
    
    // Restore picked locators
    if (s._locatedSource) {
        const srcInput = el('loc-img');
        if (srcInput) srcInput.value = s._locatedSource;
    }
    if (s._locatedTarget) {
        const tgtInput = el('loc-input');
        if (tgtInput) tgtInput.value = s._locatedTarget;
    }
});
