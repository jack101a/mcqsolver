// background.js — Unified Platform Extension (V2.1)
// Lightweight API relay and local storage management.

'use strict';

const API_BASE = 'http://localhost:8080'; // Default dev server

async function getSettings() {
    return new Promise(resolve => {
        chrome.storage.local.get(['apiKey', 'serverUrl'], data => {
            resolve({
                apiKey:    data.apiKey    || '',
                serverUrl: data.serverUrl || API_BASE,
            });
        });
    });
}

async function apiPost(path, body) {
    const { apiKey, serverUrl } = await getSettings();
    if (!apiKey) throw new Error('No API key configured');
    const resp = await fetch(`${serverUrl}${path}`, {
        method:  'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key':    apiKey,
        },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return resp.json();
}

async function apiGet(path) {
    const { apiKey, serverUrl } = await getSettings();
    if (!apiKey) throw new Error('No API key configured');
    const resp = await fetch(`${serverUrl}${path}`, {
        headers: { 'X-API-Key': apiKey },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    // ── Text Captcha ─────────────────────────────────────────────────────
    if (msg.type === 'SOLVE_CAPTCHA') {
        apiPost('/v1/solve', {
            type: 'image',
            payload_base64: msg.imageB64,
            domain: msg.domain,
            mode: 'fast',
        })
        .then(data => sendResponse({ ok: true, result: data.result, ms: data.processing_ms }))
        .catch(err  => sendResponse({ ok: false, error: err.message }));
        return true;
    }

    // ── Exam Solver ──────────────────────────────────────────────────────
    if (msg.type === 'SOLVE_EXAM') {
        apiPost('/v1/exam/solve', {
            question_image_b64: msg.questionB64,
            option_images_b64:  msg.optionB64s,
            domain: msg.domain,
        })
        .then(data => sendResponse({ ok: true, data }))
        .catch(err  => sendResponse({ ok: false, error: err.message }));
        return true;
    }

    // ── Interaction Recorder ─────────────────────────────────────────────
    if (msg.type === 'RECORD_STEP') {
        chrome.storage.local.get(['rules', 'activeProfileId'], data => {
            const rules = data.rules || [];
            const rule = msg.rule;
            rule.profile_scope = data.activeProfileId || 'default';
            rules.push(rule);
            chrome.storage.local.set({ rules });
        });
        return false;
    }

    // ── Screenshot on exam pass ───────────────────────────────────────────
    if (msg.type === 'CAPTURE_SCREENSHOT') {
        const tabId = sender.tab?.id;
        if (!tabId) return false;
        chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 }, dataUrl => {
            if (chrome.runtime.lastError || !dataUrl) return;
            const ts       = new Date().toISOString().replace(/[:.]/g, '-').replace('T','_').slice(0,19);
            const filename = `result_${ts}.png`;
            chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
        });
        return false;
    }

    // ── Abort tab ───────────────────────────────────────────────────────
    if (msg.type === 'ABORT_TAB') {
        if (sender.tab?.id) {
            chrome.tabs.update(sender.tab.id, { url: 'https://www.google.com' });
        }
        return false;
    }
});
