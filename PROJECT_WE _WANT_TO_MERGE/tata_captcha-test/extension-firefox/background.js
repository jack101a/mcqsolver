/**
 * Background worker for tata-captcha.
 * Unified storage: all settings stored as flat keys in storage.local.
 */
const extApi = typeof browser !== "undefined" ? browser : chrome;

function debugLog(...args) {
  console.log("[tata-captcha:bg]", ...args);
}

function normalizeDomain(value) {
  let token = String(value || "").trim().toLowerCase();
  if (!token) return "";
  token = token.split("/", 1)[0].split(":", 1)[0].replace(/\.$/, "");
  if (token.startsWith("www.")) token = token.slice(4);
  return token;
}

async function storageGet(keys) {
  const maybe = extApi.storage.local.get(keys);
  if (maybe && typeof maybe.then === "function") return maybe;
  return new Promise((resolve) => extApi.storage.local.get(keys, resolve));
}

async function storageSet(obj) {
  const maybe = extApi.storage.local.set(obj);
  if (maybe && typeof maybe.then === "function") return maybe;
  return new Promise((resolve) => extApi.storage.local.set(obj, resolve));
}

async function getDeviceId() {
  const data = await storageGet(["deviceId"]);
  if (data.deviceId) return data.deviceId;
  const generated = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await storageSet({ deviceId: generated });
  return generated;
}

async function buildAuthHeaders(settings, includeJson = false) {
  const deviceId = await getDeviceId();
  const headers = {
    "x-api-key": settings.apiKey,
    "x-device-id": deviceId,
  };
  if (includeJson) headers["Content-Type"] = "application/json";
  return headers;
}

let lastTaskCache = null;

async function getSettings() {
  const data = await storageGet([
    "apiBaseUrl", "apiKey", "autoSolve", "delayMs",
    "masterEnabled", "textCaptchaEnabled", "imageTaskEnabled", "audioTaskEnabled", "textTaskEnabled",
    "audioSourceSelector", "audioInputSelector", "textSourceSelector", "textInputSelector",
    "customLocators", "disabledHosts", "globalFieldRoutes"
  ]);
  return {
    apiBaseUrl: data.apiBaseUrl || "http://localhost:8080",
    apiKey: data.apiKey || "",
    autoSolve: data.autoSolve !== undefined ? data.autoSolve : true,
    delayMs: data.delayMs !== undefined ? data.delayMs : 300,
    masterEnabled: data.masterEnabled !== undefined ? data.masterEnabled : true,
    imageTaskEnabled: data.imageTaskEnabled !== undefined
      ? data.imageTaskEnabled
      : (data.textCaptchaEnabled !== undefined ? data.textCaptchaEnabled : true),
    audioTaskEnabled: data.audioTaskEnabled !== undefined ? data.audioTaskEnabled : true,
    textTaskEnabled: data.textTaskEnabled !== undefined ? data.textTaskEnabled : true,
    audioSourceSelector: data.audioSourceSelector || 'audio[src], audio source[src]',
    audioInputSelector: data.audioInputSelector || 'input[id*="audio"], input[name*="audio"], textarea[id*="audio"], textarea[name*="audio"]',
    textSourceSelector: data.textSourceSelector || '[data-ai-text-source], textarea[data-ai-source], input[data-ai-source]',
    textInputSelector: data.textInputSelector || '[data-ai-text-target], textarea[data-ai-target], input[data-ai-target], textarea[id*="result"], input[id*="result"]',
    customLocators: data.customLocators || {},
    disabledHosts: data.disabledHosts || [],
    globalFieldRoutes: data.globalFieldRoutes || {},
  };
}

