document.addEventListener("DOMContentLoaded", () => {
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
    fakeData: {
      enabled: false,
      locale: "en-US",
      fillEmptyOnly: true
    }
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

  const getActiveTab = () =>
    new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0] || null);
      });
    });

  const getScopeKeysFromUrl = (url) => {
    try {
      const u = new URL(url);
      return { host: u.hostname.toLowerCase(), domainPath: `${u.hostname.toLowerCase()}${u.pathname}` };
    } catch (_error) {
      return { host: "", domainPath: "" };
    }
  };

  const saveSettings = () => {
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
  };

  const getProfileName = (id) => {
    const p = profiles.find((x) => x.id === id);
    return p ? p.name : id;
  };

  const truncate = (str, n) => {
    if (!str) return "";
    return str.length > n ? `${str.slice(0, n)}...` : str;
  };

  const maskSensitive = (value) => {
    const str = String(value || "");
    if (!str) return "";
    if (str.length <= 4) return "*".repeat(str.length);
    return `${str.slice(0, 2)}${"*".repeat(Math.min(8, str.length - 4))}${str.slice(-2)}`;
  };

  const formatValue = (rule) => {
    if (rule.action === "click") return '<span style="color:#2563eb">Click</span>';
    if (rule.action === "checkbox") return rule.value ? "Checked" : "Unchecked";
    const raw = String(rule.value || "");
    const display = autofillSettings.maskSensitiveValues ? maskSensitive(raw) : raw;
    return truncate(display, 20);
  };

  const updateDropdowns = () => {
    const currentVal = filterProfile.value || "all";
    const opts = profiles.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
    filterProfile.innerHTML = `<option value="all">All Profiles</option>${opts}`;
    filterProfile.value = currentVal;
    editProfile.innerHTML = opts;
  };

  const getFilteredRules = () => {
    const searchText = searchBox.value.toLowerCase();
    const selProfile = filterProfile.value;
    return allRules.filter((r) => {
      const haystack = `${r.site || ""}${r.value || ""}${r.selector || ""}${r.name || ""}`.toLowerCase();
      return haystack.includes(searchText) && (selProfile === "all" || r.profileId === selProfile);
    });
  };

  const renderTable = () => {
    const filtered = getFilteredRules();
    filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (!filtered.length) {
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#94a3b8;">No rules found.</td></tr>';
      return;
    }
    tableBody.innerHTML = filtered
      .map(
        (rule) => `
        <tr>
          <td><span class="badge">${getProfileName(rule.profileId)}</span></td>
          <td title="${rule.site}" style="font-size:12px; color:#475569;">${truncate(rule.site, 40)}</td>
          <td style="font-size:11px; color:#64748b;">${rule.strategy || "auto"}</td>
          <td><b>${formatValue(rule)}</b></td>
          <td style="text-align:right">
            <button class="btn btn-outline btn-test" data-id="${rule.id}" style="padding:4px 8px">Test</button>
            <button class="btn btn-outline btn-edit" data-id="${rule.id}" style="padding:4px 8px">Edit</button>
            <button class="btn btn-danger btn-delete" data-id="${rule.id}" style="padding:4px 8px">Delete</button>
          </td>
        </tr>`
      )
      .join("");
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

  const renderProfileManager = () => {
    const opts = profiles.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
    pmProfileSelect.innerHTML = opts;
    if (profiles.some((p) => p.id === activeProfile)) pmProfileSelect.value = activeProfile;
    else pmProfileSelect.value = profiles[0] ? profiles[0].id : "default";
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

  const saveProfileState = (nextProfiles, nextRules, nextDefaults, nextActiveProfile) => {
    profiles = nextProfiles;
    allRules = nextRules;
    siteProfileDefaults = nextDefaults;
    activeProfile = nextActiveProfile || activeProfile;
    chrome.storage.local.set({ profiles, rules: allRules, siteProfileDefaults, activeProfile }, () => {
      updateDropdowns();
      renderProfileManager();
      renderSiteDefaultStatus();
      renderTable();
    });
  };

  const sendToActiveTab = (payload) =>
    new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || !tab.id) {
          reject(new Error("No active tab"));
          return;
        }
        chrome.tabs.sendMessage(tab.id, payload, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      });
    });

  const summarizeRun = (runLog) => {
    if (!runLog) return "No run details available.";
    return (
      `${runLog.dryRun ? "Preview" : "Run"} Complete\n` +
      `Trigger: ${runLog.trigger || "manual"}\n` +
      `Duration: ${runLog.durationMs || 0} ms\n\n` +
      `Matched: ${runLog.matched}\n` +
      `Filled: ${runLog.filled}\n` +
      `Skipped: ${runLog.skipped}\n` +
      `Failed: ${runLog.failed}`
    );
  };

  const openModal = (id = null) => {
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
  };

  const loadData = () => {
    chrome.storage.local.get(
      ["rules", "profiles", "autofillSettings", "siteProfileDefaults", "activeProfile"],
      (data) => {
        allRules = data.rules || [];
        profiles = data.profiles || [{ id: "default", name: "Default" }];
        autofillSettings = mergeSettings(data.autofillSettings);
        siteProfileDefaults = data.siteProfileDefaults || {};
        activeProfile = data.activeProfile || "all";
        updateDropdowns();
        renderSettings();
        renderProfileManager();
        renderSiteDefaultStatus();
        renderTable();
      }
    );
  };

  tableBody.addEventListener("click", async (e) => {
    const target = e.target.closest("button");
    if (!target) return;
    const id = target.getAttribute("data-id");
    if (target.classList.contains("btn-test")) {
      const rule = allRules.find((r) => r.id === id);
      if (!rule) return;
      try {
        const result = await sendToActiveTab({ action: "testRule", rule, dryRun: false });
        alert(summarizeRun(result && result.runLog ? result.runLog : null));
      } catch (error) {
        alert(`Test failed: ${error.message || error}`);
      }
    }
    if (target.classList.contains("btn-edit")) openModal(id);
    if (target.classList.contains("btn-delete")) {
      if (!confirm("Delete this rule?")) return;
      allRules = allRules.filter((r) => r.id !== id);
      chrome.storage.local.set({ rules: allRules }, renderTable);
    }
  });

  document.getElementById("cancelModal").addEventListener("click", () => {
    modal.classList.remove("active");
  });

  document.getElementById("saveModal").addEventListener("click", () => {
    const id = editId.value;
    const existingRule = id ? allRules.find((r) => r.id === id) : null;
    const newRule = {
      id: id || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
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
      timestamp: Date.now(),
      schemaVersion: SCHEMA_VERSION
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
    const payload = { schemaVersion: SCHEMA_VERSION, autofillSettings, rules: allRules, profiles };
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
        schemaVersion: SCHEMA_VERSION,
        currentSettings: autofillSettings,
        lastRunLog: storageDump.lastRunLog || null,
        storage: storageDump
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
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
        const rules = Array.isArray(raw) ? raw : raw.rules || [];
        const imported = rules
          .filter((r) => r && typeof r === "object")
          .map((r) => ({
            id: r.id || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
            profileId: r.profileId || "default",
            site: String(r.site || "").trim(),
            strategy: r.strategy || "auto",
            siteScopeMode: r.siteScopeMode || "domainPath",
            framePath: r.framePath || "any",
            name: String(r.name || "").trim(),
            elementId: String(r.elementId || "").trim(),
            selector: String(r.selector || "").trim(),
            action: r.action || "text",
            value: r.value === undefined || r.value === null ? "" : r.value,
            timestamp: r.timestamp || Date.now(),
            schemaVersion: SCHEMA_VERSION
          }))
          .filter((r) => r.site);
        if (!imported.length) {
          alert("No valid rules found in import file.");
          return;
        }
        chrome.storage.local.set(
          {
            rules: imported,
            profiles: raw.profiles || profiles,
            autofillSettings: mergeSettings(raw.autofillSettings || autofillSettings),
            schemaVersion: SCHEMA_VERSION
          },
          () => location.reload()
        );
      } catch (error) {
        alert(`Invalid file: ${error.message || error}`);
      }
    };
    fr.readAsText(e.target.files[0]);
  });

  previewBtn.addEventListener("click", async () => {
    try {
      const result = await sendToActiveTab({ action: "previewRun" });
      alert(summarizeRun(result && result.runLog ? result.runLog : null));
    } catch (error) {
      alert(`Preview failed: ${error.message || error}`);
    }
  });

  fillNowBtn.addEventListener("click", async () => {
    try {
      await sendToActiveTab({ action: "forceRun" });
      alert("Fill triggered on current tab.");
    } catch (error) {
      alert(`Fill trigger failed: ${error.message || error}`);
    }
  });

  pmProfileSelect.addEventListener("change", () => {
    const chosen = pmProfileSelect.value;
    activeProfile = chosen;
    chrome.storage.local.set({ activeProfile: chosen });
  });

  pmAddBtn.addEventListener("click", () => {
    const name = prompt("Enter new profile name:");
    if (!name) return;
    let id = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "profile";
    let seq = 2;
    while (profiles.some((p) => p.id === id)) id = `${id}_${seq++}`;
    saveProfileState(profiles.concat([{ id, name: name.trim() }]), allRules, siteProfileDefaults, id);
  });

  pmRenameBtn.addEventListener("click", () => {
    const id = pmProfileSelect.value;
    if (!id || id === "default") return alert("Default profile cannot be renamed.");
    const current = profiles.find((p) => p.id === id);
    if (!current) return;
    const name = prompt("Rename profile:", current.name);
    if (!name) return;
    const nextProfiles = profiles.map((p) => (p.id === id ? { ...p, name: name.trim() } : p));
    saveProfileState(nextProfiles, allRules, siteProfileDefaults, id);
  });

  pmDuplicateBtn.addEventListener("click", () => {
    const id = pmProfileSelect.value;
    const source = profiles.find((p) => p.id === id);
    if (!source) return;
    const name = prompt("New duplicate profile name:", `${source.name} Copy`);
    if (!name) return;
    let newId = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "profile";
    let seq = 2;
    while (profiles.some((p) => p.id === newId)) newId = `${newId}_${seq++}`;
    const copiedRules = allRules
      .filter((r) => r.profileId === id)
      .map((r) => ({ ...r, id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, profileId: newId, timestamp: Date.now() }));
    saveProfileState(
      profiles.concat([{ id: newId, name: name.trim() }]),
      allRules.concat(copiedRules),
      siteProfileDefaults,
      newId
    );
  });

  pmDeleteBtn.addEventListener("click", () => {
    const id = pmProfileSelect.value;
    if (!id || id === "default") return alert("Default profile cannot be deleted.");
    if (!confirm("Delete this profile and all associated rules?")) return;
    const nextProfiles = profiles.filter((p) => p.id !== id);
    const nextRules = allRules.filter((r) => r.profileId !== id);
    const nextDefaults = { ...siteProfileDefaults };
    Object.keys(nextDefaults).forEach((k) => {
      if (nextDefaults[k] === id) delete nextDefaults[k];
    });
    saveProfileState(nextProfiles, nextRules, nextDefaults, nextProfiles[0]?.id || "default");
  });

  pmSetSiteDefaultBtn.addEventListener("click", async () => {
    const selected = pmProfileSelect.value;
    if (!selected) return;
    const tab = await getActiveTab();
    const keys = getScopeKeysFromUrl(tab && tab.url ? tab.url : "");
    if (!keys.domainPath) return alert("Open a normal website tab first.");
    saveProfileState(profiles, allRules, { ...siteProfileDefaults, [keys.domainPath]: selected }, activeProfile);
  });

  pmClearSiteDefaultBtn.addEventListener("click", async () => {
    const tab = await getActiveTab();
    const keys = getScopeKeysFromUrl(tab && tab.url ? tab.url : "");
    const nextDefaults = { ...siteProfileDefaults };
    if (keys.domainPath) delete nextDefaults[keys.domainPath];
    if (keys.host) delete nextDefaults[keys.host];
    saveProfileState(profiles, allRules, nextDefaults, activeProfile);
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
