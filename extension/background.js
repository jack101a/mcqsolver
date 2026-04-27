// background.js — Unified Platform Extension (V2.2)
// Lightweight API relay + auto-sync engine.
// Routes/locators are synced from backend every 5 min automatically — no manual refresh needed.


// ─────────────────────────────────────────────────────────────────
// Settings helpers
// ─────────────────────────────────────────────────────────────────

'use strict';

const API_BASE = 'http://localhost:8080';
const SYNC_ALARM = 'auto_sync';
const SYNC_PERIOD_MIN = 5;
let cachedDeviceId = '';
let pendingDeviceIdPromise = null;

function getSettings() {
    return new Promise(resolve => {
        chrome.storage.local.get(['apiKey', 'serverUrl', 'deviceId'], d => {
            resolve({
                apiKey:    d.apiKey    || '',
                serverUrl: d.serverUrl || API_BASE,
                deviceId:  d.deviceId  || '',
            });
        });
    });
}

function storageGet(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function storageSet(obj) {
    return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

function normalizeDomain(value) {
    let token = String(value || '').trim().toLowerCase();
    if (!token) return '';
    try {
        if (token.includes('://')) token = new URL(token).hostname;
    } catch (_) {}
    token = token.split('/', 1)[0].split(':', 1)[0].replace(/\.$/, '');
    if (token.startsWith('www.')) token = token.slice(4);
    return token;
}

async function getDeviceId() {
    if (cachedDeviceId) return cachedDeviceId;
    if (pendingDeviceIdPromise) return pendingDeviceIdPromise;

    pendingDeviceIdPromise = (async () => {
        const data = await storageGet(['deviceId']);
        const stored = String(data.deviceId || '').trim();
        if (stored) {
            cachedDeviceId = stored;
            return cachedDeviceId;
        }

        const generated = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `dev_${chrome.runtime.id}_${Date.now()}`;
        await storageSet({ deviceId: generated });
        cachedDeviceId = generated;
        return cachedDeviceId;
    })();

    try {
        return await pendingDeviceIdPromise;
    } finally {
        pendingDeviceIdPromise = null;
    }
}

// ─────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────

async function apiGet(path) {
    const { apiKey, serverUrl } = await getSettings();
    if (!apiKey) throw new Error('No API key configured');
    console.log(`[API] GET ${path}`);
    const resp = await fetch(`${serverUrl}${path}`, {
        headers: { 'X-API-Key': apiKey, 'X-Device-ID': await getDeviceId() },
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        console.error(`[API] GET ${path} error:`, err);
        throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return resp.json();
}

async function apiPost(path, body) {
    const { apiKey, serverUrl } = await getSettings();
    if (!apiKey) throw new Error('No API key configured');
    console.log(`[API] POST ${path}`, body);
    const resp = await fetch(`${serverUrl}${path}`, {
        method:  'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key':    apiKey,
            'X-Device-ID':  await getDeviceId(),
        },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        console.error(`[API] POST ${path} error:`, err);
        throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    console.log(`[API] POST ${path} success:`, data);
    return data;
}

async function incrementStat(key) {
    const data = await storageGet([key]);
    const val = (data[key] || 0) + 1;
    await storageSet({ [key]: val });
}

async function startLocate(targetField) {
    let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url || !/^https?:/i.test(tab.url)) {
        const candidates = await chrome.tabs.query({ lastFocusedWindow: true });
        tab = candidates.find(t => t.url && /^https?:/i.test(t.url));
    }
    if (!tab) throw new Error('Open the target website tab first.');

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['locator_picker.js'],
    });
    await chrome.tabs.sendMessage(tab.id, { type: 'PICK_ELEMENT', targetField });
    return { started: true };
}

function notifyRuntime(message) {
    try {
        chrome.runtime.sendMessage(message, () => {
            void chrome.runtime.lastError;
        });
    } catch (_) {}
}

async function validateSelectors(sourceSelector, targetSelector) {
    let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url || !/^https?:/i.test(tab.url)) {
        const candidates = await chrome.tabs.query({ lastFocusedWindow: true });
        tab = candidates.find(t => t.url && /^https?:/i.test(t.url));
    }
    if (!tab) throw new Error('Open the target website tab first.');

    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (src, tgt) => {
            try {
                return {
                    ok: true,
                    srcCount: src ? document.querySelectorAll(src).length : 0,
                    tgtCount: tgt ? document.querySelectorAll(tgt).length : 0,
                    href: location.href,
                };
            } catch (e) {
                return { ok: false, error: String(e) };
            }
        },
        args: [sourceSelector, targetSelector],
    });
    return result || { ok: false, error: 'No validation result' };
}