async function requestWithRetry(url, options, retries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      debugLog("request", { url, attempt });
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function executeFileInTab(tabId, filePath) {
  if (extApi.scripting && typeof extApi.scripting.executeScript === "function") {
    await extApi.scripting.executeScript({
      target: { tabId },
      files: [filePath],
    });
    return;
  }
  if (extApi.tabs && typeof extApi.tabs.executeScript === "function") {
    await extApi.tabs.executeScript(tabId, { file: filePath });
    return;
  }
  throw new Error("Script injection API is unavailable in this Firefox runtime.");
}

async function executeFunctionInTab(tabId, fn, args = []) {
  if (extApi.scripting && typeof extApi.scripting.executeScript === "function") {
    const result = await extApi.scripting.executeScript({
      target: { tabId },
      func: fn,
      args,
    });
    return Array.isArray(result) ? result[0]?.result : undefined;
  }
  if (extApi.tabs && typeof extApi.tabs.executeScript === "function") {
    const serializedArgs = JSON.stringify(args);
    const code = `(${fn.toString()})(...${serializedArgs});`;
    const out = await extApi.tabs.executeScript(tabId, { code });
    return Array.isArray(out) ? out[0] : undefined;
  }
  throw new Error("Script execution API is unavailable in this Firefox runtime.");
}

async function syncGlobalLocators(strict = false) {
  const settings = await getSettings();
  if (!settings.apiBaseUrl) {
    if (strict) throw new Error("API base URL not set");
    return { synced: false, count: 0 };
  }

  try {
    const resp = await fetch(`${settings.apiBaseUrl}/v1/locators?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error(`Locator sync failed: HTTP ${resp.status}${detail ? ` - ${detail}` : ""}`);
    }
    const data = await resp.json();
    await storageSet({ globalLocators: data });
    const count = Object.keys(data || {}).length;
    debugLog("Synced global locators", count);
    return { synced: true, count };
  } catch (e) {
    debugLog("Failed to sync global locators", e.message);
    if (strict) throw e;
    return { synced: false, count: 0, error: e.message || String(e) };
  }
}

async function syncGlobalFieldMappings(strict = false) {
  const settings = await getSettings();
  if (!settings.apiBaseUrl || !settings.apiKey) {
    if (strict) throw new Error("API base URL or API key missing");
    return { synced: false, count: 0 };
  }
  try {
    const resp = await fetch(`${settings.apiBaseUrl}/v1/field-mappings/routes?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: await buildAuthHeaders(settings),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error(`Field-mapping sync failed: HTTP ${resp.status}${detail ? ` - ${detail}` : ""}`);
    }
    const data = await resp.json();
    await storageSet({ globalFieldRoutes: data });
    const count = Object.keys(data || {}).length;
    debugLog("Synced global field mappings", count);
    return { synced: true, count };
  } catch (e) {
    debugLog("Failed to sync global field mappings", e.message);
    if (strict) throw e;
    return { synced: false, count: 0, error: e.message || String(e) };
  }
}

async function syncPendingRoutesToServer() {
  const settings = await getSettings();
  if (!settings.apiKey || !settings.apiBaseUrl) {
    throw new Error("API key/base URL missing");
  }
  const data = await storageGet(["domainFieldRoutes", "globalFieldRoutes"]);
  const routes = Array.isArray(data.domainFieldRoutes) ? data.domainFieldRoutes : [];
  const globalFieldRoutes = data.globalFieldRoutes || {};
  const normalize = (value) => String(value || "").trim();
  const signature = (route) => {
    const domain = normalizeDomain(route.domain);
    const taskType = normalize(route.taskType || route.task_type || route.source_data_type).toLowerCase();
    const src = normalize(route.sourceSelector || route.source_selector);
    const tgt = normalize(route.targetSelector || route.target_selector);
    return `${domain}|${taskType}|${src}|${tgt}`;
  };
  const serverSet = new Set();
  Object.entries(globalFieldRoutes).forEach(([domain, entries]) => {
    (entries || []).forEach((entry) => {
      serverSet.add(signature({
        domain,
        taskType: entry.task_type || entry.source_data_type || "image",
        sourceSelector: entry.source_selector || "",
        targetSelector: entry.target_selector || "",
      }));
    });
  });
  const seenLocal = new Set();
  const cleanedRoutes = [];
  let proposed = 0;
  let failed = 0;
  let skipped = 0;
  for (const route of routes) {
    const sig = signature(route);
    if (serverSet.has(sig) || seenLocal.has(sig)) {
      skipped += 1;
      continue;
    }
    seenLocal.add(sig);
    cleanedRoutes.push(route);
    const domain = normalizeDomain(route.domain);
    const taskType = String(route.taskType || "").trim();
    const sourceSelector = String(route.sourceSelector || "").trim();
    const targetSelector = String(route.targetSelector || "").trim();
    const fieldName = String(route.fieldName || "").trim();
    if (!domain || !taskType || !sourceSelector || !targetSelector) continue;
    try {
      await requestWithRetry(`${settings.apiBaseUrl}/v1/field-mappings/propose`, {
        method: "POST",
        headers: await buildAuthHeaders(settings, true),
        body: JSON.stringify({
          domain,
          task_type: taskType,
          source_data_type: taskType,
          source_selector: sourceSelector,
          target_data_type: "text_input",
          target_selector: targetSelector,
          proposed_field_name: fieldName || `${taskType}_default`,
        })
      });
      proposed += 1;
    } catch (_e) {
      failed += 1;
    }
  }
  if (cleanedRoutes.length !== routes.length) {
    await storageSet({ domainFieldRoutes: cleanedRoutes });
  }
  return { proposed, failed, skipped, total: routes.length };
}

// Sync locators when background script starts
syncGlobalLocators();
syncGlobalFieldMappings();

async function processTask(payload) {
  const settings = await getSettings();
  if (!settings.apiKey) throw new Error("API key not configured. Open Settings.");

  lastTaskCache = {
    domain: payload.domain || "",
    payload_base64: payload.payload_base64
  };

  const endpoint = `${settings.apiBaseUrl}/v1/solve`;
  return await requestWithRetry(endpoint, {
    method: "POST",
    headers: await buildAuthHeaders(settings, true),
    body: JSON.stringify(payload)
  }, 0);
}

async function reportFailure() {
  if (!lastTaskCache) throw new Error("No recent CAPTCHA to report.");
  const settings = await getSettings();
  if (!settings.apiKey) throw new Error("API key not set.");

  return await requestWithRetry(`${settings.apiBaseUrl}/v1/report`, {
    method: "POST",
    headers: await buildAuthHeaders(settings, true),
    body: JSON.stringify(lastTaskCache)
  });
}

async function pingServer() {
  const settings = await getSettings();
  if (!settings.apiKey) return { connected: false, message: "No API key configured" };

  const start = Date.now();
  try {
    const resp = await fetch(`${settings.apiBaseUrl}/v1/auth/verify`, {
      method: "GET",
      headers: await buildAuthHeaders(settings),
      signal: AbortSignal.timeout(5000),
    });
    const ms = Date.now() - start;
    if (resp.ok) {
      const data = await resp.json();
      return { connected: true, message: `Connected (${ms}ms)`, latency: ms, keyName: data.key_name };
    } else {
      return { connected: false, message: `Auth failed (${resp.status})` };
    }
  } catch (e) {
    return { connected: false, message: e.name === "TimeoutError" ? "Server timeout" : "Cannot reach server" };
  }
}

async function startLocate(targetField) {
  let [tab] = await extApi.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.url || !/^https?:/i.test(tab.url)) {
    const candidates = await extApi.tabs.query({ lastFocusedWindow: true });
    tab = candidates.find((t) => t.url && /^https?:/i.test(t.url));
  }
  if (!tab) throw new Error("Open the target website tab first, then retry picker.");

  await executeFileInTab(tab.id, "locator_picker.js");

  await extApi.tabs.sendMessage(tab.id, { type: "PICK_ELEMENT", targetField });
  return { started: true };
}

