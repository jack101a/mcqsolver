// background.js — Unified Platform Extension (V2.2)
// Lightweight API relay + auto-sync engine.
// Routes/locators are synced from backend every 5 min automatically — no manual refresh needed.

'use strict';

const API_BASE       = 'http://localhost:8080';
const SYNC_ALARM     = 'auto_sync';
const SYNC_PERIOD_MIN = 5; // minutes between background syncs

// ─────────────────────────────────────────────────────────────────
// Settings helpers
// ─────────────────────────────────────────────────────────────────

function getSettings() {
    return new Promise(resolve => {
        chrome.storage.local.get(['apiKey', 'serverUrl'], d => {
            resolve({
                apiKey:    d.apiKey    || '',
                serverUrl: d.serverUrl || API_BASE,
            });
        });
    });
}

// ─────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────

async function apiGet(path) {
    const { apiKey, serverUrl } = await getSettings();
    if (!apiKey) throw new Error('No API key configured');
    const resp = await fetch(`${serverUrl}${path}`, {
        headers: { 'X-API-Key': apiKey },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
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

// ─────────────────────────────────────────────────────────────────
// Auto-sync: pull routes + locators from backend → chrome.storage
// Content scripts read from storage — no restart needed.
// ─────────────────────────────────────────────────────────────────

async function syncAll(source) {
    const { apiKey } = await getSettings();
    if (!apiKey) {
        console.log('[Sync] Skipped — no API key');
        return { ok: false, reason: 'no_key' };
    }

    const results = { routes: false, locators: false };

    // 1. Field-mapping routes (domain → [{source_selector, target_selector, task_type, …}])
    try {
        const routes = await apiGet('/v1/field-mappings/routes');
        await chrome.storage.local.set({ globalFieldRoutes: routes, lastSync: Date.now() });
        results.routes = Object.keys(routes).length;
        console.log(`[Sync:${source}] Routes synced — ${results.routes} domains`);
    } catch (e) {
        console.warn('[Sync] Routes failed:', e.message);
    }

    // 2. Custom locators (domain → {img, input} pairs)
    try {
        const locators = await apiGet('/v1/locators');
        await chrome.storage.local.set({ globalLocators: locators });
        results.locators = Object.keys(locators || {}).length;
        console.log(`[Sync:${source}] Locators synced — ${results.locators} domains`);
    } catch (e) {
        console.warn('[Sync] Locators failed:', e.message);
    }

    return { ok: true, ...results };
}

// ─────────────────────────────────────────────────────────────────
// Chrome Alarms — periodic auto-sync every SYNC_PERIOD_MIN minutes
// ─────────────────────────────────────────────────────────────────

chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MIN });

chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === SYNC_ALARM) syncAll('alarm');
});

// ─────────────────────────────────────────────────────────────────
// Sync on install / startup / service-worker wake
// ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => syncAll('install'));
chrome.runtime.onStartup.addListener(() => syncAll('startup'));

// Sync immediately when service worker starts (covers wake-from-sleep)
syncAll('wake');

// ─────────────────────────────────────────────────────────────────
// Broadcast storage changes to all active content scripts
// so they pick up new routes without a page reload.
// ─────────────────────────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!changes.globalFieldRoutes && !changes.globalLocators) return;
    chrome.tabs.query({}, tabs => {
        for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, { type: 'ROUTES_UPDATED' }).catch(() => {});
        }
    });
});

// ─────────────────────────────────────────────────────────────────
// Message Router
// ─────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    // ── Text Captcha ────────────────────────────────────────────
    if (msg.type === 'SOLVE_CAPTCHA') {
        apiPost('/v1/solve', {
            type:           'image',
            payload_base64: msg.imageB64,
            domain:         msg.domain,
            field_name:     msg.field_name || 'image_default',
            mode:           'fast',
        })
        .then(d => sendResponse({ ok: true, result: d.result, ms: d.processing_ms }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    // ── Verify API Key ──────────────────────────────────────────
    if (msg.type === 'VERIFY_KEY') {
        apiGet('/v1/auth/verify')
        .then(d => sendResponse({ ok: true, data: d }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    // ── Exam Solver ─────────────────────────────────────────────
    if (msg.type === 'SOLVE_EXAM') {
        apiPost('/v1/exam/solve', {
            question_image_b64: msg.questionB64,
            option_images_b64:  msg.optionB64s,
            domain:             msg.domain,
        })
        .then(d => sendResponse({ ok: true, data: d }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    // ── Manual sync trigger (from popup/options) ─────────────────
    if (msg.type === 'SYNC_NOW') {
        syncAll('manual')
        .then(r => sendResponse({ ok: true, ...r }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    // ── Interaction Recorder ────────────────────────────────────
    if (msg.type === 'RECORD_STEP') {
        chrome.storage.local.get(['rules', 'activeProfileId'], data => {
            const rules = data.rules || [];
            const rule  = msg.rule;
            rule.profile_scope = data.activeProfileId || 'default';
            rules.push(rule);
            chrome.storage.local.set({ rules });
        });
        return false;
    }

    // ── Screenshot on exam pass ──────────────────────────────────
    if (msg.type === 'CAPTURE_SCREENSHOT') {
        const tabId = sender.tab?.id;
        if (!tabId) return false;
        chrome.tabs.captureVisibleTab({ format: 'png', quality: 100 }, dataUrl => {
            if (chrome.runtime.lastError || !dataUrl) return;
            const ts       = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
            const filename = `result_${ts}.png`;
            chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
        });
        return false;
    }

    // ── Abort tab ────────────────────────────────────────────────
    if (msg.type === 'ABORT_TAB') {
        if (sender.tab?.id) {
            chrome.tabs.update(sender.tab.id, { url: 'https://www.google.com' });
        }
        return false;
    }
});
