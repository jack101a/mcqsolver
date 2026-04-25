const extApi = typeof browser !== "undefined" ? browser : chrome;

let disabledHosts = [];
let domainFieldRoutes = [];
let globalFieldRoutes = {};

function sendMessage(message) {
  const maybe = extApi.runtime.sendMessage(message);
  if (maybe && typeof maybe.then === "function") return maybe;
  return new Promise((resolve) => extApi.runtime.sendMessage(message, resolve));
}

function unwrapResponse(resp) {
  if (!resp) throw new Error("No response from extension background");
  if (resp.ok === false) throw new Error(resp.error || "Request failed");
  return resp.result !== undefined ? resp.result : resp;
}

function hashKey(input) {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h) + input.charCodeAt(i);
  return (h >>> 0).toString(16).slice(0, 10);
}

function makeFieldName(taskType, sourceSelector, targetSelector) {
  return `${taskType}_default`;
}

function normalizeDomain(value) {
  let token = String(value || "").trim().toLowerCase();
  if (!token) return "";
  token = token.split("/", 1)[0].split(":", 1)[0].replace(/\.$/, "");
  if (token.startsWith("www.")) token = token.slice(4);
  return token;
}

function makeLegacyCustomLocators(routes) {
  const legacy = {};
  for (const route of routes) {
    if (route.taskType !== "image") continue;
    if (legacy[route.domain]) continue;
    legacy[route.domain] = { img: route.sourceSelector, input: route.targetSelector };
  }
  return legacy;
}

function normalizeToken(value) {
  return String(value || "").trim();
}

function routeSignature(route) {
  const domain = normalizeToken(route.domain).toLowerCase();
  const taskType = normalizeToken(route.taskType || route.task_type || route.source_data_type).toLowerCase();
  const src = normalizeToken(route.sourceSelector || route.source_selector);
  const tgt = normalizeToken(route.targetSelector || route.target_selector);
  return `${domain}|${taskType}|${src}|${tgt}`;
}

function buildServerSignatureSet(routesByDomain) {
  const signatures = new Set();
  Object.entries(routesByDomain || {}).forEach(([domain, entries]) => {
    (entries || []).forEach((entry) => {
      signatures.add(routeSignature({
        domain,
        taskType: entry.task_type || entry.source_data_type || "image",
        sourceSelector: entry.source_selector || "",
        targetSelector: entry.target_selector || "",
      }));
    });
  });
  return signatures;
}

function dedupeLocalRoutes(localRoutes, routesByDomain) {
  const serverSet = buildServerSignatureSet(routesByDomain);
  const seenLocal = new Set();
  const kept = [];
  let removedAsServerDuplicate = 0;
  let removedAsLocalDuplicate = 0;
  for (const route of Array.isArray(localRoutes) ? localRoutes : []) {
    const sig = routeSignature(route);
    if (!sig || sig === "|||") continue;
    if (serverSet.has(sig)) {
      removedAsServerDuplicate += 1;
      continue;
    }
    if (seenLocal.has(sig)) {
      removedAsLocalDuplicate += 1;
      continue;
    }
    seenLocal.add(sig);
    kept.push(route);
  }
  return { kept, removedAsServerDuplicate, removedAsLocalDuplicate };
}

