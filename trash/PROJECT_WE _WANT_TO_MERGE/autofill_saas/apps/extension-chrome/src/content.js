const ext = chrome;
const overlayId = "__autofill_overlay__";
const SCHEMA_VERSION = 1;
const MAX_PARENT_TRAVERSAL = 4;
const KEY_DELAY_MS = 25;
const RETRY_LIMIT = 2;
const DEFAULT_AUTOFILL_SETTINGS = {
  siteScopeMode: "domainPath"
};

const keywordDictionary = {
  full_name: ["name", "full name", "first name", "last name", "applicant name", "your name"],
  email: ["email", "e-mail", "email address", "mail id"],
  phone: ["phone", "mobile", "mobile number", "phone number", "contact number", "telephone", "tel"]
};

let latestRun = null;
let mutationObserver = null;
let rescanTimer = null;
let isRecording = false;
let activeProfile = "default";
let currentSettings = { ...DEFAULT_AUTOFILL_SETTINGS };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

const normalizeLabel = (text) =>
  (text || "")
    .toLowerCase()
    .replace(/e-mail/g, "email")
    .replace(/mobile no/g, "mobile number")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const mergeSettings = (settings) => ({
  siteScopeMode: settings?.siteScopeMode || DEFAULT_AUTOFILL_SETTINGS.siteScopeMode
});

const isVisible = (el) => {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const ensureOverlay = () => {
  let overlay = document.getElementById(overlayId);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = overlayId;
    overlay.style.position = "fixed";
    overlay.style.bottom = "12px";
    overlay.style.right = "12px";
    overlay.style.zIndex = "2147483647";
    overlay.style.padding = "8px 12px";
    overlay.style.background = "#10263f";
    overlay.style.color = "#ffffff";
    overlay.style.borderRadius = "8px";
    overlay.style.fontSize = "12px";
    overlay.style.fontFamily = "Segoe UI, sans-serif";
    document.documentElement.appendChild(overlay);
  }
  return overlay;
};

const setOverlayStatus = (text) => {
  const overlay = ensureOverlay();
  overlay.textContent = text;
};

const getNodeText = (node) => normalizeLabel(node?.textContent || "");

const getPageScope = () => {
  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname || "/";
  const query = window.location.search || "";
  return {
    host,
    domainPath: `${host}${path}`.toLowerCase(),
    domainPathQuery: `${host}${path}${query}`.toLowerCase(),
    fullUrl: window.location.href.toLowerCase()
  };
};

