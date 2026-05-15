const ALLOWED_PAGE_HOSTS = new Set(["sarathi.parivahan.gov.in"]);

// State to track content script readiness and DPR per tab
const tabState = new Map();

/** Always reads the latest server URL from storage. */
async function getBackend() {
    return new Promise((resolve) => {
        chrome.storage.sync.get({ server_url: "http://127.0.0.1:8765" }, ({ server_url }) => {
            let value = (server_url || "http://127.0.0.1:8765").toString().trim();
            if (value && !value.startsWith("http")) {
                value = "http://" + value;
            }
            resolve(value.replace(/\/+$/, "") || "http://127.0.0.1:8765");
        });
    });
}

function isAllowedPageUrl(url) {
    try {
        const u = new URL(url || "");
        return ALLOWED_PAGE_HOSTS.has(u.hostname);
    } catch (_e) {
        return false;
    }
}

function executeScriptPromise(target, func, args = []) {
    return new Promise((resolve, reject) => {
        chrome.scripting.executeScript({ target, func, args }, (results) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(results || []);
        });
    });
}

function captureVisibleTabPromise(windowId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
            if (chrome.runtime.lastError || !dataUrl) {
                const raw = chrome.runtime.lastError?.message || "No screen data";
                const msg = String(raw || "");
                if (msg.includes("Either the <all_urls> or 'activeTab' permission is required")) {
                    reject(new Error("Capture permission missing. Enable extension Site access = On all sites, reload the tab, then click extension icon once."));
                    return;
                }
                reject(new Error(raw));
                return;
            }
            resolve(dataUrl);
        });
    });
}

