chrome.runtime.onInstalled.addListener(() => {
  console.log('Sarthi Pluse+ installed');
});

// URLs
const AUTH_FROM_URL = "https://sarathi.parivahan.gov.in/sarathiservice/authenticationaction.do?authtype=Anugyna"; // open first
const AUTH_TO_URL   = "https://sarathi.parivahan.gov.in/sarathiservice/authenticationaction.do?authtype=Anugnya"; // stabilize to this
const AUTH_BASE_URL = "https://sarathi.parivahan.gov.in/sarathiservice/authenticationaction.do";

// Detect Chrome/Edge error-like pages
function isErrorLikeUrl(url) {
  if (!url) return true;
  url = String(url);
  return (
    url.startsWith('chrome-error://') ||
    url.startsWith('chrome://') ||
    url.startsWith('edge-error://') ||
    url.startsWith('about:blank#blocked') ||
    url.startsWith('about:neterror')
  );
}

// Throttle to avoid redirect loops (per tab)
const lastRedirectAt = new Map(); // tabId -> ms
function shouldRedirect(tabId, windowMs = 10000) {
  const now = Date.now();
  const last = lastRedirectAt.get(tabId) || 0;
  if (now - last < windowMs) return false;
  lastRedirectAt.set(tabId, now);
  return true;
}

// Stabilize after loads + inject anti-403 hooks
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab || !tab.url) return;

  const url = tab.url;
  if (isErrorLikeUrl(url)) return;
  if (!url.includes('sarathi.parivahan.gov.in/sarathiservice')) return;

  // If /403.jsp somehow loads, immediately jump to stable URL (extra safety beyond DNR)
  if (/\/403\.jsp(\?|$)/.test(url)) {
    if (shouldRedirect(tabId)) chrome.tabs.update(tabId, { url: AUTH_TO_URL });
    return;
  }

  // If we've just landed on Anugyna, stabilize to Anugnya once
  if (url.startsWith(AUTH_BASE_URL) && url.includes('authtype=Anugyna')) {
    if (shouldRedirect(tabId)) chrome.tabs.update(tabId, { url: AUTH_TO_URL });
    return;
  }

  // Inject stability/anti-403 hooks; use Anugnya as the safe authURL
  try {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: (SAFE_AUTH_URL) => {
          const authURL = SAFE_AUTH_URL;

          try {
            // Kill 403.jsp asap if navigation goes there via history/state
            if (location.pathname.endsWith("403.jsp")) {
              location.replace(authURL);
            }

            // Avoid history to 403
            const _pushState = history.pushState;
            history.pushState = function() {
              if (arguments[2] && arguments[2].toString().includes("403.jsp")) arguments[2] = authURL;
              return _pushState.apply(this, arguments);
            };
            const _replaceState = history.replaceState;
            history.replaceState = function() {
              if (arguments[2] && arguments[2].toString().includes("403.jsp")) arguments[2] = authURL;
              return _replaceState.apply(this, arguments);
            };

            // Anti-devtools traps
            document.addEventListener("visibilitychange", (e) => { e.stopImmediatePropagation(); }, true);
            window.addEventListener("blur",  (e) => { e.stopImmediatePropagation(); }, true);
            window.addEventListener("focus", (e) => { e.stopImmediatePropagation(); }, true);

            // Filter setInterval/Timeout "debugger"
            const _setInterval = window.setInterval;
            window.setInterval = function(fn, delay, ...args) {
              if (typeof fn === "string" && fn.includes("debugger")) return 0;
              return _setInterval(fn, delay, ...args);
            };
            const _setTimeout = window.setTimeout;
            window.setTimeout = function(fn, delay, ...args) {
              if (typeof fn === "string" && fn.includes("debugger")) return 0;
              return _setTimeout(fn, delay, ...args);
            };

            // Devtools alerts noop
            window.alert = function(msg) {
              if (msg && msg.toString().toLowerCase().includes("devtools")) return;
            };

            // Window size probes bypass
            try {
              Object.defineProperty(window, "outerHeight", { get: () => window.innerHeight + 100 });
              Object.defineProperty(window, "outerWidth",  { get: () => window.innerWidth  + 100 });
            } catch(e) {}
          } catch (e) {}
        },
        args: [AUTH_TO_URL]
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn('Sarthi Pluse+ inject skipped:', chrome.runtime.lastError.message);
        }
      }
    );
  } catch (e) {
    console.warn('Sarthi Pluse+ inject error:', e);
  }
});

