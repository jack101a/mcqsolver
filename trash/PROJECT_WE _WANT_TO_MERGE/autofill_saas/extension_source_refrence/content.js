/* =========================================================================
   ENGINE V26.0 - PHASE 1 (SCHEMA + MATCHER + GUARDS + LOGS)
   ========================================================================= */

const SCHEMA_VERSION = 2;
const DEFAULT_AUTOFILL_SETTINGS = {
  siteScopeMode: "domainPath",
  fillGuards: {
    skipHidden: true,
    skipDisabled: true,
    skipReadonly: true,
    skipPassword: true,
    skipCaptchaLike: true
  },
  debugLogs: false,
  maskSensitiveValues: false,
  fakeData: {
    enabled: false,
    locale: "en-US",
    fillEmptyOnly: true
  }
};

let IS_RECORDING = false;
let ACTIVE_PROFILE = "default";
let CURRENT_SETTINGS = DEFAULT_AUTOFILL_SETTINGS;
let ACTIVE_RUN_TOKEN = 0;
let AUTOFILL_SCHEDULE_TIMER = null;
let LAST_SCHEDULED_REASON = "startup";
let DOM_OBSERVER = null;
const RETRY_BASE_MS = 180;
const RETRY_MAX_MS = 2600;
const AUTOFILL_SELECTOR_HINT =
  "input, select, textarea, button, [contenteditable='true'], [role='combobox'], [role='textbox']";

chrome.storage.local.get(
  ["isRecording", "activeProfile", "autofillEnabled", "autofillSettings"],
  (data) => {
    IS_RECORDING = data.isRecording || false;
    ACTIVE_PROFILE = data.activeProfile || "default";
    CURRENT_SETTINGS = mergeSettings(data.autofillSettings);

    if (data.autofillEnabled !== false) {
      runAutofill("init");
    }
  }
);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return false;
  if (msg.action === "toggleRecord") {
    IS_RECORDING = msg.state;
    return false;
  }
  if (msg.action === "updateProfile") {
    ACTIVE_PROFILE = msg.profile;
    runAutofill("profile-change");
    return false;
  }
  if (msg.action === "forceRun") {
    runAutofill("hotkey-force");
    return false;
  }
  if (msg.action === "previewRun") {
    runAutofill("preview-run", {
      dryRun: true,
      sendResult: true,
      onComplete: (runLog) => sendResponse({ ok: true, runLog })
    });
    return true;
  }
  if (msg.action === "testRule") {
    runAutofill("test-rule", {
      dryRun: !!msg.dryRun,
      sendResult: true,
      onlyRule: msg.rule || null,
      onComplete: (runLog) => sendResponse({ ok: true, runLog })
    });
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.autofillSettings) {
    CURRENT_SETTINGS = mergeSettings(changes.autofillSettings.newValue);
  }
});

installPhase2Watchers();

/* =========================================================================
   PART 1: PLAYBACK ENGINE
   ========================================================================= */

function mergeSettings(settings) {
  const guards = (settings && settings.fillGuards) || {};
  const fake = (settings && settings.fakeData) || {};
  return {
    siteScopeMode:
      (settings && settings.siteScopeMode) || DEFAULT_AUTOFILL_SETTINGS.siteScopeMode,
    fillGuards: {
      skipHidden:
        guards.skipHidden !== undefined
          ? !!guards.skipHidden
          : DEFAULT_AUTOFILL_SETTINGS.fillGuards.skipHidden,
      skipDisabled:
        guards.skipDisabled !== undefined
          ? !!guards.skipDisabled
          : DEFAULT_AUTOFILL_SETTINGS.fillGuards.skipDisabled,
      skipReadonly:
        guards.skipReadonly !== undefined
          ? !!guards.skipReadonly
          : DEFAULT_AUTOFILL_SETTINGS.fillGuards.skipReadonly,
      skipPassword:
        guards.skipPassword !== undefined
          ? !!guards.skipPassword
          : DEFAULT_AUTOFILL_SETTINGS.fillGuards.skipPassword,
      skipCaptchaLike:
        guards.skipCaptchaLike !== undefined
          ? !!guards.skipCaptchaLike
          : DEFAULT_AUTOFILL_SETTINGS.fillGuards.skipCaptchaLike
    },
    debugLogs: !!(settings && settings.debugLogs),
    maskSensitiveValues: !!(settings && settings.maskSensitiveValues),
    fakeData: {
      enabled: !!fake.enabled,
      locale: fake.locale || "en-US",
      fillEmptyOnly:
        fake.fillEmptyOnly !== undefined ? !!fake.fillEmptyOnly : true
    }
  };
}