async function captureStableWindowPng(tabId, windowId) {
    if (!tabId) {
        return captureVisibleTabPromise(windowId);
    }
    let previousScroll = null;
    try {
        const before = await executeScriptPromise(
            { tabId },
            () => ({ x: window.scrollX || 0, y: window.scrollY || 0 })
        );
        previousScroll = before?.[0]?.result || null;
        await executeScriptPromise(
            { tabId },
            () => {
                window.scrollTo(0, 0);
                const iframe = document.querySelector("iframe#stallexam, iframe[name='stallexam']");
                try {
                    iframe?.contentWindow?.scrollTo(0, 0);
                } catch (_e) {}
                return true;
            }
        );
        await new Promise((r) => setTimeout(r, 120));
        const dataUrl = await captureVisibleTabPromise(windowId);
        if (previousScroll) {
            await executeScriptPromise(
                { tabId },
                (pos) => {
                    window.scrollTo(pos?.x || 0, pos?.y || 0);
                    return true;
                },
                [previousScroll]
            );
        }
        return dataUrl;
    } catch (_e) {
        // Fallback to default capture path if script injection/scroll normalization fails.
        return captureVisibleTabPromise(windowId);
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    // ----------------------------------------------------------------
    //  PHASE 1: Parse answer directly from page show() function
    //  Runs in MAIN world (same JS world as page / dev console)
    // ----------------------------------------------------------------
    if (msg.type === "PARSE_SHOW_ANSWER") {
        const tabId = sender?.tab?.id;
        const pageUrl = sender?.tab?.url || "";
        if (!tabId) {
            sendResponse({ ok: false, option: null, reason: "no_tab_id" });
            return;
        }
        if (!isAllowedPageUrl(pageUrl)) {
            sendResponse({ ok: false, option: null, reason: "blocked_host" });
            return;
        }
        if (!chrome.scripting || typeof chrome.scripting.executeScript !== "function") {
            sendResponse({ ok: false, option: null, reason: "no_scripting_api" });
            return;
        }
        chrome.scripting.executeScript(
            {
                target: { tabId },
                world: "MAIN",
                func: () => {
                    try {
                        if (typeof show !== "function") {
                            return { ok: false, option: null, reason: "show_not_function" };
                        }
                        const logicString = show.toString();
                        const match = logicString.match(/document\.getElementById\(['"]lab(\d)['"]\)\.style\.background\s*=\s*['"]#8ac007['"]/);
                        if (!(match && match[1])) {
                            return { ok: false, option: null, reason: "regex_no_match" };
                        }
                        const option = parseInt(match[1], 10);
                        if (!(option >= 1 && option <= 4)) {
                            return { ok: false, option: null, reason: "option_out_of_range" };
                        }
                        const radioBtn = document.getElementById("radio" + option + option);
                        if (radioBtn) radioBtn.checked = true;
                        return { ok: true, option, reason: "ok" };
                    } catch (e) {
                        return { ok: false, option: null, reason: "exception:" + (e?.message || String(e)) };
                    }
                }
            },
            (results) => {
                if (chrome.runtime.lastError) {
                    sendResponse({
                        ok: false,
                        option: null,
                        reason: "exec_error:" + chrome.runtime.lastError.message
                    });
                    return;
                }
                const res = results?.[0]?.result || { ok: false, option: null, reason: "no_result" };
                sendResponse(res);
            }
        );
        return true;
    }

    // ----------------------------------------------------------------
    //  PRIMARY: Local OCR pipeline (PaddleOCR ONNX + YOLO + RapidFuzz)
    //  content.js passes dom_hints collected from the DOM
    // ----------------------------------------------------------------
    if (msg.type === "CAPTURE_AND_OCR") {
        const tabId = sender?.tab?.id;
        const pageUrl = sender?.tab?.url || "";
        if (!isAllowedPageUrl(pageUrl)) {
            sendResponse({ found: false, error: "Blocked host" });
            return;
        }
        const overrideB64 = (msg.image_b64_override || "").toString().trim();
        const capturePromise = overrideB64
            ? Promise.resolve(`data:image/png;base64,${overrideB64}`)
            : captureStableWindowPng(tabId, sender.tab.windowId);

        capturePromise
            .then(async (dataUrl) => {
                try {
                    const backend = await getBackend();
                    const payload = {
                        image_b64: dataUrl.split(",")[1],
                        dom_hints: {
                            ...(msg.dom_hints || {}),
                            page_url: pageUrl,
                            capture_mode: msg.capture_mode || (overrideB64 ? "panel_html2canvas" : "tab_capture")
                        }
                    };
                    const resp = await fetch(`${backend}/ocr-solve`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });
                    sendResponse(await resp.json());
                } catch (e) {
                    sendResponse({ found: false, error: e.message });
                }
            })
            .catch((e) => sendResponse({ found: false, error: e.message || "No screen data" }));
        return true; // async
    }

    // ----------------------------------------------------------------
    //  FALLBACK: AI solver (Gemini / NVIDIA)
    //  Disabled on the backend by default (AI_FALLBACK_ENABLED = False).
    // ----------------------------------------------------------------
    if (msg.type === "CAPTURE_AND_SOLVE") {
        const tabId = sender?.tab?.id;
        const pageUrl = sender?.tab?.url || "";
        if (!isAllowedPageUrl(pageUrl)) {
            sendResponse({ answer: null, error: "Blocked host" });
            return;
        }
        chrome.storage.sync.get(["provider", "ai_fallback_enabled", "api_enabled"], ({ provider, ai_fallback_enabled, api_enabled }) => {
            if (!ai_fallback_enabled) {
                sendResponse({ answer: null, disabled: true, error: "AI fallback disabled" });
                return;
            }
            captureStableWindowPng(tabId, sender.tab.windowId)
                .then(async (dataUrl) => {
                    try {
                        const backend = await getBackend();
                        // Keep backend runtime flag in sync even after backend restarts.
                        // Without this, extension may think AI is ON while backend resets to OFF.
                        try {
                            await fetch(`${backend}/config`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    api_enabled: !!api_enabled || !!ai_fallback_enabled,
                                    ai_fallback_enabled: !!api_enabled || !!ai_fallback_enabled
                                })
                            });
                        } catch (syncErr) {
                            console.warn("[BG] Pre-solve config sync failed:", syncErr?.message || syncErr);
                        }

                        const resp = await fetch(`${backend}/solve`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                image_b64: dataUrl.split(",")[1],
                                provider: provider || "gemini",
                                page_url: pageUrl
                            })
                        });
                        sendResponse(await resp.json());
                    } catch (e) {
                        sendResponse({ answer: null, error: e.message });
                    }
                })
                .catch((e) => sendResponse({ answer: null, error: e.message || "No screen data" }));
        });
        return true;
    }

    if (msg.type === "CLOSE_CURRENT_TAB") {
        const tabId = sender?.tab?.id;
        if (!tabId) {
            sendResponse({ ok: false, error: "no_tab_id" });
            return;
        }
        chrome.tabs.remove(tabId, () => {
            if (chrome.runtime.lastError) {
                sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ ok: true });
            }
        });
        return true;
    }

    // ----------------------------------------------------------------
    //  CONFIG: Push API keys to backend
    // ----------------------------------------------------------------
    if (msg.type === "CONFIG_UPDATE") {
        const payload = msg.payload || {};
        const syncPayload = {};
        const copyKeys = [
            "power_on",
            "phase1_enabled",
            "ocr_enabled",
            "api_enabled",
            "ai_fallback_enabled",
            "server_url",
            "auto_refresh_enabled"
        ];
        for (const key of copyKeys) {
            if (payload[key] !== undefined) syncPayload[key] = payload[key];
        }
        if (Object.keys(syncPayload).length > 0) {
            chrome.storage.sync.set(syncPayload);
        }

        getBackend().then(backend => {
            fetch(`${backend}/config`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            }).catch(err => console.error("[BG] Config relay failed:", err));
        });
        if (payload.api_enabled !== undefined) {
            chrome.storage.sync.set({
                ai_fallback_enabled: !!payload.api_enabled,
                api_enabled: !!payload.api_enabled
            });
        }
    }

    // ----------------------------------------------------------------
    //  Direct question text lookup
    // ----------------------------------------------------------------
    if (msg.type === "QUESTION_LOOKUP") {
        getBackend().then(backend => {
            fetch(`${backend}/lookup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(msg.payload)
            }).then(r => r.json()).then(sendResponse).catch(() => sendResponse({ found: false }));
        });
        return true;
    }

// ----------------------------------------------------------------
// HEALTH CHECK (called by popup to ping the configured server)
// ----------------------------------------------------------------
if (msg.type === "PING_BACKEND") {
    getBackend().then(backend => {
        fetch(`${backend}/health`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.json())
        .then(data => sendResponse({ ok: true, url: backend, data }))
        .catch(e => sendResponse({ ok: false, url: backend, error: e.message }));
    });
    return true;
}

// ----------------------------------------------------------------
// CONTENT SCRIPT READY (handshake to confirm content script loaded)
// ----------------------------------------------------------------
if (msg.type === "CONTENT_SCRIPT_READY") {
    const tabId = sender?.tab?.id;
    if (tabId) {
        tabState.set(tabId, { dpr: msg.dpr || 1, ready: true });
        console.log(`[BG] Tab ${tabId} ready. DPR=${msg.dpr}`);
    }
    sendResponse({ ok: true });
    return true;
}
});