const getCurrentFramePath = () => {
  if (window.top === window.self) return "top";
  const indexes = [];
  let current = window;
  try {
    while (current !== current.top) {
      const parent = current.parent;
      let matchedIndex = -1;
      for (let i = 0; i < parent.frames.length; i += 1) {
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
  } catch (_error) {
    return "unknown";
  }
};

const normalizeRule = (rule) => ({
  ...rule,
  id: rule.id || nowId(),
  profileId: rule.profileId || "default",
  site: String(rule.site || "").trim(),
  strategy: rule.strategy || "auto",
  siteScopeMode: rule.siteScopeMode || "domainPath",
  framePath: rule.framePath || "any",
  schemaVersion: rule.schemaVersion || SCHEMA_VERSION,
  action: rule.action || "text",
  value: rule.value === undefined || rule.value === null ? "" : rule.value,
  name: String(rule.name || "").trim(),
  elementId: String(rule.elementId || "").trim(),
  selector: String(rule.selector || "").trim()
});

const matchScope = (rule, page, globalScopeMode) => {
  const pattern = String(rule.site || "").toLowerCase();
  if (!pattern) return false;
  const mode = rule.siteScopeMode || globalScopeMode || "domainPath";
  if (mode === "domain") {
    const ruleHost = pattern.split("/")[0];
    return page.host === ruleHost || page.host.endsWith(`.${ruleHost}`);
  }
  if (mode === "domainPathQuery") return page.domainPathQuery.includes(pattern);
  if (mode === "fullUrl") return page.fullUrl.includes(pattern);
  return page.domainPath.includes(pattern);
};

const matchFrame = (rule, framePath) => {
  const rf = rule.framePath || "any";
  if (rf === "any") return true;
  if (rf === "top") return framePath === "top";
  if (rf === "unknown") return true;
  return rf === framePath;
};

const collectNearestTextCandidates = (input, scope = document) => {
  const sourceRect = input.getBoundingClientRect();
  const candidates = [];
  const nodes = scope.querySelectorAll("label,span,div,p,strong,th,td,legend");
  for (const node of nodes) {
    if (node === input || !isVisible(node)) continue;
    const text = getNodeText(node);
    if (!text) continue;
    const rect = node.getBoundingClientRect();
    const dx = sourceRect.left - rect.right;
    const dy = sourceRect.top - rect.bottom;
    const leftOrAbove = rect.right <= sourceRect.left || rect.bottom <= sourceRect.top;
    const distance = Math.abs(dx) + Math.abs(dy);
    const priority = leftOrAbove ? 0 : 1000;
    candidates.push({ text, score: distance + priority });
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates.slice(0, 4).map((c) => c.text);
};

const extractLabelCandidates = (el) => {
  const labels = new Set();
  const isScopedContainer = (node) => {
    if (!node) return false;
    const inputs = node.querySelectorAll?.("input,textarea,select");
    return !inputs || inputs.length <= 2;
  };
  const pushCandidate = (value) => {
    const text = normalizeLabel(value || "");
    if (!text) return;
    if (text.length > 80) return;
    labels.add(text);
  };

  if (el.id) {
    const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (explicitLabel) pushCandidate(getNodeText(explicitLabel));
  }
  const wrappingLabel = el.closest("label");
  if (wrappingLabel) pushCandidate(getNodeText(wrappingLabel));

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) pushCandidate(ariaLabel);

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const ref = document.getElementById(id);
      if (ref) pushCandidate(getNodeText(ref));
    }
  }

  const placeholder = el.getAttribute("placeholder");
  if (placeholder) pushCandidate(placeholder);
  const title = el.getAttribute("title");
  if (title) pushCandidate(title);

  let parent = el.parentElement;
  let depth = 0;
  while (parent && depth < MAX_PARENT_TRAVERSAL) {
    if (isScopedContainer(parent)) pushCandidate(getNodeText(parent));
    const prev = parent.previousElementSibling;
    if (prev && isScopedContainer(prev)) pushCandidate(getNodeText(prev));
    parent = parent.parentElement;
    depth += 1;
  }

  const td = el.closest("td,th,[role='gridcell']");
  if (td?.parentElement) {
    const row = td.parentElement;
    const rowCells = [...row.children];
    const index = rowCells.indexOf(td);
    if (index > 0) pushCandidate(getNodeText(rowCells[index - 1]));
    const table = row.closest("table");
    if (table) {
      const firstRowCells = table.querySelector("tr")?.children;
      if (firstRowCells && firstRowCells[index]) pushCandidate(getNodeText(firstRowCells[index]));
    }
  }

  for (const candidate of collectNearestTextCandidates(el)) {
    pushCandidate(candidate);
  }
  return [...labels].filter(Boolean);
};

const extractContextTokens = (el) => {
  const tokens = [];
  const container = el.closest("form,fieldset,section,article,[role='group']");
  if (!container) return tokens;
  const heading = container.querySelector("legend,h1,h2,h3,h4,[role='heading']");
  if (heading) tokens.push(getNodeText(heading));
  const labelled = container.getAttribute("aria-label");
  if (labelled) tokens.push(normalizeLabel(labelled));
  return tokens.filter(Boolean);
};