async function syncPendingRoutesToServer() {
    const data = await storageGet(['domainFieldRoutes', 'globalFieldRoutes']);
    const routes = Array.isArray(data.domainFieldRoutes) ? data.domainFieldRoutes : [];
    const globalRoutes = data.globalFieldRoutes || {};
    const serverSet = new Set();
    Object.entries(globalRoutes).forEach(([domain, entries]) => {
        (entries || []).forEach(entry => {
            serverSet.add([
                normalizeDomain(domain),
                String(entry.task_type || entry.source_data_type || 'image').trim(),
                String(entry.source_selector || '').trim(),
                String(entry.target_selector || '').trim(),
            ].join('|'));
        });
    });

    let proposed = 0;
    let failed = 0;
    let skipped = 0;
    const kept = [];
    const seenLocal = new Set();
    for (const route of routes) {
        const sig = [
            normalizeDomain(route.domain),
            String(route.taskType || '').trim(),
            String(route.sourceSelector || '').trim(),
            String(route.targetSelector || '').trim(),
        ].join('|');
        if (serverSet.has(sig) || seenLocal.has(sig)) {
            skipped++;
            continue;
        }
        seenLocal.add(sig);
        kept.push(route);
        try {
            await apiPost('/v1/field-mappings/propose', {
                domain: normalizeDomain(route.domain),
                task_type: route.taskType,
                source_data_type: route.taskType,
                source_selector: route.sourceSelector,
                target_data_type: 'text_input',
                target_selector: route.targetSelector,
                proposed_field_name: route.fieldName || `${route.taskType}_default`,
            });
            if (route.taskType === 'image') {
                await apiPost('/v1/locators/propose', {
                    domain: normalizeDomain(route.domain),
                    image_selector: route.sourceSelector,
                    input_selector: route.targetSelector,
                });
            }
            proposed++;
        } catch (_) {
            failed++;
        }
    }
    if (kept.length !== routes.length) await storageSet({ domainFieldRoutes: kept });
    return { proposed, failed, skipped, total: routes.length };
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

    const results = { routes: false, locators: false, rules: false };

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

    // 3. Autofill Rules
    try {
        const data = await apiGet('/v1/autofill/sync');
        if (data.rules) {
            const localData = await storageGet(['rules']);
            const localRules = (localData.rules || []).filter(r => !r.server_rule_id);
            const merged = [...localRules, ...data.rules];
            await chrome.storage.local.set({ rules: merged });
            results.rules = data.rules.length;
            console.log(`[Sync:${source}] Rules synced — ${results.rules} rules`);
        }
    } catch (e) {
        console.warn('[Sync] Rules failed:', e.message);
    }

    return { ok: true, ...results };
}

// ─────────────────────────────────────────────────────────────────
// Chrome Alarms — periodic auto-sync every SYNC_PERIOD_MIN minutes
// ─────────────────────────────────────────────────────────────────

chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MIN });

chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === SYNC_ALARM) {
        syncAll('alarm');
        // Periodic verification to keep isMaster/expiresAt fresh
        apiGet('/v1/auth/verify').then(d => {
            chrome.storage.local.set({
                isMaster: !!d.is_master,
                keyName: d.key_name || '',
                expiresAt: d.expires_at || null,
                lastVerify: Date.now()
            });
        }).catch(() => {});
    }
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
            try {
                chrome.tabs.sendMessage(tab.id, { type: 'ROUTES_UPDATED' }, () => {
                    void chrome.runtime.lastError;
                });
            } catch (_) {}
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
            type:           msg.taskType || 'image',
            payload_base64: msg.imageB64,
            domain:         msg.domain,
            field_name:     msg.field_name || 'image_default',
            mode:           'fast',
        })
        .then(d => {
            incrementStat('statCaptcha');
            sendResponse({ ok: true, result: d.result, ms: d.processing_ms });
        })
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    // ── Verify API Key ──────────────────────────────────────────
    if (msg.type === 'VERIFY_KEY') {
        const url = msg.serverUrl || null;
        const key = msg.apiKey || null;
        
        let promise;
        if (url && key) {
            // Manual check (e.g. from options test button)
            promise = getDeviceId().then(devId => {
                return fetch(`${url}/v1/auth/verify`, {
                    headers: { 'X-API-Key': key, 'X-Device-ID': devId }
                }).then(async r => {
                    if (!r.ok) {
                        const err = await r.json().catch(() => ({ detail: r.statusText }));
                        throw new Error(err.detail || `HTTP ${r.status}`);
                    }
                    return r.json();
                });
            });
        } else {
            promise = apiGet('/v1/auth/verify');
        }

        promise
            .then(d => {
                // Persist metadata so popup/options can detect Master Mode vs User Mode
                chrome.storage.local.set({
                    isMaster: !!d.is_master,
                    keyName: d.key_name || '',
                    expiresAt: d.expires_at || null,
                    lastVerify: Date.now()
                });
                sendResponse({ ok: true, data: d });
            })
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
        .then(data => {
            incrementStat('statExam');
            sendResponse({ ok: true, data });
        })
        .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
    }

    // ── Manual sync trigger (from popup/options) ─────────────────
    if (msg.type === 'SYNC_NOW') {
        syncAll('manual')
        .then(r => sendResponse({ ok: true, ...r }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    if (msg.type === 'START_LOCATE') {
        startLocate(msg.targetField)
        .then(r => sendResponse({ ok: true, result: r }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    if (msg.type === 'VALIDATE_SELECTORS') {
        validateSelectors(msg.sourceSelector, msg.targetSelector)
        .then(r => sendResponse({ ok: true, result: r }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    if (msg.type === 'LOCATOR_PICKED') {
        const key = msg.targetField === 'target' ? '_locatedTarget' : '_locatedSource';
        chrome.storage.local.set({ [key]: msg.selector, _popupPendingField: '' }, () => {
            notifyRuntime({
                type: 'LOCATOR_PICKED_UI',
                targetField: msg.targetField,
                selector: msg.selector,
            });
            sendResponse({ ok: true, result: { stored: true } });
        });
        return true;
    }

    if (msg.type === 'LOCATOR_CANCELLED') {
        chrome.storage.local.set({ _popupPendingField: '' }, () => {
            notifyRuntime({
                type: 'LOCATOR_CANCELLED_UI',
                targetField: msg.targetField,
            });
            sendResponse({ ok: true, result: { cancelled: true } });
        });
        return true;
    }

    if (msg.type === 'PROPOSE_FIELD_MAPPING') {
        apiPost('/v1/field-mappings/propose', msg.payload)
        .then(r => sendResponse({ ok: true, result: r }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    if (msg.type === 'PROPOSE_LOCATOR') {
        apiPost('/v1/locators/propose', {
            domain: msg.domain,
            image_selector: msg.img,
            input_selector: msg.input,
        })
        .then(r => sendResponse({ ok: true, result: r }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    if (msg.type === 'SYNC_PENDING_ROUTES') {
        syncPendingRoutesToServer()
        .then(r => sendResponse({ ok: true, result: r }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    if (msg.type === 'INCREMENT_STAT') {
        incrementStat(msg.key);
        return false;
    }

    // ── Interaction Recorder ────────────────────────────────────
    if (msg.type === 'RECORD_STEP') {
        chrome.storage.local.get(['rules', 'activeProfileId', 'isMaster', 'apiKey'], data => {
            const rules = data.rules || [];
            const rule  = msg.rule;
            rule.profile_scope = data.activeProfileId || 'default';
            rule.local_rule_id = rule.local_rule_id || `local_${Date.now()}`;
            const last = rules[rules.length - 1];
            const lastStep = last?.steps?.[0];
            const nextStep = rule?.steps?.[0];
            const sameLast = last
                && last.site?.pattern === rule.site?.pattern
                && JSON.stringify(lastStep?.selector || {}) === JSON.stringify(nextStep?.selector || {})
                && lastStep?.action === nextStep?.action
                && String(lastStep?.value) === String(nextStep?.value);
            
            if (!sameLast) {
                rules.push(rule);
                // Auto-propose to server if Master key is active
                if (data.isMaster && data.apiKey) {
                    getDeviceId().then(devId => {
                        apiPost('/v1/autofill/proposals', {
                            idempotency_key: rule.local_rule_id,
                            submitted_at: new Date().toISOString(),
                            client: {
                                extension_version: chrome.runtime.getManifest().version,
                                schema_version: 26,
                                device_id: devId,
                                browser: 'chrome',
                                os: 'windows' // Simplified for now
                            },
                            rule: {
                                local_rule_id: rule.local_rule_id,
                                name: rule.name,
                                site: rule.site,
                                steps: rule.steps,
                                profile_scope: rule.profile_scope || 'default',
                                priority: 100,
                                meta: rule.meta || {}
                            }
                        }, data.apiKey).catch(e => console.warn('[Autofill] Auto-propose failed:', e.message));
                    });
                }
            }

            chrome.storage.local.set({ rules }, () => {
                if (!sameLast) {
                    let host = '';
                    try {
                        host = sender?.tab?.url ? new URL(sender.tab.url).hostname : '';
                    } catch (_) {}
                    notifyRuntime({
                        type: 'RECORD_STEP_SAVED',
                        action: nextStep?.action || '',
                        host,
                    });
                }
            });
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