function cleanText(value) {
  return String(value || "").replace(/^"+|"+$/g, "").trim();
}

function installPhase2Watchers() {
  installRouteHooks();
  installMutationObserver();
  if (!DOM_OBSERVER) {
    window.addEventListener(
      "DOMContentLoaded",
      () => {
        installMutationObserver();
      },
      { once: true }
    );
  }
  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) scheduleAutofill("tab-visible", 120);
    },
    true
  );
}

function installRouteHooks() {
  if (window.__autofillRouteHooksInstalled) return;
  window.__autofillRouteHooksInstalled = true;

  const onRouteSignal = () => scheduleAutofill("route-change", 120);
  window.addEventListener("popstate", onRouteSignal, true);
  window.addEventListener("hashchange", onRouteSignal, true);

  const wrapHistory = (method) => {
    try {
      const original = history[method];
      if (typeof original !== "function") return;
      history[method] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        setTimeout(onRouteSignal, 0);
        return result;
      };
    } catch (err) {}
  };

  wrapHistory("pushState");
  wrapHistory("replaceState");
}

function isRelevantMutationRecord(record) {
  if (!record) return false;
  if (record.type === "childList") {
    if ((record.addedNodes && record.addedNodes.length) || (record.removedNodes && record.removedNodes.length)) {
      const added = record.addedNodes || [];
      for (const node of added) {
        if (!node || node.nodeType !== 1) continue;
        if (node.matches && node.matches(AUTOFILL_SELECTOR_HINT)) return true;
        if (node.querySelector && node.querySelector(AUTOFILL_SELECTOR_HINT)) return true;
      }
      if (!added.length) return true;
    }
  }
  if (record.type === "attributes") return true;
  return false;
}

function installMutationObserver() {
  if (DOM_OBSERVER || !document.documentElement) return;
  DOM_OBSERVER = new MutationObserver((records) => {
    if (!records || !records.length) return;
    for (const record of records) {
      if (isRelevantMutationRecord(record)) {
        scheduleAutofill("mutation", 200);
        break;
      }
    }
  });

  DOM_OBSERVER.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "disabled", "readonly", "type", "aria-hidden"]
  });
}

function scheduleAutofill(reason, delayMs = 120) {
  LAST_SCHEDULED_REASON = reason || "scheduled";
  if (AUTOFILL_SCHEDULE_TIMER) {
    clearTimeout(AUTOFILL_SCHEDULE_TIMER);
  }
  AUTOFILL_SCHEDULE_TIMER = setTimeout(() => {
    AUTOFILL_SCHEDULE_TIMER = null;
    runAutofill(LAST_SCHEDULED_REASON);
  }, delayMs);
}

function normalizeRule(rawRule) {
  return {
    ...rawRule,
    id: rawRule.id || String(Date.now() + Math.random()),
    profileId: rawRule.profileId || "default",
    site: cleanText(rawRule.site),
    strategy: rawRule.strategy || "auto",
    name: cleanText(rawRule.name),
    elementId: cleanText(rawRule.elementId),
    selector: cleanText(rawRule.selector),
    action: rawRule.action || "text",
    siteScopeMode: rawRule.siteScopeMode || "domainPath",
    framePath: rawRule.framePath || "any",
    schemaVersion: rawRule.schemaVersion || 1
  };
}