const mapFieldKey = (el, labels, contextTokens) => {
  const elementHint = normalizeLabel(
    [
      el.getAttribute("type"),
      el.getAttribute("name"),
      el.getAttribute("id"),
      el.getAttribute("autocomplete"),
      el.getAttribute("aria-label"),
      el.getAttribute("placeholder")
    ]
      .filter(Boolean)
      .join(" ")
  );
  const elementType = String(el.getAttribute("type") || "").toLowerCase();
  const tokenMatch = (pattern) => new RegExp(`(^|[\\s_-])(${pattern})($|[\\s_-])`, "i").test(elementHint);
  if (elementType === "email" || tokenMatch("email")) {
    return { key: "email", confidence: 0.96 };
  }
  if (elementType === "tel" || tokenMatch("phone|mobile|telephone|tel")) {
    return { key: "phone", confidence: 0.95 };
  }
  if (tokenMatch("full[\\s_-]?name|first[\\s_-]?name|last[\\s_-]?name|name")) {
    return { key: "full_name", confidence: 0.9 };
  }

  const source = normalizeLabel([...labels, ...contextTokens].join(" "));
  const hasToken = (token) => new RegExp(`\\b${token}\\b`, "i").test(source);
  if (hasToken("email") || source.includes("e mail")) {
    return { key: "email", confidence: 0.94 };
  }
  if (hasToken("phone") || hasToken("mobile") || hasToken("telephone") || hasToken("tel")) {
    return { key: "phone", confidence: 0.93 };
  }

  let bestKey = "custom_field";
  let bestScore = 0.3;

  for (const [key, variants] of Object.entries(keywordDictionary)) {
    for (const variant of variants) {
      const normalizedVariant = normalizeLabel(variant);
      if (!normalizedVariant) continue;
      if (source === normalizedVariant) return { key, confidence: 0.96 };
      if (source.includes(normalizedVariant)) {
        const sizeWeight = Math.min(0.12, normalizedVariant.length / 100);
        const base = normalizedVariant.split(" ").length > 1 ? 0.85 : 0.76;
        const tokenScore = base + sizeWeight;
        if (tokenScore > bestScore) {
          bestKey = key;
          bestScore = tokenScore;
        }
      }
    }
  }
  return { key: bestKey, confidence: bestScore };
};

const isDynamicToken = (token) => /[0-9]{3,}|[a-f0-9]{6,}/i.test(token || "");

const selectorConfidence = (selector, uniqueness, stability) => {
  let score = 0.4;
  if (stability === "high") score += 0.35;
  if (stability === "medium") score += 0.2;
  if (uniqueness === 1) score += 0.2;
  if (selector.includes(":nth-of-type")) score -= 0.15;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
};

const buildSelectors = (el) => {
  const selectors = [];
  if (el.id && !isDynamicToken(el.id)) {
    selectors.push({ selector: `#${CSS.escape(el.id)}`, stability: "high" });
  }
  const name = el.getAttribute("name");
  if (name && !isDynamicToken(name)) {
    selectors.push({ selector: `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`, stability: "high" });
  }
  const autocomplete = el.getAttribute("autocomplete");
  const type = el.getAttribute("type");
  if (autocomplete) {
    selectors.push({
      selector: `${el.tagName.toLowerCase()}[autocomplete="${CSS.escape(autocomplete)}"]`,
      stability: "medium"
    });
  }
  if (type && name) {
    selectors.push({
      selector: `${el.tagName.toLowerCase()}[type="${CSS.escape(type)}"][name="${CSS.escape(name)}"]`,
      stability: "medium"
    });
  }
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    selectors.push({
      selector: `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel)}"]`,
      stability: "medium"
    });
  }
  const form = el.closest("form");
  if (form) {
    const peers = [...form.querySelectorAll(el.tagName.toLowerCase())];
    const index = peers.indexOf(el) + 1;
    selectors.push({
      selector: `form ${el.tagName.toLowerCase()}:nth-of-type(${Math.max(1, index)})`,
      stability: "low"
    });
  }

  const ranked = [];
  const seen = new Set();
  for (const item of selectors) {
    if (seen.has(item.selector)) continue;
    seen.add(item.selector);
    const uniqueness = document.querySelectorAll(item.selector).length;
    ranked.push({
      ...item,
      uniqueness,
      confidence: selectorConfidence(item.selector, uniqueness, item.stability)
    });
  }
  ranked.sort((a, b) => b.confidence - a.confidence);
  return ranked.slice(0, 3);
};

const collectFormFields = (root = document) => {
  const fields = [];
  const walker = (scope) => {
    const nodes = scope.querySelectorAll("input,textarea,select");
    for (const el of nodes) {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (!isVisible(el)) continue;
      if (el.disabled || el.readOnly) continue;
      if (tag === "input" && type === "hidden") continue;
      const labels = extractLabelCandidates(el);
      const contextTokens = extractContextTokens(el);
      const mapping = mapFieldKey(el, labels, contextTokens);
      const selectors = buildSelectors(el);
      fields.push({
        uid: crypto.randomUUID(),
        element: el,
        tag,
        type,
        labels,
        contextTokens,
        mappingKey: mapping.key,
        mappingConfidence: mapping.confidence,
        selectors
      });
    }
    const all = scope.querySelectorAll("*");
    for (const host of all) {
      if (host.shadowRoot && host.shadowRoot.mode === "open") {
        walker(host.shadowRoot);
      }
    }
  };
  walker(root);
  return fields;
};