// Background message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender && sender.tab && sender.tab.id;
  if (!message || !tabId) return;

  // Execute arbitrary code in page MAIN world
  if (message.type === 'SP_EXEC') {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: 'MAIN',
        func: (code) => {
          try {
            const runner = new Function(code);
            const out = runner();
            if (out && typeof out.then === 'function') {
              return out.then(() => ({ ok: true })).catch(err => ({ ok: false, error: String(err) }));
            }
            return { ok: true };
          } catch (e) {
            return { ok: false, error: String(e) };
          }
        },
        args: [message.code]
      },
      (results) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse((results && results[0] && results[0].result) || { ok: true });
        }
      }
    );
    return true; // async
  }

  // Open a URL in same tab; fallback to new tab
  if (message.type === 'SP_OPEN') {
    const url = message.url;
    if (!url) {
      sendResponse({ ok: false, error: 'No URL provided' });
      return;
    }
    chrome.tabs.update(tabId, { url }, (t) => {
      if (chrome.runtime.lastError) {
        chrome.tabs.create({ url, index: sender.tab.index + 1 }, (nt) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ ok: true, newTabId: nt.id });
          }
        });
      } else {
        sendResponse({ ok: true, tabId: t && t.id });
      }
    });
    return true; // async
  }

  // Session restart (site only) - kept for compatibility
  if (message.type === 'SP_SESSION_RESTART') {
    try {
      const origin = new URL(sender.tab.url).origin;
      const removeOptions = { origins: [origin] };
      const dataToRemove = {
        cookies: true,
        cache: true,
        cacheStorage: true,
        localStorage: true,
        indexedDB: true,
        serviceWorkers: true,
        webSQL: true
      };
      chrome.browsingData.remove(removeOptions, dataToRemove, () => {
        chrome.storage.local.remove(['sarthiLastAppData'], () => {
          chrome.tabs.update(tabId, { url: AUTH_FROM_URL }, (t) => {
            if (chrome.runtime.lastError) {
              sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            } else {
              sendResponse({ ok: true, tabId: t && t.id });
            }
          });
        });
      });
      return true; // async
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  }

  // Full "browser restart" experience
  if (message.type === 'SP_BROWSER_RESTART') {
    // 1) Clear all-time browsing data (this logs out everywhere)
    const removeOptions = { since: 0 }; // beginning of time
    const dataToRemove = {
      cookies: true,
      cache: true,
      cacheStorage: true,
      localStorage: true,
      indexedDB: true,
      serviceWorkers: true,
      webSQL: true,
      fileSystems: true,
      pluginData: true
    };
    try {
      chrome.browsingData.remove(removeOptions, dataToRemove, () => {
        // 2) Open a brand-new maximized window to the start URL
        chrome.windows.create({ url: AUTH_FROM_URL, state: 'maximized', focused: true }, (newWin) => {
          if (chrome.runtime.lastError || !newWin) {
            sendResponse({ ok: false, error: chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Failed to create window' });
            return;
          }
          const newId = newWin.id;
          // 3) Close all other windows after a short delay so SW stays alive
          setTimeout(() => {
            chrome.windows.getAll({}, (wins) => {
              const others = (wins || []).filter(w => w.id !== newId);
              let pending = others.length;
              if (!pending) {
                sendResponse({ ok: true, newWindowId: newId });
                return;
              }
              others.forEach(w => {
                chrome.windows.remove(w.id, () => {
                  pending--;
                  if (pending === 0) {
                    sendResponse({ ok: true, newWindowId: newId });
                  }
                });
              });
            });
          }, 300);
        });
      });
      return true; // async
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  }
});