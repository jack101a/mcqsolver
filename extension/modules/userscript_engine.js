// modules/userscript_engine.js — Unified Platform Extension
// Lightweight Userscript Engine (Content Script)

(async function() {
    'use strict';

    if (window.__USERSCRIPT_ENGINE_INITIALIZED__) return;
    window.__USERSCRIPT_ENGINE_INITIALIZED__ = true;

    console.log('[Userscript Engine] Booting...');

    const GM_SHIM = `
(function() {
    if (window.GM) return;
    window.GM = {
        addStyle: (css) => {
            const style = document.createElement('style');
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
        },
        getValue: function(key, defaultValue) {
            const requestId = Math.random().toString(36).substr(2, 9);
            window.postMessage({ type: 'GM_REQUEST', action: 'getValue', key, defaultValue, requestId }, '*');
            return new Promise(resolve => {
                const handler = (e) => {
                    if (e.data?.type === 'GM_RESPONSE' && e.data?.requestId === requestId) {
                        window.removeEventListener('message', handler);
                        resolve(e.data.value !== undefined ? e.data.value : defaultValue);
                    }
                };
                window.addEventListener('message', handler);
            });
        },
        setValue: function(key, value) {
            const requestId = Math.random().toString(36).substr(2, 9);
            window.postMessage({ type: 'GM_REQUEST', action: 'setValue', key, value, requestId }, '*');
            return new Promise(resolve => {
                const handler = (e) => {
                    if (e.data?.type === 'GM_RESPONSE' && e.data?.requestId === requestId) {
                        window.removeEventListener('message', handler);
                        resolve(e.data.ok);
                    }
                };
                window.addEventListener('message', handler);
            });
        },
        xmlhttpRequest: function(details, callback) {
            const requestId = Math.random().toString(36).substr(2, 9);
            window.postMessage({ type: 'GM_REQUEST', action: 'xmlhttpRequest', details, requestId }, '*');
            const handler = (e) => {
                if (e.data?.type === 'GM_RESPONSE' && e.data?.requestId === requestId) {
                    window.removeEventListener('message', handler);
                    callback(e.data.response);
                }
            };
            window.addEventListener('message', handler);
        }
    };
})();
`;

    async function injectShim() {
        if (!chrome.runtime?.id) return;
        try {
            await chrome.runtime.sendMessage({
                type: 'EXECUTE_IN_MAIN',
                code: GM_SHIM,
                name: 'GM Shim'
            });
            console.log('[Userscript Engine] GM shim execution requested');
        } catch (e) {
            console.debug('[Userscript Engine] Failed to request GM shim injection:', e);
        }
    }

    window.addEventListener('message', async (e) => {
        if (e.data && e.data.type === 'GM_REQUEST') {
            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'GM_API_CALL',
                    ...e.data
                });
                window.postMessage({
                    type: 'GM_RESPONSE',
                    requestId: e.data.requestId,
                    ...response
                }, '*');
            } catch (err) {
                window.postMessage({
                    type: 'GM_RESPONSE',
                    requestId: e.data.requestId,
                    error: err.message
                }, '*');
            }
        }
    });

    function urlMatchesPattern(url, pattern) {
        if (pattern === '<all_urls>') return true;
        
        let p = pattern;
        let isHttpAny = false;
        if (p.startsWith('*://')) {
            isHttpAny = true;
            p = p.slice(4);
        }
        
        let regexStr = p
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
            .replace(/\\\*/g, '.*'); // Replace \* with .*
            
        if (isHttpAny) {
            regexStr = '^https?:\\/\\/' + regexStr;
        } else {
            regexStr = '^' + regexStr;
        }
        regexStr += '$';
        
        try {
            const regex = new RegExp(regexStr, 'i');
            return regex.test(url);
        } catch (e) {
            console.error(`[Userscript Engine] Invalid match pattern: ${pattern}`, e);
            return false;
        }
    }
    
    function shouldRun(script, url) {
        if (!script.enabled) return false;
        
        const meta = script.parsedMeta;
        if (!meta || !meta.matches || meta.matches.length === 0) return false;
        
        // Check excludes first
        if (meta.exclude && meta.exclude.some(pattern => urlMatchesPattern(url, pattern))) {
            return false;
        }
        
        // Check matches
        return meta.matches.some(pattern => urlMatchesPattern(url, pattern));
    }
    
    async function injectScript(code, name, id, requires) {
        try {
            // Fetch @require dependencies first
            let requireCode = '';
            if (requires && requires.length > 0) {
                for (const url of requires) {
                    try {
                        const resp = await fetch(url);
                        if (resp.ok) {
                            requireCode += await resp.text() + '\n';
                            console.log(`[Userscript Engine] Loaded @require: ${url}`);
                        } else {
                            console.warn(`[Userscript Engine] @require failed (${resp.status}): ${url}`);
                        }
                    } catch (e) {
                        console.warn(`[Userscript Engine] @require fetch error for ${url}:`, e.message);
                    }
                }
            }
            
            const fullCode = requireCode + code;
            await chrome.runtime.sendMessage({
                type: 'EXECUTE_IN_MAIN',
                code: fullCode,
                name: name,
                id: id
            });
            console.log(`[Userscript Engine] Executed script: ${name}`);
        } catch (e) {
            console.error(`[Userscript Engine] Error injecting script ${name}:`, e);
        }
    }
    
    // Synchronous injection for document-start scripts (must beat page's own scripts)
    function injectScriptSync(code, name) {
        try {
            const script = document.createElement('script');
            script.textContent = code;
            script.dataset.userscriptName = name;
            script.dataset.userscriptId = name;
            (document.head || document.documentElement).appendChild(script);
            script.remove();
            console.log(`[Userscript Engine] Sync-injected: ${name}`);
        } catch (e) {
            console.error(`[Userscript Engine] Sync injection failed for ${name}:`, e);
        }
    }
    
    function scheduleExecution(scriptData) {
        const { parsedMeta, rawCode, id, name } = scriptData;
        const runAt = parsedMeta.runAt || 'document-idle';
        const requires = parsedMeta.requires || [];
    
        if (runAt === 'document-start') {
            // Synchronous injection — must beat page's own scripts
            // Note: @require is not supported for document-start (would break sync guarantee)
            injectScriptSync(rawCode, name);
        } else if (runAt === 'document-end') {
            const execute = () => injectScript(rawCode, name, id, requires);
            if (document.readyState === 'interactive' || document.readyState === 'complete') {
                execute();
            } else {
                document.addEventListener('DOMContentLoaded', execute, { once: true });
            }
        } else { 
            const execute = () => injectScript(rawCode, name, id, requires);
            if (document.readyState === 'complete') {
                execute();
            } else {
                window.addEventListener('load', () => setTimeout(execute, 0), { once: true });
            }
        }
    }
    
    try {
        await injectShim();
        const data = await chrome.storage.local.get(['normalized_userscripts', 'userscriptsEnabled']);
        if (data.userscriptsEnabled === false) {
            console.log('[Userscript Engine] Global userscripts toggle is disabled.');
            return;
        }
        const scripts = data.normalized_userscripts || [];
        const currentUrl = location.href;
    
        let ranAny = false;
        for (const scriptData of scripts) {
            if (shouldRun(scriptData, currentUrl)) {
                scheduleExecution(scriptData);
                ranAny = true;
            }
        }
        if (!ranAny) {
            console.log('[Userscript Engine] No scripts matched current URL.');
        }
    } catch (e) {
        console.error('[Userscript Engine] Error loading scripts:', e);
    }
})();