const getNativeSetter = (el) => {
  if (el instanceof HTMLInputElement) {
    return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  }
  if (el instanceof HTMLTextAreaElement) {
    return Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  }
  if (el instanceof HTMLSelectElement) {
    return Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  }
  return null;
};

const dispatch = (el, type, extra = {}) => {
  const event =
    type === "input" || type === "change"
      ? new Event(type, { bubbles: true, cancelable: true })
      : new KeyboardEvent(type, { bubbles: true, cancelable: true, ...extra });
  el.dispatchEvent(event);
};

const setElementValue = (el, value) => {
  if (el instanceof HTMLInputElement) {
    const inputType = (el.type || "").toLowerCase();
    if (inputType === "checkbox" || inputType === "radio") {
      const boolValue = String(value).toLowerCase() === "true" || value === true || value === "1";
      el.checked = boolValue;
      dispatch(el, "change");
      return;
    }
  }
  const setter = getNativeSetter(el);
  if (setter) setter.call(el, value);
  else el.value = value;
  dispatch(el, "input");
  dispatch(el, "change");
  if (typeof el.blur === "function") el.blur();
};

const simulateTyping = async (el, value) => {
  const setter = getNativeSetter(el);
  if (setter) setter.call(el, "");
  else el.value = "";
  for (const ch of String(value)) {
    dispatch(el, "keydown", { key: ch });
    const current = el.value || "";
    if (setter) setter.call(el, current + ch);
    else el.value = current + ch;
    dispatch(el, "input");
    dispatch(el, "keyup", { key: ch });
    await wait(KEY_DELAY_MS);
  }
  dispatch(el, "change");
  if (typeof el.blur === "function") el.blur();
};

const useMaskedTyping = (el, intendedValue) => {
  const type = (el.getAttribute("type") || "").toLowerCase();
  const hasMaskHint = el.hasAttribute("data-mask") || Boolean(el.getAttribute("pattern")) || el.className.toLowerCase().includes("mask");
  if (hasMaskHint) return true;
  if (type === "tel" || type === "date" || type === "time") return true;
  return /[\-()/:]/.test(String(intendedValue));
};

const resolveElementFromSelectors = (selectors) => {
  for (const item of selectors) {
    const found = document.querySelector(item.selector);
    if (found) return found;
  }
  return null;
};

const validateAtIntervals = async (el, expected) => {
  const readValue = () => {
    if (el instanceof HTMLInputElement) {
      const inputType = (el.type || "").toLowerCase();
      if (inputType === "checkbox" || inputType === "radio") return Boolean(el.checked);
    }
    return String(el.value ?? "");
  };
  const expectedValue = typeof expected === "boolean" ? expected : String(expected).trim();
  const checks = [0, 50, 200];
  for (const delay of checks) {
    if (delay > 0) await wait(delay);
    const current = readValue();
    if (String(current).trim() !== String(expectedValue).trim()) {
      return { ok: false, observed: current };
    }
  }
  return { ok: true };
};

const fillField = async (field, value) => {
  let target = field.element;
  for (let attempt = 0; attempt <= RETRY_LIMIT; attempt += 1) {
    if (!target || !target.isConnected) {
      target = resolveElementFromSelectors(field.selectors);
    }
    if (!target) return { ok: false, reason: "element_not_found" };
    target.focus();
    if (attempt === 1 || useMaskedTyping(target, value)) {
      await simulateTyping(target, value);
    } else {
      setElementValue(target, value);
    }
    const validation = await validateAtIntervals(target, value);
    if (validation.ok) return { ok: true };
  }
  return { ok: false, reason: "value_overwritten" };
};

const buildAutofillPlan = (fields, profileData) => {
  const plan = [];
  for (const field of fields) {
    const mappedValue = profileData[field.mappingKey];
    if (mappedValue === undefined || mappedValue === null) continue;
    const selectorConfidenceValue = field.selectors[0]?.confidence || 0;
    plan.push({
      field,
      value: mappedValue,
      confidence: Number(((field.mappingConfidence + selectorConfidenceValue) / 2).toFixed(2))
    });
  }
  return plan;
};