document.addEventListener("DOMContentLoaded", () => {
  const rootEl = document.documentElement;
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const apiBaseUrlEl = document.getElementById("apiBaseUrl");
  const apiKeyEl = document.getElementById("apiKey");
  const imageTaskEnabledEl = document.getElementById("imageTaskEnabled");
  const audioTaskEnabledEl = document.getElementById("audioTaskEnabled");
  const textTaskEnabledEl = document.getElementById("textTaskEnabled");
  const autoSolveEl = document.getElementById("autoSolve");
  const delayMsEl = document.getElementById("delayMs");
  const saveBtn = document.getElementById("saveBtn");
  const syncBtn = document.getElementById("syncBtn");
  const statusLine = document.getElementById("statusLine");

  const disabledHostsList = document.getElementById("disabledHostsList");
  const newDisabledHost = document.getElementById("newDisabledHost");
  const addHostBtn = document.getElementById("addHostBtn");

  const locatorList = document.getElementById("locatorList");
  const locDomain = document.getElementById("locDomain");
  const locTaskType = document.getElementById("locTaskType");
  const locImg = document.getElementById("locImg");
  const locInput = document.getElementById("locInput");
  const addLocatorBtn = document.getElementById("addLocatorBtn");
  const pickSourceBtn = document.getElementById("pickSourceBtn");
  const pickTargetBtn = document.getElementById("pickTargetBtn");
  const pickerStatus = document.getElementById("pickerStatus");

  function applyTheme(isDark) {
    rootEl.setAttribute("data-theme", isDark ? "dark" : "light");
    if (themeToggleBtn) {
      const icon = document.getElementById("themeIcon");
      if (icon) icon.textContent = isDark ? "\u2600" : "\u263E";
    }
  }

  extApi.storage.local.get(["isDarkTheme"], (res) => {
    const isDark = res.isDarkTheme !== false;
    applyTheme(isDark);
  });
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const nextDark = rootEl.getAttribute("data-theme") !== "dark";
      applyTheme(nextDark);
      extApi.storage.local.set({ isDarkTheme: nextDark });
    });
  }

  function renderHosts() {
    disabledHostsList.innerHTML = "";
    if (disabledHosts.length === 0) {
      disabledHostsList.innerHTML = "<p style='color:#6b7280; font-size:0.875rem; margin:0;'>No disabled hosts.</p>";
      return;
    }
    disabledHosts.forEach((host, idx) => {
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML = `<span style="font-family: monospace; color: #d1d5db;">${host}</span><button class="btn-danger" data-idx="${idx}">Remove</button>`;
      div.querySelector("button").addEventListener("click", () => {
        if (!window.confirm(`Remove disabled host '${host}'?`)) return;
        disabledHosts.splice(idx, 1);
        saveLists();
      });
      disabledHostsList.appendChild(div);
    });
  }

  function renderRoutes() {
    const serverRoutes = [];
    Object.entries(globalFieldRoutes || {}).forEach(([domain, entries]) => {
      (entries || []).forEach((entry) => {
        serverRoutes.push({
          domain,
          taskType: entry.task_type || entry.source_data_type || "image",
          sourceSelector: entry.source_selector || "",
          targetSelector: entry.target_selector || "",
          fieldName: entry.field_name || "",
          origin: "server",
        });
      });
    });
    const localRoutes = domainFieldRoutes.map((r, idx) => ({ ...r, origin: "local", localIdx: idx }));
    const all = [...serverRoutes, ...localRoutes];

    locatorList.innerHTML = "";
    if (all.length === 0) {
      locatorList.innerHTML = "<p style='color:#6b7280; font-size:0.875rem; margin:0;'>No routes saved.</p>";
      return;
    }

    all.forEach((route, idx) => {
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML = `
        <div style="font-size: 0.8rem; color: #9ca3af;">
          <strong style="color: #60a5fa;">${route.domain}</strong>
          <span style="color:#facc15;">(${route.taskType})</span>
          <span style="color:${route.origin === "server" ? "#34d399" : "#9ca3af"};">[${route.origin}]</span><br>
          SRC: <code>${route.sourceSelector}</code><br>
          TGT: <code>${route.targetSelector}</code><br>
          KEY: <code>${route.fieldName}</code>
        </div>
        ${route.origin === "local" ? `<button class="btn-danger" data-local-idx="${route.localIdx}">Remove</button>` : ""}
      `;
      const btn = div.querySelector("button");
      if (btn) {
        const localIdx = Number(btn.getAttribute("data-local-idx"));
        btn.addEventListener("click", () => {
          if (Number.isNaN(localIdx) || localIdx < 0 || localIdx >= domainFieldRoutes.length) return;
          const route = domainFieldRoutes[localIdx];
          if (!window.confirm(`Remove local route for ${route?.domain || "domain"}?`)) return;
          domainFieldRoutes.splice(localIdx, 1);
          saveLists();
        });
      }
      locatorList.appendChild(div);
    });
  }

  function saveLists() {
    extApi.storage.local.set({
      disabledHosts,
      domainFieldRoutes,
      customLocators: makeLegacyCustomLocators(domainFieldRoutes),
    }, () => {
      renderHosts();
      renderRoutes();
    });
  }

  async function syncNow() {
    try {
      const locatorInfo = unwrapResponse(await sendMessage({ type: "SYNC_LOCATORS" })) || {};
      const pushed = unwrapResponse(await sendMessage({ type: "SYNC_PENDING_ROUTES" }));
      const routeInfo = unwrapResponse(await sendMessage({ type: "SYNC_FIELD_MAPPINGS" })) || {};
      extApi.storage.local.get(["globalFieldRoutes"], (res) => {
        globalFieldRoutes = res.globalFieldRoutes || {};
        const deduped = dedupeLocalRoutes(domainFieldRoutes, globalFieldRoutes);
        domainFieldRoutes = deduped.kept;
        extApi.storage.local.set({
          domainFieldRoutes,
          customLocators: makeLegacyCustomLocators(domainFieldRoutes),
        });
        renderRoutes();
        if ((deduped.removedAsServerDuplicate + deduped.removedAsLocalDuplicate) > 0) {
          statusLine.textContent = `Synced. Removed ${deduped.removedAsServerDuplicate} server-duplicate and ${deduped.removedAsLocalDuplicate} local-duplicate routes.`;
          setTimeout(() => { statusLine.textContent = ""; }, 2200);
          return;
        }
      });
      const info = pushed || {};
      statusLine.textContent = `Synced. Domains: ${routeInfo.count ?? 0}, locators: ${locatorInfo.count ?? 0}, proposed: ${info.proposed ?? 0}, skipped: ${info.skipped ?? 0}, failed: ${info.failed ?? 0}`;
      setTimeout(() => { statusLine.textContent = ""; }, 1800);
    } catch (err) {
      statusLine.textContent = `Sync failed: ${err.message || err}`;
    }
  }

  extApi.storage.local.get([
    "apiBaseUrl", "apiKey", "imageTaskEnabled", "audioTaskEnabled", "textTaskEnabled", "textCaptchaEnabled",
    "autoSolve", "delayMs",
    "disabledHosts", "customLocators", "domainFieldRoutes", "globalFieldRoutes"
  ], (res) => {
    apiBaseUrlEl.value = res.apiBaseUrl || "http://localhost:8080";
    apiKeyEl.value = res.apiKey || "";
    imageTaskEnabledEl.checked = res.imageTaskEnabled !== undefined ? res.imageTaskEnabled : (res.textCaptchaEnabled !== undefined ? res.textCaptchaEnabled : true);
    audioTaskEnabledEl.checked = res.audioTaskEnabled !== undefined ? res.audioTaskEnabled : true;
    textTaskEnabledEl.checked = res.textTaskEnabled !== undefined ? res.textTaskEnabled : true;
    autoSolveEl.checked = res.autoSolve !== undefined ? res.autoSolve : true;
    delayMsEl.value = res.delayMs !== undefined ? res.delayMs : 300;
    disabledHosts = res.disabledHosts || [];
    globalFieldRoutes = res.globalFieldRoutes || {};
    domainFieldRoutes = Array.isArray(res.domainFieldRoutes) ? res.domainFieldRoutes : [];
    if (domainFieldRoutes.length === 0) {
      const legacy = res.customLocators || {};
      domainFieldRoutes = Object.entries(legacy).map(([domain, loc]) => ({
        domain,
        taskType: "image",
        sourceSelector: loc.img || "",
        targetSelector: loc.input || "",
        fieldName: makeFieldName("image", loc.img || "", loc.input || ""),
        sourceFieldType: "image",
        targetFieldType: "text_input",
      })).filter((x) => x.sourceSelector && x.targetSelector);
    }
    const deduped = dedupeLocalRoutes(domainFieldRoutes, globalFieldRoutes);
    domainFieldRoutes = deduped.kept;
    if ((deduped.removedAsServerDuplicate + deduped.removedAsLocalDuplicate) > 0) {
      extApi.storage.local.set({
        domainFieldRoutes,
        customLocators: makeLegacyCustomLocators(domainFieldRoutes),
      });
    }
    renderHosts();
    renderRoutes();
  });

  syncNow().catch(() => {});

  saveBtn.addEventListener("click", () => {
    extApi.storage.local.set({
      apiBaseUrl: apiBaseUrlEl.value.trim(),
      apiKey: apiKeyEl.value.trim(),
      imageTaskEnabled: imageTaskEnabledEl.checked,
      audioTaskEnabled: audioTaskEnabledEl.checked,
      textTaskEnabled: textTaskEnabledEl.checked,
      autoSolve: autoSolveEl.checked,
      delayMs: parseInt(delayMsEl.value, 10) || 0
    }, () => {
      statusLine.textContent = "Core settings saved.";
      setTimeout(() => { statusLine.textContent = ""; }, 1800);
    });
  });

  syncBtn.addEventListener("click", () => { syncNow(); });

  addHostBtn.addEventListener("click", () => {
    const host = newDisabledHost.value.trim();
    const normalizedHost = normalizeDomain(host);
    if (normalizedHost && !disabledHosts.includes(normalizedHost)) {
      disabledHosts.push(normalizedHost);
      newDisabledHost.value = "";
      saveLists();
    }
  });

  async function startPicker(targetField) {
    pickerStatus.textContent = `Picker started for ${targetField}. Click an element in the website tab.`;
    try {
      await sendMessage({ type: "START_LOCATE", targetField });
    } catch (err) {
      pickerStatus.textContent = `Picker error: ${err.message || err}`;
    }
  }

  pickSourceBtn.addEventListener("click", () => startPicker("source"));
  pickTargetBtn.addEventListener("click", () => startPicker("target"));

  extApi.runtime.onMessage.addListener((message) => {
    if (message.type !== "LOCATOR_PICKED_UI") return;
    if (message.targetField === "source") {
      locImg.value = message.selector;
      pickerStatus.textContent = "Source selected.";
    } else if (message.targetField === "target") {
      locInput.value = message.selector;
      pickerStatus.textContent = "Target selected.";
    }
  });

  addLocatorBtn.addEventListener("click", async () => {
    const domain = normalizeDomain(locDomain.value.trim());
    const taskType = locTaskType.value;
    const sourceSelector = locImg.value.trim();
    const targetSelector = locInput.value.trim();
    if (!domain || !sourceSelector || !targetSelector) {
      pickerStatus.textContent = "Fill domain, source selector, and target selector.";
      return;
    }

    try {
      const result = unwrapResponse(await sendMessage({ type: "VALIDATE_SELECTORS", sourceSelector, targetSelector }));
      if (!result?.ok) {
        pickerStatus.textContent = `Invalid selectors: ${result?.error || "Unknown error"}`;
        return;
      }
      if (!result.srcCount || !result.tgtCount) {
        pickerStatus.textContent = `Selector not found on active tab (src:${result.srcCount}, tgt:${result.tgtCount}).`;
        return;
      }
    } catch (err) {
      pickerStatus.textContent = `Validation failed: ${err.message || err}`;
      return;
    }

    const fieldName = makeFieldName(taskType, sourceSelector, targetSelector);
    const record = {
      domain,
      taskType,
      sourceSelector,
      targetSelector,
      fieldName,
      sourceFieldType: taskType,
      targetFieldType: "text_input",
    };
    const existingIdx = domainFieldRoutes.findIndex((r) => (
      r.domain === domain && r.taskType === taskType && r.sourceSelector === sourceSelector && r.targetSelector === targetSelector
    ));
    if (existingIdx >= 0) domainFieldRoutes[existingIdx] = record;
    else domainFieldRoutes.push(record);
    saveLists();

    try {
      unwrapResponse(await sendMessage({
        type: "PROPOSE_FIELD_MAPPING",
        payload: {
          domain,
          task_type: taskType,
          source_data_type: taskType,
          source_selector: sourceSelector,
          target_data_type: "text_input",
          target_selector: targetSelector,
          proposed_field_name: fieldName,
        },
      }));
      if (taskType === "image") {
        unwrapResponse(await sendMessage({ type: "PROPOSE_LOCATOR", domain, img: sourceSelector, input: targetSelector }));
      }
      pickerStatus.textContent = "Route saved and synced.";
    } catch (err) {
      pickerStatus.textContent = `Saved locally. Backend sync failed: ${err.message || err}`;
    }
  });
});
