document.addEventListener("DOMContentLoaded", () => {
  const ext = typeof browser !== "undefined" ? browser : chrome;
  const SCHEMA_VERSION = 1;
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
    fakeData: { enabled: false, locale: "en-US", fillEmptyOnly: true }
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
  let siteProfileDefaults = {};
  let activeProfile = "all";

  const mergeSettings = (settings) => {
    const guards = (settings && settings.fillGuards) || {};
    return {
      siteScopeMode: (settings && settings.siteScopeMode) || DEFAULT_AUTOFILL_SETTINGS.siteScopeMode,
      fillGuards: {
        skipHidden: guards.skipHidden !== undefined ? !!guards.skipHidden : DEFAULT_AUTOFILL_SETTINGS.fillGuards.skipHidden,
        skipDisabled: guards.skipDisabled !== undefined ? !!guards.skipDisabled : DEFAULT_AUTOFILL_SETTINGS.fillGuards.skipDisabled,
        skipReadonly: guards.skipReadonly !== undefined ? !!guards.skipReadonly : DEFAULT_AUTOFILL_SETTINGS.fillGuards.skipReadonly,
        skipPassword: guards.skipPassword !== undefined ? !!guards.skipPassword : DEFAULT_AUTOFILL_SETTINGS.fillGuards.skipPassword,
        skipCaptchaLike: guards.skipCaptchaLike !== undefined ? !!guards.skipCaptchaLike : DEFAULT_AUTOFILL_SETTINGS.fillGuards.skipCaptchaLike
      },
      debugLogs: !!(settings && settings.debugLogs),
      maskSensitiveValues: !!(settings && settings.maskSensitiveValues),
      fakeData: {
        enabled: !!(settings && settings.fakeData && settings.fakeData.enabled),
        locale: (settings && settings.fakeData && settings.fakeData.locale) || "en-US",
        fillEmptyOnly:
          settings && settings.fakeData && settings.fakeData.fillEmptyOnly !== undefined
            ? !!settings.fakeData.fillEmptyOnly
            : true
      }
    };
  };

  const getStorage = async (keys) => ext.storage.local.get(keys);
  const setStorage = async (value) => ext.storage.local.set(value);
  const getActiveTab = async () => (await ext.tabs.query({ active: true, currentWindow: true }))[0] || null;

  const getScopeKeysFromUrl = (url) => {
    try {
      const u = new URL(url);
      return { host: u.hostname.toLowerCase(), domainPath: `${u.hostname.toLowerCase()}${u.pathname}` };
    } catch (_error) {
      return { host: "", domainPath: "" };
    }
  };

  const getFilteredRules = () => {
    const searchText = searchBox.value.toLowerCase();
    const selProfile = filterProfile.value;
    return allRules.filter((r) => {
      const haystack = `${r.site || ""}${r.value || ""}${r.selector || ""}${r.name || ""}`.toLowerCase();
      return haystack.includes(searchText) && (selProfile === "all" || r.profileId === selProfile);
    });
  };

  const renderSettings = () => {
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
  };

  const updateDropdowns = () => {
    const currentVal = filterProfile.value || "all";
    const opts = profiles.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
    filterProfile.innerHTML = `<option value="all">All Profiles</option>${opts}`;
    filterProfile.value = currentVal;
    editProfile.innerHTML = opts;
    pmProfileSelect.innerHTML = opts;
    pmProfileSelect.value = profiles.some((p) => p.id === activeProfile) ? activeProfile : profiles[0]?.id || "default";
  };

  const renderTable = () => {
    const filtered = getFilteredRules().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (!filtered.length) {
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#94a3b8;">No rules found.</td></tr>';
      return;
    }
    tableBody.innerHTML = filtered
      .map(
        (rule) => `
        <tr>
          <td><span class="badge">${profiles.find((p) => p.id === rule.profileId)?.name || rule.profileId}</span></td>
          <td title="${rule.site}" style="font-size:12px; color:#475569;">${rule.site || ""}</td>
          <td style="font-size:11px; color:#64748b;">${rule.strategy || "auto"}</td>
          <td><b>${String(rule.value || "").slice(0, 20)}</b></td>
          <td style="text-align:right">
            <button class="btn btn-outline btn-test" data-id="${rule.id}" style="padding:4px 8px">Test</button>
            <button class="btn btn-outline btn-edit" data-id="${rule.id}" style="padding:4px 8px">Edit</button>
            <button class="btn btn-danger btn-delete" data-id="${rule.id}" style="padding:4px 8px">Delete</button>
          </td>
        </tr>`
      )
      .join("");
  };

  const renderSiteDefaultStatus = async () => {
    const tab = await getActiveTab();
    const keys = getScopeKeysFromUrl(tab && tab.url ? tab.url : "");
    const pid = siteProfileDefaults[keys.domainPath] || siteProfileDefaults[keys.host];
    if (!pid) {
      pmSiteStatus.textContent = "No site default profile set for this page.";
      return;
    }
    const p = profiles.find((x) => x.id === pid);
    pmSiteStatus.textContent = `Site default profile for this page: ${p ? p.name : pid}`;
  };

  const saveState = async () => {
    await setStorage({
      rules: allRules,
      profiles,
      activeProfile,
      siteProfileDefaults,
      autofillSettings,
      schemaVersion: SCHEMA_VERSION
    });
    updateDropdowns();
    renderTable();
    renderSiteDefaultStatus();
  };

  const sendToActiveTab = async (payload) => {
    const tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error("No active tab");
    return ext.tabs.sendMessage(tab.id, payload);
  };

  const saveSettings = async () => {
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
    await saveState();
  };

  const loadData = async () => {
    const data = await getStorage([
      "rules",
      "profiles",
      "autofillSettings",
      "siteProfileDefaults",
      "activeProfile"
    ]);
    allRules = data.rules || [];
    profiles = data.profiles || [{ id: "default", name: "Default" }];
    autofillSettings = mergeSettings(data.autofillSettings);
    siteProfileDefaults = data.siteProfileDefaults || {};
    activeProfile = data.activeProfile || "all";
    updateDropdowns();
    renderSettings();
    renderTable();
    renderSiteDefaultStatus();
  };

  tableBody.addEventListener("click", async (e) => {
    const target = e.target.closest("button");
    if (!target) return;
    const id = target.getAttribute("data-id");
    if (target.classList.contains("btn-edit")) {
      const r = allRules.find((x) => x.id === id);
      if (!r) return;
      editId.value = r.id;
      editProfile.value = r.profileId || "default";
      editSite.value = r.site || "";
      editStrategy.value = r.strategy || "auto";
      editName.value = r.name || "";
      editElementId.value = r.elementId || "";
      editSelector.value = r.selector || "";
      editAction.value = r.action || "text";
      editValue.value = r.value || "";
      modal.classList.add("active");
    }
    if (target.classList.contains("btn-delete")) {
      if (!confirm("Delete this rule?")) return;
      allRules = allRules.filter((r) => r.id !== id);
      await saveState();
    }
    if (target.classList.contains("btn-test")) {
      const rule = allRules.find((r) => r.id === id);
      if (!rule) return;
      try {
        const result = await sendToActiveTab({ action: "testRule", rule, dryRun: false });
        alert(`Run Complete\nFilled: ${result?.runLog?.filled || 0}\nFailed: ${result?.runLog?.failed || 0}`);
      } catch (error) {
        alert(`Test failed: ${error.message || error}`);
      }
    }
  });

  document.getElementById("cancelModal").addEventListener("click", () => modal.classList.remove("active"));
  document.getElementById("saveModal").addEventListener("click", async () => {
    const id = editId.value;
    const rule = {
      id: id || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      profileId: editProfile.value,
      site: editSite.value.trim(),
      strategy: editStrategy.value,
      siteScopeMode: scopeModeSelect.value || "domainPath",
      framePath: "any",
      name: editName.value.trim(),
      elementId: editElementId.value.trim(),
      selector: editSelector.value.trim(),
      action: editAction.value,
      value: editValue.value,
      timestamp: Date.now(),
      schemaVersion: SCHEMA_VERSION
    };
    if (!rule.site) return alert("Site is required");
    if (id) allRules = allRules.map((r) => (r.id === id ? rule : r));
    else allRules.push(rule);
    await saveState();
    modal.classList.remove("active");
  });

  document.getElementById("addRuleBtn").addEventListener("click", () => {
    editId.value = "";
    editProfile.value = filterProfile.value === "all" ? "default" : filterProfile.value;
    editSite.value = "";
    editStrategy.value = "auto";
    editName.value = "";
    editElementId.value = "";
    editSelector.value = "";
    editAction.value = "text";
    editValue.value = "";
    modal.classList.add("active");
  });

  document.getElementById("clearAllBtn").addEventListener("click", async () => {
    if (!confirm("Delete ALL rules?")) return;
    allRules = [];
    await saveState();
  });

  document.getElementById("dedupeBtn").addEventListener("click", async () => {
    const seen = new Set();
    allRules = allRules.filter((r) => {
      const key = `${r.profileId}|${r.site}|${r.selector}|${r.name}|${r.action}|${r.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    await saveState();
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    const payload = { schemaVersion: SCHEMA_VERSION, autofillSettings, rules: allRules, profiles };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "autofill_backup.json";
    a.click();
  });

  document.getElementById("debugExportBtn").addEventListener("click", async () => {
    const dump = await getStorage(null);
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "autofill_debug_export.json";
    a.click();
  });

  document.getElementById("importBtn").addEventListener("click", () => document.getElementById("fileInput").click());
  document.getElementById("fileInput").addEventListener("change", (e) => {
    const fr = new FileReader();
    fr.onload = async (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);
        const rules = Array.isArray(raw) ? raw : raw.rules || [];
        allRules = rules;
        profiles = raw.profiles || profiles;
        autofillSettings = mergeSettings(raw.autofillSettings || autofillSettings);
        await saveState();
      } catch (error) {
        alert(`Invalid file: ${error.message || error}`);
      }
    };
    fr.readAsText(e.target.files[0]);
  });

  previewBtn.addEventListener("click", async () => {
    try {
      const result = await sendToActiveTab({ action: "previewRun" });
      alert(`Preview Complete\nMatched: ${result?.runLog?.matched || 0}\nFailed: ${result?.runLog?.failed || 0}`);
    } catch (error) {
      alert(`Preview failed: ${error.message || error}`);
    }
  });

  fillNowBtn.addEventListener("click", async () => {
    try {
      await sendToActiveTab({ action: "forceRun" });
      alert("Fill triggered on current tab.");
    } catch (error) {
      alert(`Fill failed: ${error.message || error}`);
    }
  });

  pmProfileSelect.addEventListener("change", async () => {
    activeProfile = pmProfileSelect.value;
    await saveState();
  });

  pmAddBtn.addEventListener("click", async () => {
    const name = prompt("Enter new profile name:");
    if (!name) return;
    const id = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_") || `profile_${Date.now()}`;
    profiles.push({ id, name: name.trim() });
    activeProfile = id;
    await saveState();
  });

  pmRenameBtn.addEventListener("click", async () => {
    const id = pmProfileSelect.value;
    if (!id || id === "default") return alert("Default profile cannot be renamed.");
    const current = profiles.find((p) => p.id === id);
    const name = prompt("Rename profile:", current?.name || "");
    if (!name) return;
    profiles = profiles.map((p) => (p.id === id ? { ...p, name: name.trim() } : p));
    await saveState();
  });

  pmDuplicateBtn.addEventListener("click", async () => {
    const id = pmProfileSelect.value;
    const src = profiles.find((p) => p.id === id);
    if (!src) return;
    const newId = `${id}_${Date.now()}`;
    profiles.push({ id: newId, name: `${src.name} Copy` });
    const copiedRules = allRules
      .filter((r) => r.profileId === id)
      .map((r) => ({ ...r, id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, profileId: newId }));
    allRules = allRules.concat(copiedRules);
    activeProfile = newId;
    await saveState();
  });

  pmDeleteBtn.addEventListener("click", async () => {
    const id = pmProfileSelect.value;
    if (!id || id === "default") return alert("Default profile cannot be deleted.");
    if (!confirm("Delete this profile and all associated rules?")) return;
    profiles = profiles.filter((p) => p.id !== id);
    allRules = allRules.filter((r) => r.profileId !== id);
    await saveState();
  });

  pmSetSiteDefaultBtn.addEventListener("click", async () => {
    const selected = pmProfileSelect.value;
    const tab = await getActiveTab();
    const keys = getScopeKeysFromUrl(tab && tab.url ? tab.url : "");
    if (!keys.domainPath) return alert("Open a normal website tab first.");
    siteProfileDefaults[keys.domainPath] = selected;
    await saveState();
  });

  pmClearSiteDefaultBtn.addEventListener("click", async () => {
    const tab = await getActiveTab();
    const keys = getScopeKeysFromUrl(tab && tab.url ? tab.url : "");
    delete siteProfileDefaults[keys.domainPath];
    delete siteProfileDefaults[keys.host];
    await saveState();
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

  searchBox.addEventListener("input", renderTable);
  filterProfile.addEventListener("change", renderTable);
  loadData();
});