const runGuidedAutofill = async (payload) => {
  const profileData = payload?.profileData || {};
  const fields = collectFormFields(document);
  const plan = buildAutofillPlan(fields, profileData);
  const results = [];
  latestRun = { startedAt: Date.now(), unresolved: new Map() };

  for (const item of plan) {
    const result = await fillField(item.field, item.value);
    results.push({
      mappingKey: item.field.mappingKey,
      labels: item.field.labels.slice(0, 2),
      confidence: item.confidence,
      ok: result.ok,
      reason: result.reason || null
    });
    if (!result.ok) latestRun.unresolved.set(item.field.uid, item);
    else latestRun.unresolved.delete(item.field.uid);
  }

  return {
    frameUrl: location.href,
    frameIsTop: window.top === window,
    totalDetected: fields.length,
    totalPlanned: plan.length,
    successCount: results.filter((r) => r.ok).length,
    results
  };
};

const getRuleCandidates = (rule) => {
  const candidates = [];
  const push = (el) => {
    if (!el || candidates.includes(el)) return;
    candidates.push(el);
  };
  if (rule.elementId) push(document.getElementById(rule.elementId));
  if (rule.name) {
    const byName = document.getElementsByName(rule.name);
    if (byName?.length) push(byName[0]);
  }
  if (rule.selector) {
    try {
      document.querySelectorAll(rule.selector).forEach(push);
    } catch (_error) {}
  }
  return candidates;
};

const findElementForRule = (rule) => {
  const candidates = getRuleCandidates(rule);
  if (!candidates.length) return null;
  if (rule.action === "radio" && rule.name) {
    const radios = document.querySelectorAll(`input[name="${CSS.escape(rule.name)}"]`);
    return radios.length ? radios[0] : null;
  }
  return candidates[0];
};

const applyRule = async (rule) => {
  const el = findElementForRule(rule);
  if (!el) return { ok: false, reason: "target_not_found" };
  const action = rule.action || "text";
  const value = rule.value;

  if (action === "checkbox") {
    const desired = String(value).toLowerCase() === "true" || value === true;
    if (el.checked !== desired) {
      el.click();
      if (el.checked !== desired) el.checked = desired;
      dispatch(el, "change");
    }
    return { ok: true };
  }

  if (action === "radio") {
    const name = rule.name || el.name;
    if (!name) return { ok: false, reason: "radio_group_missing" };
    const radios = document.querySelectorAll(`input[name="${CSS.escape(name)}"]`);
    for (const radio of radios) {
      if (String(radio.value) === String(value)) {
        radio.click();
        dispatch(radio, "change");
        return { ok: true };
      }
    }
    return { ok: false, reason: "radio_value_not_found" };
  }

  if (action === "select") {
    if (!(el instanceof HTMLSelectElement)) return { ok: false, reason: "wrong_element_type" };
    el.value = String(value);
    dispatch(el, "change");
    const check = await validateAtIntervals(el, String(value));
    return check.ok ? { ok: true } : { ok: false, reason: "value_overwritten" };
  }

  if (action === "click" || action === "selectorClick") {
    el.click();
    dispatch(el, "change");
    return { ok: true };
  }

  if (useMaskedTyping(el, value)) await simulateTyping(el, String(value));
  else setElementValue(el, String(value));
  const validation = await validateAtIntervals(el, String(value));
  return validation.ok ? { ok: true } : { ok: false, reason: "value_overwritten" };
};

