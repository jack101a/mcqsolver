document.addEventListener("DOMContentLoaded", () => {
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
  const DEFAULT_SERVER_CONFIG = {
    enabled: false,
    baseUrl: "",
    apiKey: "",
    deviceId: ""
  };

  const tableBody = document.querySelector("#rulesTable tbody");
  const searchBox = document.getElementById("searchBox");
  const filterProfile = document.getElementById("filterProfile");
  const previewBtn = document.getElementById("previewBtn");
  const fillNowBtn = document.getElementById("fillNowBtn");
  const scopeModeSelect = document.getElementById("scopeModeSelect");
  const guardSkipHidden = document.getElementById("guardSkipHidden");
  const guardSkipDisabled = document.getElementById("guardSkipDisabled");
  const guardSkipReadonly = document.getElementById("guardSkipReadonly");
  const guardSkipPassword = document.getElementById("guardSkipPassword");
  const guardSkipCaptcha = document.getElementById("guardSkipCaptcha");
  const debugLogs = document.getElementById("debugLogs");
  const maskSensitiveValues = document.getElementById("maskSensitiveValues");
  const fakeDataEnabled = document.getElementById("fakeDataEnabled");
  const fakeFillEmptyOnly = document.getElementById("fakeFillEmptyOnly");
  const fakeLocaleSelect = document.getElementById("fakeLocaleSelect");
  const serverEnabled = document.getElementById("serverEnabled");
  const serverBaseUrl = document.getElementById("serverBaseUrl");
  const serverApiKey = document.getElementById("serverApiKey");
  const saveServerConfigBtn = document.getElementById("saveServerConfigBtn");
  const testServerBtn = document.getElementById("testServerBtn");
  const proposeSelectedBtn = document.getElementById("proposeSelectedBtn");
  const syncFromServerBtn = document.getElementById("syncFromServerBtn");
  const serverStatus = document.getElementById("serverStatus");
  const pmProfileSelect = document.getElementById("pmProfileSelect");
  const pmAddBtn = document.getElementById("pmAddBtn");
  const pmRenameBtn = document.getElementById("pmRenameBtn");
  const pmDuplicateBtn = document.getElementById("pmDuplicateBtn");
  const pmDeleteBtn = document.getElementById("pmDeleteBtn");
  const pmSetSiteDefaultBtn = document.getElementById("pmSetSiteDefaultBtn");
  const pmClearSiteDefaultBtn = document.getElementById("pmClearSiteDefaultBtn");
  const pmSiteStatus = document.getElementById("pmSiteStatus");

  const modal = document.getElementById("ruleModal");
  const editId = document.getElementById("editId");
  const editProfile = document.getElementById("editProfile");
  const editSite = document.getElementById("editSite");
  const editStrategy = document.getElementById("editStrategy");
  const editName = document.getElementById("editName");
  const editElementId = document.getElementById("editElementId");
  const editSelector = document.getElementById("editSelector");
  const editAction = document.getElementById("editAction");
  const editValue = document.getElementById("editValue");

  let allRules = [];
  let profiles = [];
  let autofillSettings = DEFAULT_AUTOFILL_SETTINGS;
  let schemaVersion = SCHEMA_VERSION;
  let serverConfig = DEFAULT_SERVER_CONFIG;
  let siteProfileDefaults = {};
  let activeProfile = "all";

  loadData();

  function mergeSettings(settings) {
    const guards = (settings && settings.fillGuards) || {};
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
        enabled: !!(settings && settings.fakeData && settings.fakeData.enabled),
        locale:
          (settings && settings.fakeData && settings.fakeData.locale) || "en-US",
        fillEmptyOnly:
          settings && settings.fakeData && settings.fakeData.fillEmptyOnly !== undefined
            ? !!settings.fakeData.fillEmptyOnly
            : true
      }
    };
  }

  function mergeServerConfig(config) {
    return {
      enabled: !!(config && config.enabled),
      baseUrl: (config && config.baseUrl ? String(config.baseUrl) : "").trim(),
      apiKey: (config && config.apiKey ? String(config.apiKey) : "").trim(),
      deviceId:
        (config && config.deviceId ? String(config.deviceId) : "").trim() ||
        `dev_${Math.random().toString(16).slice(2, 10)}`
    };
  }

  function makeProfileId(name) {
    return (
      String(name || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "profile"
    );
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  }

  function getScopeKeysFromUrl(url) {
    try {
      const u = new URL(url);
      return {
        host: u.hostname.toLowerCase(),
        domainPath: `${u.hostname.toLowerCase()}${u.pathname}`
      };
    } catch (err) {
      return { host: "", domainPath: "" };
    }
  }

  function renderProfileManager() {
    const opts = profiles.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
    pmProfileSelect.innerHTML = opts;
    if (profiles.some((p) => p.id === activeProfile)) pmProfileSelect.value = activeProfile;
    else pmProfileSelect.value = profiles[0] ? profiles[0].id : "default";
  }

  async function renderSiteDefaultStatus() {
    const tab = await getActiveTab();
    const keys = getScopeKeysFromUrl(tab && tab.url ? tab.url : "");
    const pid = siteProfileDefaults[keys.domainPath] || siteProfileDefaults[keys.host];
    if (!pid) {
      pmSiteStatus.textContent = "No site default profile set for this page.";
      return;
    }
    const p = profiles.find((x) => x.id === pid);
    pmSiteStatus.textContent = `Site default profile for this page: ${p ? p.name : pid}`;
  }

  function renderSettings() {
    scopeModeSelect.value = autofillSettings.siteScopeMode;
    guardSkipHidden.checked = !!autofillSettings.fillGuards.skipHidden;
    guardSkipDisabled.checked = !!autofillSettings.fillGuards.skipDisabled;
    guardSkipReadonly.checked = !!autofillSettings.fillGuards.skipReadonly;
    guardSkipPassword.checked = !!autofillSettings.fillGuards.skipPassword;
    guardSkipCaptcha.checked = !!autofillSettings.fillGuards.skipCaptchaLike;
    debugLogs.checked = !!autofillSettings.debugLogs;
    maskSensitiveValues.checked = !!autofillSettings.maskSensitiveValues;
    fakeDataEnabled.checked = !!autofillSettings.fakeData.enabled;
    fakeFillEmptyOnly.checked = !!autofillSettings.fakeData.fillEmptyOnly;
    fakeLocaleSelect.value = autofillSettings.fakeData.locale || "en-US";
  }

  function renderServerConfig() {
    serverEnabled.checked = !!serverConfig.enabled;
    serverBaseUrl.value = serverConfig.baseUrl || "";
    serverApiKey.value = serverConfig.apiKey || "";
  }

  function saveSettings() {
    autofillSettings = {
      siteScopeMode: scopeModeSelect.value || DEFAULT_AUTOFILL_SETTINGS.siteScopeMode,
      fillGuards: {
        skipHidden: guardSkipHidden.checked,
        skipDisabled: guardSkipDisabled.checked,
        skipReadonly: guardSkipReadonly.checked,
        skipPassword: guardSkipPassword.checked,
        skipCaptchaLike: guardSkipCaptcha.checked
      },
      debugLogs: debugLogs.checked,
      maskSensitiveValues: maskSensitiveValues.checked,
      fakeData: {
        enabled: fakeDataEnabled.checked,
        locale: fakeLocaleSelect.value || "en-US",
        fillEmptyOnly: fakeFillEmptyOnly.checked
      }
    };
    chrome.storage.local.set({ autofillSettings, schemaVersion: SCHEMA_VERSION });
    renderTable();
  }

  function saveServerConfig() {
    serverConfig = mergeServerConfig({
      enabled: serverEnabled.checked,
      baseUrl: serverBaseUrl.value,
      apiKey: serverApiKey.value,
      deviceId: serverConfig.deviceId
    });
    chrome.storage.local.set({ serverConfig });
    setServerStatus("configuration saved.");
  }

  function loadData() {
    chrome.storage.local.get(
      ["rules", "profiles", "autofillSettings", "schemaVersion", "serverConfig", "siteProfileDefaults", "activeProfile"],
      (data) => {
        allRules = data.rules || [];
        profiles = data.profiles || [{ id: "default", name: "Default" }];
        autofillSettings = mergeSettings(data.autofillSettings);
        schemaVersion = data.schemaVersion || SCHEMA_VERSION;
        serverConfig = mergeServerConfig(data.serverConfig);
        siteProfileDefaults = data.siteProfileDefaults || {};
        activeProfile = data.activeProfile || "all";
        if (!data.serverConfig || !data.serverConfig.deviceId) {
          chrome.storage.local.set({ serverConfig });
        }
        updateDropdowns();
        renderSettings();
        renderServerConfig();
        renderProfileManager();
        renderSiteDefaultStatus();
        renderTable();
      }
    );
  }

  function getProfileName(id) {
    const p = profiles.find((x) => x.id === id);
    return p ? p.name : id;
  }

  function truncate(str, n) {
    if (!str) return "";
    return str.length > n ? `${str.slice(0, n)}...` : str;
  }

  function getStrategyBadge(rule) {
    const s = rule.strategy || "auto";
    if (s === "id")
      return `<span style="color:#2563eb; font-weight:bold; font-size:11px;">FORCE ID:</span> <span style="font-family:monospace; font-size:11px;">#${truncate(rule.elementId, 15)}</span>`;
    if (s === "name")
      return `<span style="color:#059669; font-weight:bold; font-size:11px;">FORCE NAME:</span> <span style="font-family:monospace; font-size:11px;">${truncate(rule.name, 15)}</span>`;
    if (s === "selector")
      return `<span style="color:#d97706; font-weight:bold; font-size:11px;">FORCE CSS:</span> <span style="font-family:monospace; font-size:11px;">${truncate(rule.selector, 15)}</span>`;
    if (rule.elementId) return `<span style="color:#64748b; font-size:11px;">Auto (ID)</span>`;
    if (rule.name) return `<span style="color:#64748b; font-size:11px;">Auto (Name)</span>`;
    return `<span style="color:#64748b; font-size:11px;">Auto (CSS)</span>`;
  }

  function formatValue(rule) {
    if (rule.action === "click") return '<span style="color:#2563eb">Click</span>';
    if (rule.action === "checkbox")
      return rule.value ? "Checked" : "Unchecked";
    const raw = String(rule.value || "");
    const display = autofillSettings.maskSensitiveValues ? maskSensitive(raw) : raw;
    return truncate(display, 20);
  }

  function maskSensitive(value) {
    const str = String(value || "");
    if (!str) return "";
    const emailMatch = str.match(/^([^@]+)@(.+)$/);
    if (emailMatch) {
      const local = emailMatch[1];
      const domain = emailMatch[2];
      const localMasked = local.length <= 2 ? `${local[0] || "*"}*` : `${local.slice(0, 2)}***`;
      return `${localMasked}@${domain}`;
    }
    if (str.length <= 4) return "*".repeat(str.length);
    return `${str.slice(0, 2)}${"*".repeat(Math.min(8, str.length - 4))}${str.slice(-2)}`;
  }

  function normalizeRuleForImport(rule) {
    if (!rule || typeof rule !== "object") return null;
    const normalized = { ...rule };
    normalized.id = normalized.id || String(Date.now() + Math.random());
    normalized.profileId = normalized.profileId || "default";
    normalized.site = String(normalized.site || "").trim();
    normalized.strategy = normalized.strategy || "auto";
    normalized.siteScopeMode = normalized.siteScopeMode || "domainPath";
    normalized.framePath = normalized.framePath || "any";
    normalized.name = String(normalized.name || "").trim();
    normalized.elementId = String(normalized.elementId || "").trim();
    normalized.selector = String(normalized.selector || "").trim();
    normalized.action = normalized.action || "text";
    normalized.value = normalized.value === undefined || normalized.value === null ? "" : normalized.value;
    normalized.timestamp = normalized.timestamp || Date.now();
    normalized.schemaVersion = SCHEMA_VERSION;
    return normalized.site ? normalized : null;
  }

  function normalizeImportPayload(parsed) {
    if (Array.isArray(parsed)) {
      return {
        schemaVersion: SCHEMA_VERSION,
        rules: parsed,
        profiles: profiles,
        autofillSettings: autofillSettings,
        serverConfig: serverConfig
      };
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Import payload must be an object");
    }
    return {
      schemaVersion: parsed.schemaVersion || SCHEMA_VERSION,
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : profiles,
      autofillSettings: mergeSettings(parsed.autofillSettings || autofillSettings),
      serverConfig: mergeServerConfig(parsed.serverConfig || serverConfig)
    };
  }

  function updateDropdowns() {
    const currentVal = filterProfile.value || "all";
    const opts = profiles.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
    filterProfile.innerHTML = `<option value="all">All Profiles</option>${opts}`;
    filterProfile.value = currentVal;
    editProfile.innerHTML = opts;
  }

  function renderTable() {
    const filtered = getFilteredRules();
    filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (!filtered.length) {
      tableBody.innerHTML =
        '<tr><td colspan="5" style="text-align:center; padding:30px; color:#94a3b8;">No rules found.</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered
      .map((rule) => {
        const pName = getProfileName(rule.profileId);
        const displayValue = formatValue(rule);
        const displayStrategy = getStrategyBadge(rule);
        return `
        <tr>
          <td><span class="badge">${pName}</span></td>
          <td title="${rule.site}" style="font-size:12px; color:#475569;">${truncate(
            rule.site,
            40
          )}</td>
          <td>${displayStrategy}</td>
          <td><b>${displayValue}</b></td>
          <td style="text-align:right">
            <button class="btn btn-outline btn-test" data-id="${rule.id}" style="padding:4px 8px">Test</button>
            <button class="btn btn-outline btn-edit" data-id="${rule.id}" style="padding:4px 8px">Edit</button>
            <button class="btn btn-danger btn-delete" data-id="${rule.id}" style="padding:4px 8px">Delete</button>
          </td>
        </tr>`;
      })
      .join("");
  }

  function getFilteredRules() {
    const searchText = searchBox.value.toLowerCase();
    const selProfile = filterProfile.value;
    return allRules.filter((r) => {
      const haystack = `${r.site || ""}${r.value || ""}${r.selector || ""}${r.name || ""}`.toLowerCase();
      const matchText = haystack.includes(searchText);
      const matchProfile = selProfile === "all" || r.profileId === selProfile;
      return matchText && matchProfile;
    });
  }

  async function sendToActiveTab(payload) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("No active tab");
    return chrome.tabs.sendMessage(tab.id, payload);
  }

  function ensureServerReady() {
    if (!serverConfig.enabled) throw new Error("Server sync is disabled");
    if (!serverConfig.baseUrl) throw new Error("Server URL is missing");
    if (!serverConfig.apiKey) throw new Error("API key is missing");
    return serverConfig.baseUrl.replace(/\/+$/, "");
  }

  function setServerStatus(message, type = "neutral") {
    if (!serverStatus) return;
    serverStatus.textContent = `Server status: ${message}`;
    if (type === "ok") serverStatus.style.color = "#166534";
    else if (type === "error") serverStatus.style.color = "#b91c1c";
    else serverStatus.style.color = "#64748b";
  }

  async function serverRequest(path, init = {}) {
    const base = ensureServerReady();
    const headers = {
      "Content-Type": "application/json",
      "X-API-Key": serverConfig.apiKey,
      ...(init.headers || {})
    };
    const res = await fetch(`${base}${path}`, { ...init, headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server error ${res.status}: ${text}`);
    }
    return res.json();
  }

  function toProposalPayload(rule) {
    const selector = {
      strategy: rule.strategy || "auto",
      id: rule.elementId || "",
      name: rule.name || "",
      css: rule.selector || ""
    };
    return {
      idempotency_key: `${serverConfig.deviceId}_${rule.id}_${rule.timestamp || Date.now()}`,
      submitted_at: new Date().toISOString(),
      client: {
        extension_version: "1.0.0",
        schema_version: schemaVersion || SCHEMA_VERSION,
        device_id: serverConfig.deviceId,
        browser: "chrome",
        os: navigator.platform || ""
      },
      rule: {
        local_rule_id: rule.id,
        name: `${rule.action || "text"} @ ${rule.site || "unknown"}`,
        status: "draft",
        site: {
          match_mode: rule.siteScopeMode || "domainPath",
          pattern: rule.site || ""
        },
        profile_scope: rule.profileId || "default",
        frame_path: rule.framePath || "any",
        priority: 100,
        steps: [
          {
            order: 1,
            action: rule.action || "text",
            value: rule.value,
            selector
          }
        ],
        meta: {
          recorded_url: rule.site || "",
          tags_suggested: [],
          source: "extension-options"
        }
      }
    };
  }

  async function proposeFilteredRules() {
    const filtered = getFilteredRules();
    if (!filtered.length) {
      alert("No filtered rules to propose.");
      setServerStatus("no filtered rules to propose.", "error");
      return;
    }
    let ok = 0;
    let failed = 0;
    for (const rule of filtered) {
      try {
        const payload = toProposalPayload(rule);
        await serverRequest("/api/v1/rules/proposals", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        rule.syncStatus = "pending_review";
        ok += 1;
      } catch (err) {
        failed += 1;
      }
    }
    chrome.storage.local.set({ rules: allRules }, () => {
      renderTable();
      alert(`Propose complete. Success: ${ok}, Failed: ${failed}`);
      setServerStatus(`propose finished (${ok} success, ${failed} failed).`, failed ? "error" : "ok");
    });
  }

  function normalizeServerRule(serverRule) {
    const step = (serverRule.steps && serverRule.steps[0]) || {};
    const selector = step.selector || {};
    return {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      profileId: serverRule.profile_scope || "default",
      site:
        (serverRule.site && serverRule.site.pattern) || "",
      strategy: selector.strategy || "auto",
      siteScopeMode:
        (serverRule.site && serverRule.site.match_mode) || "domainPath",
      framePath: serverRule.frame_path || "any",
      name: selector.name || "",
      elementId: selector.id || "",
      selector: selector.css || "",
      action: step.action || "text",
      value: step.value === undefined ? "" : step.value,
      timestamp: Date.now(),
      schemaVersion: SCHEMA_VERSION,
      origin: "server",
      serverRuleId: serverRule.server_rule_id || ""
    };
  }

  async function syncFromServer() {
    const data = await serverRequest("/api/v1/rules/sync", { method: "GET" });
    const serverRules = Array.isArray(data.rules) ? data.rules : [];
    const normalized = serverRules.map(normalizeServerRule).filter((r) => r.site);
    const localNonServer = allRules.filter((r) => r.origin !== "server");
    const merged = [...localNonServer];
    const byServerId = new Map();
    normalized.forEach((r) => {
      const key = r.serverRuleId || `${r.site}|${r.action}|${r.selector}|${r.name}`;
      byServerId.set(key, r);
    });
    byServerId.forEach((r) => merged.push(r));
    allRules = merged;
    chrome.storage.local.set({ rules: allRules }, () => {
      renderTable();
      alert(`Sync complete. Downloaded ${normalized.length} approved rules.`);
      setServerStatus(`sync complete (${normalized.length} rules downloaded).`, "ok");
    });
  }

  function saveProfileState(nextProfiles, nextRules, nextDefaults, nextActiveProfile) {
    profiles = nextProfiles;
    allRules = nextRules;
    siteProfileDefaults = nextDefaults;
    activeProfile = nextActiveProfile || activeProfile;
    chrome.storage.local.set(
      {
        profiles,
        rules: allRules,
        siteProfileDefaults,
        activeProfile
      },
      () => {
        updateDropdowns();
        renderProfileManager();
        renderSiteDefaultStatus();
        renderTable();
      }
    );
  }

  function addProfileFromManager() {
    const name = prompt("Enter new profile name:");
    if (!name) return;
    let id = makeProfileId(name);
    let seq = 2;
    while (profiles.some((p) => p.id === id)) {
      id = `${makeProfileId(name)}_${seq++}`;
    }
    const nextProfiles = profiles.concat([{ id, name: name.trim() }]);
    saveProfileState(nextProfiles, allRules, siteProfileDefaults, id);
  }

  function renameProfileFromManager() {
    const id = pmProfileSelect.value;
    if (!id || id === "default") {
      alert("Default profile cannot be renamed.");
      return;
    }
    const current = profiles.find((p) => p.id === id);
    if (!current) return;
    const name = prompt("Rename profile:", current.name);
    if (!name) return;
    const nextProfiles = profiles.map((p) =>
      p.id === id ? { ...p, name: name.trim() } : p
    );
    saveProfileState(nextProfiles, allRules, siteProfileDefaults, id);
  }

  function duplicateProfileFromManager() {
    const id = pmProfileSelect.value;
    if (!id) return;
    const source = profiles.find((p) => p.id === id);
    if (!source) return;
    const proposed = `${source.name} Copy`;
    const name = prompt("New duplicate profile name:", proposed);
    if (!name) return;
    let newId = makeProfileId(name);
    let seq = 2;
    while (profiles.some((p) => p.id === newId)) {
      newId = `${makeProfileId(name)}_${seq++}`;
    }
    const copiedRules = allRules
      .filter((r) => r.profileId === id)
      .map((r) => ({
        ...r,
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        profileId: newId,
        timestamp: Date.now()
      }));
    const nextProfiles = profiles.concat([{ id: newId, name: name.trim() }]);
    const nextRules = allRules.concat(copiedRules);
    saveProfileState(nextProfiles, nextRules, siteProfileDefaults, newId);
  }

  function deleteProfileFromManager() {
    const id = pmProfileSelect.value;
    if (!id || id === "default") {
      alert("Default profile cannot be deleted.");
      return;
    }
    if (!confirm("Delete this profile and all associated rules?")) return;
    const nextProfiles = profiles.filter((p) => p.id !== id);
    const nextRules = allRules.filter((r) => r.profileId !== id);
    const nextDefaults = { ...siteProfileDefaults };
    Object.keys(nextDefaults).forEach((k) => {
      if (nextDefaults[k] === id) delete nextDefaults[k];
    });
    const nextActive =
      activeProfile === id
        ? (nextProfiles[0] ? nextProfiles[0].id : "default")
        : activeProfile;
    saveProfileState(nextProfiles, nextRules, nextDefaults, nextActive);
  }

  async function setSiteDefaultFromManager() {
    const selected = pmProfileSelect.value;
    if (!selected) return;
    const tab = await getActiveTab();
    const keys = getScopeKeysFromUrl(tab && tab.url ? tab.url : "");
    if (!keys.domainPath) {
      alert("Open a normal website tab first.");
      return;
    }
    const nextDefaults = { ...siteProfileDefaults, [keys.domainPath]: selected };
    saveProfileState(profiles, allRules, nextDefaults, activeProfile);
  }

  async function clearSiteDefaultFromManager() {
    const tab = await getActiveTab();
    const keys = getScopeKeysFromUrl(tab && tab.url ? tab.url : "");
    if (!keys.domainPath && !keys.host) {
      alert("Open a normal website tab first.");
      return;
    }
    const nextDefaults = { ...siteProfileDefaults };
    if (keys.domainPath) delete nextDefaults[keys.domainPath];
    if (keys.host) delete nextDefaults[keys.host];
    saveProfileState(profiles, allRules, nextDefaults, activeProfile);
  }

  function summarizeRun(runLog) {
    if (!runLog) return "No run details available.";
    const mode = runLog.dryRun ? "Preview" : "Run";
    const issues = summarizeTopIssues(runLog);
    return (
      `${mode} Complete\n` +
      `Trigger: ${runLog.trigger || "manual"}\n` +
      `Attempts: ${runLog.attempts || 0}  Duration: ${runLog.durationMs || 0} ms\n\n` +
      `Matched: ${runLog.matched}\n` +
      `Filled: ${runLog.filled}\n` +
      `Preview: ${runLog.preview || 0}\n` +
      `Skipped: ${runLog.skipped}\n` +
      `Failed: ${runLog.failed}\n\n` +
      `${issues}`
    );
  }

  function summarizeTopIssues(runLog) {
    const details = Array.isArray(runLog.details) ? runLog.details : [];
    if (!details.length) return "Top issues: None";
    const counts = {};
    for (const item of details) {
      const key = item.reason || item.status || "unknown";
      counts[key] = (counts[key] || 0) + 1;
    }
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason, count]) => `- ${reason}: ${count}`)
      .join("\n");
    return `Top issues:\n${top || "None"}`;
  }

  async function testRule(id) {
    const rule = allRules.find((r) => r.id === id);
    if (!rule) return alert("Rule not found.");
    try {
      const result = await sendToActiveTab({ action: "testRule", rule, dryRun: false });
      alert(summarizeRun(result && result.runLog ? result.runLog : null));
    } catch (err) {
      alert(`Test failed: ${err.message || err}`);
    }
  }

  function openModal(id = null) {
    if (id) {
      const r = allRules.find((x) => x.id === id);
      if (!r) return;
      editId.value = r.id;
      editProfile.value = r.profileId || "default";
      editSite.value = r.site;
      editStrategy.value = r.strategy || "auto";
      editName.value = r.name || "";
      editElementId.value = r.elementId || "";
      editSelector.value = r.selector || "";
      editAction.value = r.action;
      editValue.value = r.value;
    } else {
      editId.value = "";
      editProfile.value = filterProfile.value === "all" ? "default" : filterProfile.value;
      editSite.value = "";
      editStrategy.value = "auto";
      editName.value = "";
      editElementId.value = "";
      editSelector.value = "";
      editAction.value = "text";
      editValue.value = "";
    }
    modal.classList.add("active");
  }

  function deleteRule(id) {
    if (!confirm("Delete this rule?")) return;
    allRules = allRules.filter((r) => r.id !== id);
    chrome.storage.local.set({ rules: allRules }, renderTable);
  }

  tableBody.addEventListener("click", (e) => {
    const target = e.target.closest("button");
    if (!target) return;
    const id = target.getAttribute("data-id");
    if (target.classList.contains("btn-test")) testRule(id);
    if (target.classList.contains("btn-edit")) openModal(id);
    if (target.classList.contains("btn-delete")) deleteRule(id);
  });

  document.getElementById("cancelModal").addEventListener("click", () => {
    modal.classList.remove("active");
  });

  document.getElementById("saveModal").addEventListener("click", () => {
    const id = editId.value;
    const existingRule = id ? allRules.find((r) => r.id === id) : null;
    const newRule = {
      id: id || Date.now().toString(),
      profileId: editProfile.value,
      site: editSite.value.trim(),
      strategy: editStrategy.value,
      siteScopeMode: scopeModeSelect.value || "domainPath",
      framePath: existingRule ? existingRule.framePath || "any" : "any",
      name: editName.value.trim(),
      elementId: editElementId.value.trim(),
      selector: editSelector.value.trim(),
      action: editAction.value,
      value: editValue.value,
      timestamp: Date.now()
    };
    if (!newRule.site) return alert("Site is required");

    if (id) {
      const idx = allRules.findIndex((r) => r.id === id);
      if (idx !== -1) allRules[idx] = newRule;
    } else {
      allRules.push(newRule);
    }
    chrome.storage.local.set({ rules: allRules }, () => {
      renderTable();
      modal.classList.remove("active");
    });
  });

  document.getElementById("addRuleBtn").addEventListener("click", () => openModal(null));
  document.getElementById("clearAllBtn").addEventListener("click", () => {
    if (!confirm("Delete ALL rules?")) return;
    chrome.storage.local.set({ rules: [] }, loadData);
  });

  document.getElementById("dedupeBtn").addEventListener("click", () => {
    if (!confirm("Remove duplicate rules?")) return;
    const seen = new Set();
    const uniqueRules = [];
    allRules.forEach((r) => {
      const key = `${r.profileId}|${r.site}|${r.framePath || "any"}|${r.selector}|${r.name}|${r.action}|${r.value}`;
      if (seen.has(key)) return;
      seen.add(key);
      uniqueRules.push(r);
    });
    allRules = uniqueRules;
    chrome.storage.local.set({ rules: allRules }, () => {
      loadData();
      alert("Duplicate rules removed.");
    });
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    const payload = {
      schemaVersion,
      autofillSettings,
      serverConfig,
      rules: allRules,
      profiles
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "autofill_backup.json";
    a.click();
  });

  document.getElementById("debugExportBtn").addEventListener("click", () => {
    chrome.storage.local.get(null, (storageDump) => {
      const payload = {
        exportedAt: new Date().toISOString(),
        app: "Autofill Recorder",
        schemaVersion,
        summary: {
          rules: (allRules || []).length,
          profiles: (profiles || []).length
        },
        currentSettings: autofillSettings,
        serverConfig,
        lastRunLog: storageDump.lastRunLog || null,
        storage: storageDump
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "autofill_debug_export.json";
      a.click();
    });
  });

  document.getElementById("importBtn").addEventListener("click", () => {
    document.getElementById("fileInput").click();
  });

  document.getElementById("fileInput").addEventListener("change", (e) => {
    const fr = new FileReader();
    fr.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);
        const d = normalizeImportPayload(raw);
        const migratedRules = d.rules
          .map(normalizeRuleForImport)
          .filter(Boolean);
        if (!migratedRules.length) {
          alert("No valid rules found in import file.");
          return;
        }
        const nextSettings = mergeSettings(d.autofillSettings);
        const nextSchema = d.schemaVersion || SCHEMA_VERSION;
        chrome.storage.local.set(
          {
            rules: migratedRules,
            profiles: d.profiles || profiles,
            autofillSettings: nextSettings,
            serverConfig: d.serverConfig ? mergeServerConfig(d.serverConfig) : serverConfig,
            schemaVersion: nextSchema
          },
          () => location.reload()
        );
      } catch (err) {
        alert(`Invalid file: ${err.message || err}`);
      }
    };
    fr.readAsText(e.target.files[0]);
  });

  [
    scopeModeSelect,
    guardSkipHidden,
    guardSkipDisabled,
    guardSkipReadonly,
    guardSkipPassword,
    guardSkipCaptcha,
    debugLogs,
    maskSensitiveValues,
    fakeDataEnabled,
    fakeFillEmptyOnly,
    fakeLocaleSelect
  ].forEach((el) => el.addEventListener("change", saveSettings));

  previewBtn.addEventListener("click", async () => {
    try {
      const result = await sendToActiveTab({ action: "previewRun" });
      alert(summarizeRun(result && result.runLog ? result.runLog : null));
    } catch (err) {
      alert(`Preview failed: ${err.message || err}`);
    }
  });

  fillNowBtn.addEventListener("click", async () => {
    try {
      await sendToActiveTab({ action: "forceRun" });
      alert("Fill triggered on current tab.");
    } catch (err) {
      alert(`Fill trigger failed: ${err.message || err}`);
    }
  });

  saveServerConfigBtn.addEventListener("click", () => {
    try {
      saveServerConfig();
      alert("Server config saved.");
    } catch (err) {
      alert(`Save failed: ${err.message || err}`);
    }
  });

  testServerBtn.addEventListener("click", async () => {
    try {
      saveServerConfig();
      const data = await serverRequest("/api/v1/rules/sync", { method: "GET" });
      const count = Array.isArray(data.rules) ? data.rules.length : 0;
      setServerStatus(`connected (visible approved rules: ${count}).`, "ok");
    } catch (err) {
      setServerStatus(`connection failed (${err.message || err}).`, "error");
    }
  });

  proposeSelectedBtn.addEventListener("click", async () => {
    try {
      saveServerConfig();
      await proposeFilteredRules();
    } catch (err) {
      alert(`Propose failed: ${err.message || err}`);
      setServerStatus(`propose failed (${err.message || err}).`, "error");
    }
  });

  syncFromServerBtn.addEventListener("click", async () => {
    try {
      saveServerConfig();
      await syncFromServer();
    } catch (err) {
      alert(`Sync failed: ${err.message || err}`);
      setServerStatus(`sync failed (${err.message || err}).`, "error");
    }
  });

  pmProfileSelect.addEventListener("change", () => {
    const chosen = pmProfileSelect.value;
    activeProfile = chosen;
    chrome.storage.local.set({ activeProfile: chosen });
  });

  pmAddBtn.addEventListener("click", addProfileFromManager);
  pmRenameBtn.addEventListener("click", renameProfileFromManager);
  pmDuplicateBtn.addEventListener("click", duplicateProfileFromManager);
  pmDeleteBtn.addEventListener("click", deleteProfileFromManager);
  pmSetSiteDefaultBtn.addEventListener("click", setSiteDefaultFromManager);
  pmClearSiteDefaultBtn.addEventListener("click", clearSiteDefaultFromManager);

  searchBox.addEventListener("input", renderTable);
  filterProfile.addEventListener("change", renderTable);
});