function getCurrentFramePath() {
  if (window.top === window.self) return "top";
  const indexes = [];
  let current = window;
  try {
    while (current !== current.top) {
      const parent = current.parent;
      let matchedIndex = -1;
      for (let i = 0; i < parent.frames.length; i++) {
        if (parent.frames[i] === current) {
          matchedIndex = i;
          break;
        }
      }
      if (matchedIndex < 0) return "unknown";
      indexes.unshift(matchedIndex);
      current = parent;
    }
    return indexes.length ? indexes.join(">") : "top";
  } catch (err) {
    return "unknown";
  }
}

function matchFrame(rule, currentFramePath) {
  const ruleFrame = rule.framePath || "any";
  if (ruleFrame === "any") return true;
  if (ruleFrame === "top") return currentFramePath === "top";
  if (ruleFrame === "unknown") return true;
  return ruleFrame === currentFramePath;
}

function getPageValues() {
  const host = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname || "/";
  const search = window.location.search || "";
  const hash = window.location.hash || "";
  return {
    host,
    domainPath: `${host}${pathname}`.toLowerCase(),
    domainPathQuery: `${host}${pathname}${search}`.toLowerCase(),
    fullUrl: `${window.location.href}`.toLowerCase(),
    hash: hash.toLowerCase()
  };
}

function getPreferredProfile(page, activeProfile, siteProfileDefaults) {
  const active = activeProfile || "default";
  const defaults = siteProfileDefaults || {};
  if (defaults[page.domainPath]) return defaults[page.domainPath];
  if (defaults[page.host]) return defaults[page.host];
  return active;
}

function matchScope(rule, page, globalScopeMode) {
  const site = cleanText(rule.site).toLowerCase();
  if (!site) return false;

  const mode = rule.siteScopeMode || globalScopeMode || "domainPath";
  if (mode === "domain") {
    const ruleHost = site.split("/")[0];
    return page.host === ruleHost || page.host.endsWith(`.${ruleHost}`);
  }
  if (mode === "domainPathQuery") return page.domainPathQuery.includes(site);
  if (mode === "fullUrl") return page.fullUrl.includes(site);
  return page.domainPath.includes(site);
}

function isLikelyCaptcha(el) {
  const text = [
    el.id,
    el.name,
    el.className,
    el.getAttribute("aria-label"),
    el.getAttribute("placeholder"),
    el.getAttribute("data-sitekey")
  ]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");
  return /captcha|recaptcha|hcaptcha|turnstile/.test(text);
}

function isHiddenElement(el) {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return true;
  if (style.opacity === "0") return true;
  if (el.offsetParent === null && style.position !== "fixed") return true;
  return false;
}

function shouldSkipElement(el, settings) {
  const guards = settings.fillGuards || DEFAULT_AUTOFILL_SETTINGS.fillGuards;
  if (guards.skipDisabled && el.disabled) return "disabled";
  if (guards.skipReadonly && (el.readOnly || el.getAttribute("readonly") !== null))
    return "readonly";
  if (guards.skipPassword && String(el.type || "").toLowerCase() === "password")
    return "password";
  if (guards.skipHidden && isHiddenElement(el)) return "hidden";
  if (guards.skipCaptchaLike && isLikelyCaptcha(el)) return "captcha";
  return null;
}