const runRuleAutofill = (options = {}, onComplete = null) => {
  ext.storage.local.get(
    ["rules", "autofillEnabled", "activeProfile", "autofillSettings", "siteProfileDefaults"],
    async (data) => {
      if (data.autofillEnabled === false) {
        onComplete?.({
          trigger: options.trigger || "manual",
          matched: 0,
          filled: 0,
          failed: 0,
          skipped: 0,
          details: []
        });
        return;
      }

      const page = getPageScope();
      const framePath = getCurrentFramePath();
      const settings = mergeSettings(data.autofillSettings);
      const preferredProfile =
        data.siteProfileDefaults?.[page.domainPath] ||
        data.siteProfileDefaults?.[page.host] ||
        data.activeProfile ||
        activeProfile ||
        "default";
      const onlyRule = options.onlyRule ? normalizeRule(options.onlyRule) : null;
      const selected = (data.rules || [])
        .map(normalizeRule)
        .filter(
          (rule) =>
            (preferredProfile === "all" || rule.profileId === preferredProfile) &&
            matchScope(rule, page, settings.siteScopeMode) &&
            matchFrame(rule, framePath)
        );
      const rules = onlyRule ? [onlyRule] : selected;

      const runLog = {
        trigger: options.trigger || "manual",
        framePath,
        dryRun: !!options.dryRun,
        startedAt: Date.now(),
        matched: 0,
        filled: 0,
        skipped: 0,
        failed: 0,
        details: []
      };

      for (const rule of rules) {
        if (runLog.dryRun) {
          const target = findElementForRule(rule);
          if (target) {
            runLog.matched += 1;
            runLog.skipped += 1;
            runLog.details.push({ ruleId: rule.id, status: "preview", reason: "would_apply" });
          } else {
            runLog.failed += 1;
            runLog.details.push({ ruleId: rule.id, status: "failed", reason: "target_not_found" });
          }
          continue;
        }

        const result = await applyRule(rule);
        if (result.ok) {
          runLog.matched += 1;
          runLog.filled += 1;
          runLog.details.push({ ruleId: rule.id, status: "filled" });
        } else {
          runLog.failed += 1;
          runLog.details.push({ ruleId: rule.id, status: "failed", reason: result.reason || "failed" });
        }
      }

      runLog.finishedAt = Date.now();
      runLog.durationMs = runLog.finishedAt - runLog.startedAt;
      ext.storage.local.set({ lastRunLog: runLog }, () => {
        ext.runtime.sendMessage({
          action: "runStats",
          matched: runLog.matched,
          filled: runLog.filled,
          skipped: runLog.skipped,
          failed: runLog.failed,
          durationMs: runLog.durationMs,
          trigger: runLog.trigger
        });
      });
      onComplete?.(runLog);
    }
  );
};

const getElementLabel = (el) => {
  if (!el) return "";
  if (el.id) {
    const explicit = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (explicit) return explicit.textContent?.trim() || "";
  }
  const wrapped = el.closest("label");
  return wrapped?.textContent?.trim() || "";
};

const generateCssPath = (el) => {
  let path = el.tagName.toLowerCase();
  if (el.className && typeof el.className === "string") {
    const classes = el.className.split(/\s+/).filter((c) => c && c.length > 2).slice(0, 3);
    if (classes.length) path += `.${classes.join(".")}`;
  }
  if (el.getAttribute("type")) path += `[type="${el.getAttribute("type")}"]`;
  return path;
};

const saveRecordedRule = (rule) => {
  ext.storage.local.get(["rules"], (data) => {
    const rules = Array.isArray(data.rules) ? data.rules : [];
    const duplicate = rules.some(
      (r) =>
        r.profileId === rule.profileId &&
        r.site === rule.site &&
        (r.framePath || "any") === (rule.framePath || "any") &&
        r.selector === rule.selector &&
        r.action === rule.action &&
        String(r.value) === String(rule.value)
    );
    if (duplicate) return;
    rules.push(rule);
    ext.storage.local.set({ rules });
  });
};

const handleRecordingEvent = (event) => {
  if (!isRecording) return;
  const el = event.target?.closest?.("input, select, textarea, button, a");
  if (!el || (el.type || "").toLowerCase() === "password") return;
  if (event.type === "click" && el.tagName === "INPUT" && ["text", "email"].includes((el.type || "").toLowerCase())) {
    return;
  }
  if (!el.id && !el.name && !el.className && el.tagName !== "BUTTON" && el.tagName !== "A") return;

  let action = "text";
  let value = el.value;
  const type = (el.type || "").toLowerCase();
  if (el.tagName === "SELECT") action = "select";
  else if (type === "checkbox") {
    action = "checkbox";
    value = el.checked;
  } else if (type === "radio") {
    action = "radio";
    if (!el.checked) return;
  } else if (el.tagName === "BUTTON" || el.tagName === "A" || type === "submit" || type === "button") {
    action = "click";
    value = "N/A";
  }

  const rule = {
    id: nowId(),
    profileId: activeProfile || "default",
    site: `${window.location.hostname}${window.location.pathname}`,
    siteScopeMode: currentSettings.siteScopeMode || "domainPath",
    framePath: getCurrentFramePath(),
    strategy: "auto",
    name: el.name || "",
    elementId: el.id || "",
    selector: generateCssPath(el),
    label: getElementLabel(el),
    placeholder: el.getAttribute("placeholder") || "",
    inputType: el.type || el.tagName.toLowerCase(),
    value,
    action,
    timestamp: Date.now(),
    schemaVersion: SCHEMA_VERSION
  };
  saveRecordedRule(rule);
};