async function validateSelectors(sourceSelector, targetSelector) {
  let [tab] = await extApi.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.url || !/^https?:/i.test(tab.url)) {
    const candidates = await extApi.tabs.query({ lastFocusedWindow: true });
    tab = candidates.find((t) => t.url && /^https?:/i.test(t.url));
  }
  if (!tab) throw new Error("Open the target website tab first.");

  const result = await executeFunctionInTab(
    tab.id,
    (src, tgt) => {
      try {
        const srcCount = src ? document.querySelectorAll(src).length : 0;
        const tgtCount = tgt ? document.querySelectorAll(tgt).length : 0;
        return { ok: true, srcCount, tgtCount, href: location.href };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    [sourceSelector, targetSelector]
  );
  return result || { ok: false, error: "No validation result" };
}

async function proposeLocator(domain, img, input) {
  const settings = await getSettings();
  if (!settings.apiKey) throw new Error("API key not set");

  try {
    await requestWithRetry(`${settings.apiBaseUrl}/v1/locators/propose`, {
      method: "POST",
      headers: await buildAuthHeaders(settings, true),
      body: JSON.stringify({ domain: normalizeDomain(domain), image_selector: img, input_selector: input })
    });
    return { success: true };
  } catch (e) {
    debugLog("Propose failed", e);
    return { success: false, error: String(e) };
  }
}

async function proposeFieldMapping(payload) {
  const settings = await getSettings();
  if (!settings.apiKey) throw new Error("API key not set");
  const domain = normalizeDomain(payload?.domain);
  return await requestWithRetry(`${settings.apiBaseUrl}/v1/field-mappings/propose`, {
    method: "POST",
    headers: await buildAuthHeaders(settings, true),
    body: JSON.stringify({ ...(payload || {}), domain })
  });
}

extApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case "GET_SETTINGS":
        return { settings: await getSettings() };
      case "SAVE_SETTINGS":
        await storageSet(message.payload || {});
        return { settings: await getSettings() };
      case "PROCESS_TASK":
        return { solved: await processTask(message.payload) };
      case "REPORT_FAILURE":
        return { success: await reportFailure() };
      case "PING_SERVER":
        return await pingServer();
      case "SYNC_LOCATORS":
        return await syncGlobalLocators(true);
      case "SYNC_FIELD_MAPPINGS":
        return await syncGlobalFieldMappings(true);
      case "SYNC_PENDING_ROUTES":
        return await syncPendingRoutesToServer();
      case "VALIDATE_SELECTORS":
        return await validateSelectors(message.sourceSelector, message.targetSelector);
      case "START_LOCATE":
        return await startLocate(message.targetField);
      case "LOCATOR_PICKED": {
        const keyMap = {
          img: "_locatedImg",
          input: "_locatedInput",
          source: "_locatedSource",
          target: "_locatedTarget",
        };
        const storageKey = keyMap[message.targetField] || "_locatedSource";
        await storageSet({ [storageKey]: message.selector });
        try {
          extApi.runtime.sendMessage({
            type: "LOCATOR_PICKED_UI",
            targetField: message.targetField,
            selector: message.selector,
          });
        } catch (_e) {}
        return { stored: true };
      }
      case "PROPOSE_LOCATOR":
        return await proposeLocator(message.domain, message.img, message.input);
      case "PROPOSE_FIELD_MAPPING":
        return await proposeFieldMapping(message.payload);
      default:
        throw new Error(`Unknown message: ${message.type}`);
    }
  })()
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});