// Events for text/select-like data fields.
function fireDataEvents(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

// Events for action fields.
function fireClickEvents(el) {
  el.dispatchEvent(new Event("mousedown", { bubbles: true }));
  el.dispatchEvent(new Event("mouseup", { bubbles: true }));
  el.dispatchEvent(new Event("click", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function getCandidates(rule) {
  const candidates = [];
  const push = (el) => {
    if (!el || candidates.includes(el)) return;
    candidates.push(el);
  };

  const cleanId = cleanText(rule.elementId);
  const cleanName = cleanText(rule.name);
  const selector = cleanText(rule.selector);
  const strategy = rule.strategy || "auto";

  if (strategy === "id" && cleanId) {
    push(document.getElementById(cleanId));
    return candidates;
  }
  if (strategy === "name" && cleanName) {
    push(document.getElementsByName(cleanName)[0]);
    return candidates;
  }
  if (strategy === "selector" && selector) {
    try {
      push(document.querySelector(selector));
    } catch (err) {}
    return candidates;
  }

  if (cleanId) push(document.getElementById(cleanId));
  if (cleanName) push(document.getElementsByName(cleanName)[0]);
  if (selector && selector !== "input" && selector !== "select") {
    try {
      document.querySelectorAll(selector).forEach(push);
    } catch (err) {}
  }
  if (rule.action === "radio" && cleanName) {
    document.querySelectorAll(`input[name="${cleanName}"]`).forEach(push);
  }

  if (candidates.length === 0) {
    const pool = document.querySelectorAll("input, select, textarea, button, a");
    for (let i = 0; i < pool.length; i++) {
      const el = pool[i];
      if (cleanName && (el.name || "") === cleanName) push(el);
      else if (cleanId && (el.id || "") === cleanId) push(el);
    }
  }

  return candidates;
}

function scoreCandidate(el, rule) {
  let score = 0;
  const cleanId = cleanText(rule.elementId);
  const cleanName = cleanText(rule.name);
  const selector = cleanText(rule.selector);

  if (cleanId && el.id === cleanId) score += 60;
  if (cleanName && el.name === cleanName) score += 45;

  if (selector) {
    try {
      if (el.matches(selector)) score += 35;
    } catch (err) {}
  }

  const action = rule.action;
  if (action === "select" && el.tagName === "SELECT") score += 20;
  if (action === "text" && /INPUT|TEXTAREA/.test(el.tagName)) score += 15;
  if (action === "checkbox" && String(el.type).toLowerCase() === "checkbox") score += 25;
  if (action === "radio" && String(el.type).toLowerCase() === "radio") score += 25;
  if (action === "click" && /BUTTON|A|INPUT/.test(el.tagName)) score += 10;

  if (rule.inputType && String(el.type || "").toLowerCase() === String(rule.inputType).toLowerCase()) {
    score += 10;
  }

  const labelText = String(el.getAttribute("aria-label") || "").toLowerCase();
  const placeholder = String(el.getAttribute("placeholder") || "").toLowerCase();
  if (cleanName && (labelText.includes(cleanName.toLowerCase()) || placeholder.includes(cleanName.toLowerCase()))) {
    score += 8;
  }

  return score;
}

function findBestElement(rule) {
  const candidates = getCandidates(rule);
  if (!candidates.length) return { element: null, score: 0 };

  let best = null;
  let bestScore = -1;
  for (const el of candidates) {
    const score = scoreCandidate(el, rule);
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (bestScore < 20) return { element: null, score: bestScore };
  return { element: best, score: bestScore };
}

function setNativeValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const descriptor = proto && Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor && typeof descriptor.set === "function") {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(list) {
  return list[rand(0, list.length - 1)];
}

function generateFakeFromType(type, locale) {
  const first = ["Alex", "Sam", "Jordan", "Taylor", "Casey", "Morgan"];
  const last = ["Shah", "Patel", "Singh", "Khan", "Rao", "Verma"];
  const domains = ["example.com", "mail.test", "autofill.dev"];
  const companies = ["Nimbus Labs", "Redline Tech", "Blue River", "Orchid Systems"];
  const citiesUS = ["Austin", "Seattle", "Denver", "Chicago", "Boston"];
  const citiesIN = ["Mumbai", "Delhi", "Bengaluru", "Pune", "Kolkata"];
  const streetsUS = ["Maple Ave", "Oak Street", "Sunset Blvd", "Pine Lane"];
  const streetsIN = ["MG Road", "Link Road", "Nehru Street", "Park View"];
  const cities = locale === "en-IN" ? citiesIN : citiesUS;
  const streets = locale === "en-IN" ? streetsIN : streetsUS;

  if (type === "name") return `${pick(first)} ${pick(last)}`;
  if (type === "firstName") return pick(first);
  if (type === "lastName") return pick(last);
  if (type === "email") {
    const handle = `${pick(first)}.${pick(last)}${rand(10, 99)}`.toLowerCase();
    return `${handle}@${pick(domains)}`;
  }
  if (type === "phone") {
    if (locale === "en-IN") return `9${rand(100000000, 999999999)}`;
    return `${rand(200, 999)}${rand(200, 999)}${rand(1000, 9999)}`;
  }
  if (type === "company") return pick(companies);
  if (type === "city") return pick(cities);
  if (type === "address") return `${rand(10, 999)} ${pick(streets)}`;
  if (type === "zip") return locale === "en-IN" ? String(rand(100000, 999999)) : String(rand(10000, 99999));
  if (type === "date") {
    const yyyy = rand(1990, 2004);
    const mm = String(rand(1, 12)).padStart(2, "0");
    const dd = String(rand(1, 28)).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return `value_${rand(1000, 9999)}`;
}

function detectFakeType(rule, el) {
  const merged = `${rule.name || ""} ${rule.elementId || ""} ${rule.label || ""} ${rule.placeholder || ""} ${el.name || ""} ${el.id || ""} ${el.placeholder || ""}`.toLowerCase();
  if (/\b(first.?name|fname)\b/.test(merged)) return "firstName";
  if (/\b(last.?name|lname|surname)\b/.test(merged)) return "lastName";
  if (/\b(full.?name|name)\b/.test(merged)) return "name";
  if (/\bemail|e-mail\b/.test(merged)) return "email";
  if (/\b(phone|mobile|contact)\b/.test(merged)) return "phone";
  if (/\b(company|organization|org)\b/.test(merged)) return "company";
  if (/\b(address|street)\b/.test(merged)) return "address";
  if (/\b(city|town)\b/.test(merged)) return "city";
  if (/\b(zip|postal|pincode)\b/.test(merged)) return "zip";
  if (/\b(dob|birth|date)\b/.test(merged)) return "date";
  return "name";
}

function resolveDesiredValue(rule, el, settings) {
  const raw = String(rule.value || "");
  const tokenMatch = raw.match(/^\{\{\s*fake\.([a-zA-Z]+)\s*\}\}$/);
  const locale = (settings.fakeData && settings.fakeData.locale) || "en-US";
  if (tokenMatch) {
    return generateFakeFromType(tokenMatch[1], locale);
  }
  if (!(settings.fakeData && settings.fakeData.enabled)) return raw;
  if (raw.trim()) return raw;
  const type = detectFakeType(rule, el);
  return generateFakeFromType(type, locale);
}

function tryFillRule(rule, settings, dryRun = false) {
  const match = findBestElement(rule);
  const el = match.element;
  if (!el) return { status: "failed", reason: "target_not_found", score: match.score };

  const skipReason = shouldSkipElement(el, settings);
  if (skipReason) return { status: "skipped", reason: skipReason, score: match.score, target: getElementPath(el) };

  try {
    if (rule.action === "checkbox") {
      const desiredState = String(rule.value) === "true";
      if (el.checked === desiredState) return { status: "skipped", reason: "already_set", score: match.score, target: getElementPath(el) };
      if (dryRun) return { status: "preview", reason: "would_set_checkbox", score: match.score, target: getElementPath(el) };
      el.click();
      if (el.checked !== desiredState) el.checked = desiredState;
      fireClickEvents(el);
      return { status: "filled", score: match.score, target: getElementPath(el) };
    }

    if (rule.action === "radio") {
      const desiredValue = String(rule.value);
      const groupName = cleanText(rule.name) || el.name;
      if (!groupName) return { status: "failed", reason: "radio_group_missing", score: match.score, target: getElementPath(el) };
      const radios = document.querySelectorAll(`input[name="${groupName}"]`);
      for (const radio of radios) {
        if (String(radio.value) === desiredValue) {
          if (radio.checked) return { status: "skipped", reason: "already_set", score: match.score, target: getElementPath(radio) };
          if (dryRun) return { status: "preview", reason: "would_set_radio", score: match.score, target: getElementPath(radio) };
          radio.click();
          fireClickEvents(radio);
          return { status: "filled", score: match.score, target: getElementPath(radio) };
        }
      }
      return { status: "failed", reason: "radio_value_not_found", score: match.score, target: getElementPath(el) };
    }

    if (rule.action === "select") {
      const desired = String(rule.value);
      if (String(el.value) === desired) return { status: "skipped", reason: "already_set", score: match.score, target: getElementPath(el) };
      if (dryRun) return { status: "preview", reason: "would_select_value", score: match.score, target: getElementPath(el) };
      el.value = desired;
      if (String(el.value) !== desired && el.options) {
        const cleanVal = desired.trim();
        for (let i = 0; i < el.options.length; i++) {
          const opt = el.options[i];
          if (String(opt.value).trim() === cleanVal || String(opt.text).trim() === cleanVal) {
            el.selectedIndex = i;
            break;
          }
        }
      }
      if (String(el.value) === desired || el.selectedIndex > -1) {
        fireDataEvents(el);
        return { status: "filled", score: match.score, target: getElementPath(el) };
      }
      return { status: "failed", reason: "select_value_not_found", score: match.score, target: getElementPath(el) };
    }

    if (rule.action === "text") {
      const desired = String(resolveDesiredValue(rule, el, settings));
      const hasExisting = String(el.value || "").trim().length > 0;
      if (
        settings.fakeData &&
        settings.fakeData.enabled &&
        settings.fakeData.fillEmptyOnly &&
        hasExisting &&
        !String(rule.value || "").trim()
      ) {
        return { status: "skipped", reason: "preserve_existing_value", score: match.score, target: getElementPath(el) };
      }
      if (String(el.value || "") === desired) return { status: "skipped", reason: "already_set", score: match.score, target: getElementPath(el) };
      if (dryRun) return { status: "preview", reason: "would_set_text", score: match.score, target: getElementPath(el) };
      setNativeValue(el, desired);
      fireDataEvents(el);
      return { status: "filled", score: match.score, target: getElementPath(el) };
    }

    if (rule.action === "click" || rule.action === "selectorClick") {
      if (dryRun) return { status: "preview", reason: "would_click", score: match.score, target: getElementPath(el) };
      el.click();
      fireClickEvents(el);
      return { status: "filled", score: match.score, target: getElementPath(el) };
    }

    return { status: "failed", reason: "unsupported_action", score: match.score, target: getElementPath(el) };
  } catch (err) {
    return { status: "failed", reason: "exception", error: String(err && err.message ? err.message : err), score: match.score, target: getElementPath(el) };
  }
}

function tryAutofillAll(profileRules, settings, runLog, dryRun = false) {
  for (const rawRule of profileRules) {
    const rule = normalizeRule(rawRule);
    const result = tryFillRule(rule, settings, dryRun);
    if (result.status !== "failed") runLog.matched += 1;
    if (result.status === "filled") runLog.filled += 1;
    if (result.status === "preview") runLog.preview += 1;
    if (result.status === "skipped") runLog.skipped += 1;
    if (result.status === "failed") runLog.failed += 1;

    runLog.details.push({
      ruleId: rule.id,
      action: rule.action,
      status: result.status,
      reason: result.reason || "",
      score: result.score || 0,
      target: result.target || "",
      error: result.error || ""
    });
  }
}

function getBackoffInterval(attempt) {
  const exp = Math.min(RETRY_MAX_MS, Math.round(RETRY_BASE_MS * Math.pow(1.4, Math.max(0, attempt - 1))));
  const jitter = Math.round(Math.random() * 60);
  return exp + jitter;
}

function autofillWithRetries(profileRules, settings, runLog, runToken, retries = 20, dryRun = false, onDone = null) {
  let tries = 0;
  const tryFill = () => {
    if (runToken !== ACTIVE_RUN_TOKEN) return;
    tries += 1;
    runLog.attempts = tries;
    tryAutofillAll(profileRules, settings, runLog, dryRun);
    if (dryRun) {
      finalizeRunLog(runLog, settings);
      if (typeof onDone === "function") onDone(runLog);
      return;
    }
    if (tries >= retries) {
      finalizeRunLog(runLog, settings);
      if (typeof onDone === "function") onDone(runLog);
      return;
    }
    setTimeout(tryFill, getBackoffInterval(tries + 1));
  };
  tryFill();
}

function getElementPath(el) {
  if (!el || !el.tagName) return "";
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  if (el.name) return `${tag}[name="${el.name}"]`;
  return tag;
}

function finalizeRunLog(runLog, settings) {
  runLog.finishedAt = Date.now();
  runLog.durationMs = runLog.finishedAt - runLog.startedAt;
  if (runLog.details.length > 300) {
    runLog.details = runLog.details.slice(runLog.details.length - 300);
  }
  chrome.storage.local.set({ lastRunLog: runLog });
  chrome.runtime.sendMessage({
    action: "runStats",
    matched: runLog.matched,
    filled: runLog.filled,
    skipped: runLog.skipped,
    preview: runLog.preview || 0,
    failed: runLog.failed,
    trigger: runLog.trigger,
    durationMs: runLog.durationMs || 0
  }).catch(() => {});
  if (settings.debugLogs) {
    console.log("[Autofill Recorder] Run", runLog);
  }
}

/* =========================================================================
   PART 2: RECORDER
   ========================================================================= */

function getElementLabel(el) {
  if (!el) return "";
  if (el.id) {
    const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (byFor) return byFor.textContent.trim().slice(0, 120);
  }
  const parentLabel = el.closest("label");
  if (parentLabel) return parentLabel.textContent.trim().slice(0, 120);
  return "";
}

function generateCssPath(el) {
  if (el.classList.contains("popupclose")) return ".popupclose";
  let path = el.tagName.toLowerCase();
  if (el.className && typeof el.className === "string") {
    const classes = el.className
      .split(/\s+/)
      .filter((c) => c.length > 2 && !["active", "focus", "hover", "select2", "btn"].includes(c));
    if (classes.length > 0) path += `.${classes.join(".")}`;
  }
  if (el.getAttribute("type")) path += `[type="${el.getAttribute("type")}"]`;
  return path;
}

function handleInteraction(e) {
  if (!IS_RECORDING) return;
  const el = e.target.closest("input, select, textarea, button, a, .popupclose");
  if (!el || el.type === "password") return;
  if (e.type === "click" && el.tagName === "INPUT" && (el.type === "text" || el.type === "email")) return;
  if (!el.id && !el.name && !el.className && el.tagName !== "BUTTON" && el.tagName !== "A") return;

  let action = "text";
  let val = el.value;

  if (el.tagName === "SELECT") action = "select";
  else if (el.tagName === "BUTTON" || el.tagName === "A" || el.type === "submit" || el.type === "button") {
    action = "click";
    val = "N/A";
  } else if (el.type === "checkbox") {
    action = "checkbox";
    val = el.checked;
  } else if (el.type === "radio") {
    action = "radio";
    if (!el.checked) return;
  }

  const rule = {
    id: Date.now().toString(),
    profileId: ACTIVE_PROFILE,
    site: window.location.hostname + window.location.pathname,
    siteScopeMode: CURRENT_SETTINGS.siteScopeMode || "domainPath",
    framePath: getCurrentFramePath(),
    strategy: "auto",
    name: el.name || el.getAttribute("name") || "",
    elementId: el.id || "",
    selector: generateCssPath(el),
    label: getElementLabel(el),
    placeholder: el.getAttribute("placeholder") || "",
    inputType: el.type || el.tagName.toLowerCase(),
    value: val,
    action,
    timestamp: Date.now(),
    schemaVersion: SCHEMA_VERSION
  };

  saveRule(rule);
}

function saveRule(newRule) {
  chrome.storage.local.get(["rules"], (data) => {
    let rules = data.rules || [];

    const exists = rules.some(
      (r) =>
        r.profileId === newRule.profileId &&
        r.site === newRule.site &&
        (r.framePath || "any") === (newRule.framePath || "any") &&
        r.selector === newRule.selector &&
        r.action === newRule.action &&
        String(r.value) === String(newRule.value)
    );

    if (exists) return;
    rules.push(newRule);

    chrome.storage.local.set({ rules }, () => {
      const el = document.querySelector(newRule.selector) || document.getElementsByName(newRule.name)[0];
      if (el) {
        const old = el.style.outline;
        el.style.outline = "4px solid red";
        setTimeout(() => {
          el.style.outline = old;
        }, 400);
      }
    });
  });
}

document.addEventListener("change", handleInteraction, true);
document.addEventListener("click", handleInteraction, true);

/* =========================================================================
   PART 3: INIT (PROFILE + SITE SCOPE + LOGGING)
   ========================================================================= */

function runAutofill(trigger = "manual", options = {}) {
  const thisRunToken = ++ACTIVE_RUN_TOKEN;
  chrome.storage.local.get(
    ["rules", "autofillEnabled", "activeProfile", "autofillSettings", "siteProfileDefaults"],
    (data) => {
      if (thisRunToken !== ACTIVE_RUN_TOKEN) return;
      if (data.autofillEnabled === false) return;

      const page = getPageValues();
      const currentFramePath = getCurrentFramePath();
      const profile = getPreferredProfile(page, data.activeProfile || "default", data.siteProfileDefaults);
      const settings = mergeSettings(data.autofillSettings);
      const dryRun = !!options.dryRun;
      const onlyRule = options.onlyRule ? normalizeRule(options.onlyRule) : null;
      const rules = (data.rules || [])
        .map(normalizeRule)
        .filter(
          (r) =>
            (profile === "all" || r.profileId === profile) &&
            matchScope(r, page, settings.siteScopeMode) &&
            matchFrame(r, currentFramePath)
        );
      const selectedRules = onlyRule ? [onlyRule] : rules;

      if (selectedRules.length === 0) {
        if (typeof options.onComplete === "function") {
          options.onComplete({
            schemaVersion: SCHEMA_VERSION,
            startedAt: Date.now(),
            finishedAt: Date.now(),
            durationMs: 0,
            profile,
            url: window.location.href,
            trigger,
            framePath: currentFramePath,
            siteScopeMode: settings.siteScopeMode,
            attempts: 0,
            matched: 0,
            filled: 0,
            preview: 0,
            skipped: 0,
            failed: 0,
            details: []
          });
        }
        return;
      }

      const runLog = {
        schemaVersion: SCHEMA_VERSION,
        startedAt: Date.now(),
        profile,
        url: window.location.href,
        trigger,
        framePath: currentFramePath,
        siteScopeMode: settings.siteScopeMode,
        dryRun,
        attempts: 0,
        matched: 0,
        filled: 0,
        preview: 0,
        skipped: 0,
        failed: 0,
        details: []
      };

      autofillWithRetries(
        selectedRules,
        settings,
        runLog,
        thisRunToken,
        dryRun ? 1 : 20,
        dryRun,
        options.onComplete || null
      );
    }
  );
}
