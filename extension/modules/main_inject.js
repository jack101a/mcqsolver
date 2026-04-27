// extension/modules/main_inject.js
// This script runs in the page's MAIN world to patch native APIs.
(function () {
    'use strict';

    if (window.__SARATHI_MAIN_INJECTED__) return;
    window.__SARATHI_MAIN_INJECTED__ = true;

    const SAFE_AUTH_URL = "https://sarathi.parivahan.gov.in/sarathiservice/authenticationaction.do?authtype=Anugnya";

    try {
        // 1. Kill 403.jsp asap if navigation goes there via history/state
        if (location.pathname.endsWith("403.jsp")) {
            location.replace(SAFE_AUTH_URL);
        }

        // 2. Patch History API to block SPA navigations to 403
        const _pushState = history.pushState;
        history.pushState = function () {
            if (arguments[2] && arguments[2].toString().includes("403.jsp")) {
                console.log('[Hardening] Blocked pushState to 403.jsp');
                arguments[2] = SAFE_AUTH_URL;
            }
            return _pushState.apply(this, arguments);
        };
        const _replaceState = history.replaceState;
        history.replaceState = function () {
            if (arguments[2] && arguments[2].toString().includes("403.jsp")) {
                console.log('[Hardening] Blocked replaceState to 403.jsp');
                arguments[2] = SAFE_AUTH_URL;
            }
            return _replaceState.apply(this, arguments);
        };

        // 3. Anti-detection: Neutralize debugger keywords in dynamic scripts
        const _setInterval = window.setInterval;
        window.setInterval = function (fn, delay, ...args) {
            if (typeof fn === "string" && fn.includes("debugger")) return 0;
            return _setInterval(fn, delay, ...args);
        };
        const _setTimeout = window.setTimeout;
        window.setTimeout = function (fn, delay, ...args) {
            if (typeof fn === "string" && fn.includes("debugger")) return 0;
            return _setTimeout(fn, delay, ...args);
        };

        // 4. Anti-detection: Block visibility/blur tracking (tab switching)
        document.addEventListener("visibilitychange", (e) => { e.stopImmediatePropagation(); }, true);
        window.addEventListener("blur", (e) => { e.stopImmediatePropagation(); }, true);
        window.addEventListener("focus", (e) => { e.stopImmediatePropagation(); }, true);

        // 5. Anti-detection: Noop devtools alerts
        const _alert = window.alert;
        window.alert = function (msg) {
            if (msg && msg.toString().toLowerCase().includes("devtools")) {
                console.log('[Hardening] Suppressed devtools alert');
                return;
            }
            return _alert.apply(this, arguments);
        };

        // 6. Anti-detection: Spoof window dimensions to hide DevTools presence
        try {
            Object.defineProperty(window, "outerHeight", { get: () => window.innerHeight + 100 });
            Object.defineProperty(window, "outerWidth", { get: () => window.innerWidth + 100 });
        } catch (e) { }

        // 7. Data Capture: Proxy Fetch and XHR to catch hidden image data in network responses
        try {
            const _fetch = window.fetch;
            window.fetch = function(input, init) {
                return _fetch.apply(this, arguments).then(resp => {
                    try {
                        const url = resp.url || (typeof input === 'string' ? input : input?.url || '');
                        if (url.includes('sarathi.parivahan.gov.in')) {
                            const clone = resp.clone();
                            clone.text().then(text => {
                                if (text.includes('data:image/') || (text.length > 500 && /^[A-Za-z0-9+/=]+$/.test(text.slice(0,100)))) {
                                    window.postMessage({ type: 'SP_NETWORK_IMAGE', text, url }, '*');
                                }
                            });
                        }
                    } catch(e) {}
                    return resp;
                });
            };

            const _send = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function() {
                this.addEventListener('load', function() {
                    try {
                        const text = this.responseText;
                        if (text && (text.includes('data:image/') || text.length > 1000)) {
                             window.postMessage({ type: 'SP_NETWORK_IMAGE', text, url: this.responseURL }, '*');
                        }
                    } catch(e) {}
                });
                return _send.apply(this, arguments);
            };
        } catch(e) {}

        console.log('[Hardening] MAIN world patches applied successfully');
    } catch (e) {
        console.warn('[Hardening] MAIN world injection error:', e);
    }
})();
