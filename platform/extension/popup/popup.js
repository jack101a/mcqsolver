'use strict';

const KEYS = ['captchaEnabled', 'solverEnabled', 'autofillEnabled', 'apiKey', 'serverUrl'];

function el(id) { return document.getElementById(id); }

function setStatus(text, state = 'idle') {
    el('status-text').textContent = text;
    const dot = el('conn-dot');
    dot.className = `dot ${state}`;
}

// Load saved settings and apply to toggles
chrome.storage.local.get(KEYS, data => {
    el('tog-captcha').checked = data.captchaEnabled !== false;
    el('tog-exam').checked    = data.solverEnabled  !== false;
    el('tog-autofill').checked= data.autofillEnabled!== false;

    if (data.apiKey) {
        verifyKey();
    } else {
        setStatus('No API key — open Settings', 'err');
    }
});

// Toggle listeners
el('tog-captcha').addEventListener('change', e => {
    chrome.storage.local.set({ captchaEnabled: e.target.checked });
});
el('tog-exam').addEventListener('change', e => {
    chrome.storage.local.set({ solverEnabled: e.target.checked });
});
el('tog-autofill').addEventListener('change', e => {
    chrome.storage.local.set({ autofillEnabled: e.target.checked });
});

// Verify API key
function verifyKey() {
    setStatus('Connecting…', 'idle');
    chrome.runtime.sendMessage({ type: 'VERIFY_KEY' }, resp => {
        if (resp?.ok) {
            setStatus(`Connected — ${resp.data.key_name}`, 'ok');
            el('plan-badge').textContent = 'Active';
        } else {
            setStatus(resp?.error || 'Connection failed', 'err');
        }
    });
}

el('btn-verify').addEventListener('click', verifyKey);

el('btn-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
});

el('link-options').addEventListener('click', e => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
});

// Autofill Actions
chrome.storage.local.get(['activeProfileId', 'profiles', 'isRecording'], data => {
    const activeId = data.activeProfileId || 'default';
    const profiles = data.profiles || [{ id: 'default', name: 'Default Profile' }];
    const activeProfile = profiles.find(p => p.id === activeId) || profiles[0];
    if (activeProfile) {
        el('active-profile-name').textContent = activeProfile.name || activeId;
    }
    el('tog-record').checked = data.isRecording || false;
});

el('tog-record').addEventListener('change', e => {
    const isRecording = e.target.checked;
    chrome.storage.local.set({ isRecording });
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_RECORD', state: isRecording });
    });
});

el('btn-force-autofill').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'FORCE_AUTOFILL' });
    });
    const btn = el('btn-force-autofill');
    const oldText = btn.textContent;
    btn.textContent = '⚡ Running...';
    setTimeout(() => btn.textContent = oldText, 1000);
});

// Load usage stats (local session counters)
chrome.storage.local.get(['statCaptcha', 'statExam', 'statFill'], d => {
    el('u-captcha').textContent = d.statCaptcha || 0;
    el('u-exam').textContent    = d.statExam    || 0;
    el('u-fill').textContent    = d.statFill    || 0;
});