const debounceRescan = () => {
  if (rescanTimer) clearTimeout(rescanTimer);
  rescanTimer = setTimeout(async () => {
    if (!latestRun || latestRun.unresolved.size === 0) return;
    const pending = [...latestRun.unresolved.values()];
    for (const item of pending) {
      const refreshed = collectFormFields(document).find((f) => f.mappingKey === item.field.mappingKey);
      if (!refreshed) continue;
      const result = await fillField(refreshed, item.value);
      if (result.ok) latestRun.unresolved.delete(item.field.uid);
    }
  }, 100);
};

const startMutationObserver = () => {
  if (mutationObserver) return;
  mutationObserver = new MutationObserver(() => {
    debounceRescan();
  });
  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "value", "aria-hidden"]
  });
};

const highlightInputs = () => {
  const inputs = document.querySelectorAll("input, textarea, select");
  inputs.forEach((element) => {
    element.style.outline = "1px dashed rgba(20, 120, 255, 0.7)";
  });
};

const scanFieldsSummary = () => {
  const fields = collectFormFields(document);
  return fields.map((f) => ({
    mappingKey: f.mappingKey,
    mappingConfidence: f.mappingConfidence,
    topLabel: f.labels[0] || "",
    selectorConfidence: f.selectors[0]?.confidence || 0
  }));
};

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "toggleRecord") {
    isRecording = !!message.state;
    ext.storage.local.set({ isRecording });
    sendResponse({ ok: true });
    return true;
  }
  if (message.action === "updateProfile") {
    activeProfile = message.profile || "default";
    ext.storage.local.set({ activeProfile });
    runRuleAutofill({ trigger: "profile-change" });
    sendResponse({ ok: true });
    return true;
  }
  if (message.action === "forceRun") {
    runRuleAutofill({ trigger: "manual-force" }, (runLog) => {
      sendResponse({ ok: true, runLog });
    });
    return true;
  }
  if (message.action === "previewRun") {
    runRuleAutofill({ trigger: "preview", dryRun: true }, (runLog) => {
      sendResponse({ ok: true, runLog });
    });
    return true;
  }
  if (message.action === "testRule") {
    runRuleAutofill(
      {
        trigger: "test-rule",
        dryRun: !!message.dryRun,
        onlyRule: message.rule || null
      },
      (runLog) => sendResponse({ ok: true, runLog })
    );
    return true;
  }

  if (message.type === "SCAN_FIELDS") {
    sendResponse({
      ok: true,
      frameUrl: location.href,
      frameIsTop: window.top === window,
      fields: scanFieldsSummary()
    });
    return true;
  }
  if (message.type === "FILL_FIELDS") {
    setOverlayStatus("Autofill running...");
    runGuidedAutofill(message.payload)
      .then((result) => {
        setOverlayStatus(`Autofill done: ${result.successCount}/${result.totalPlanned}`);
        sendResponse({ ok: true, result });
      })
      .catch((error) => {
        setOverlayStatus("Autofill failed");
        sendResponse({ ok: false, error: String(error) });
      });
    return true;
  }

  sendResponse({ ok: false, error: "Unknown message type" });
  return true;
});

document.addEventListener("change", handleRecordingEvent, true);
document.addEventListener("click", handleRecordingEvent, true);

ext.runtime.sendMessage({
  type: "FRAME_READY",
  payload: {
    url: location.href,
    isTop: window.top === window
  }
});

ext.storage.local.get(["autofillEnabled", "isRecording", "activeProfile", "autofillSettings"], (data) => {
  isRecording = !!data.isRecording;
  activeProfile = data.activeProfile || "default";
  currentSettings = mergeSettings(data.autofillSettings);
  if (data.autofillEnabled === false) return;
  ensureOverlay();
  highlightInputs();
  startMutationObserver();
});

ext.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.isRecording) isRecording = !!changes.isRecording.newValue;
  if (changes.activeProfile) activeProfile = changes.activeProfile.newValue || "default";
  if (changes.autofillSettings) currentSettings = mergeSettings(changes.autofillSettings.newValue);
  if (changes.autofillEnabled && changes.autofillEnabled.newValue !== false) {
    ensureOverlay();
    startMutationObserver();
  }
});
