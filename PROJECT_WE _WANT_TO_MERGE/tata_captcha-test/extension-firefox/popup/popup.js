const extApi = typeof browser !== "undefined" ? browser : chrome;

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

document.addEventListener("DOMContentLoaded", () => {
  const rootEl = document.documentElement;
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const masterToggle = document.getElementById("masterToggle");
  const imageToggle = document.getElementById("imageToggle");
  const audioToggle = document.getElementById("audioToggle");
  const textToggle = document.getElementById("textToggle");
  const taskTypeEl = document.getElementById("taskType");
  const locImg = document.getElementById("locImg");
  const locInput = document.getElementById("locInput");
  const locImgBtn = document.getElementById("locImgBtn");
  const locInputBtn = document.getElementById("locInputBtn");
  const saveLocBtn = document.getElementById("saveLocBtn");
  const syncBtn = document.getElementById("syncBtn");
  const optionsBtn = document.getElementById("optionsBtn");
  const connDot = document.getElementById("connDot");
  const connText = document.getElementById("connText");
  const statusMsg = document.getElementById("statusMsg");
  const iconTheme = document.getElementById("themeIcon");

  let currentDomain = "";

  function applyTheme(isDark) {
    rootEl.setAttribute("data-theme", isDark ? "dark" : "light");
    if (themeToggleBtn) {
      const icon = document.getElementById("themeIcon");
      if (icon) icon.textContent = isDark ? "\u2600" : "\u263E";
    }
    if (iconTheme) {
      iconTheme.textContent = isDark ? "\u2600" : "\u263E";
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

  sendMessage({ type: "SYNC_LOCATORS" });
  sendMessage({ type: "SYNC_FIELD_MAPPINGS" });

  extApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.url) {
      try { currentDomain = normalizeDomain(new URL(tabs[0].url).hostname); } catch (_e) {}
    }
  });

  extApi.storage.local.get(["masterEnabled", "imageTaskEnabled", "audioTaskEnabled", "textTaskEnabled", "textCaptchaEnabled"], (res) => {
    if (res.masterEnabled !== undefined) masterToggle.checked = res.masterEnabled;
    if (imageToggle) {
      imageToggle.checked = res.imageTaskEnabled !== undefined
        ? res.imageTaskEnabled
        : (res.textCaptchaEnabled !== undefined ? res.textCaptchaEnabled : true);
    }
    if (audioToggle) {
      audioToggle.checked = res.audioTaskEnabled !== undefined ? res.audioTaskEnabled : true;
    }
    if (textToggle) {
      textToggle.checked = res.textTaskEnabled !== undefined ? res.textTaskEnabled : true;
    }
  });

  function runPing() {
    connDot.className = "dot";
    connText.textContent = "Checking...";
    connText.style.color = "#9ca3af";
    extApi.runtime.sendMessage({ type: "PING_SERVER" }, (resp) => {
      if (!resp || !resp.ok) {
        connDot.className = "dot";
        connText.textContent = "Error";
        connText.style.color = "#ef4444";
        return;
      }
      const { connected, message } = resp.result || resp;
      connDot.className = `dot${connected ? " on" : ""}`;
      connText.textContent = message || (connected ? "Connected" : "Disconnected");
      connText.style.color = connected ? "#10b981" : "#ef4444";
    });
  }
  runPing();

  masterToggle.addEventListener("change", () => extApi.storage.local.set({ masterEnabled: masterToggle.checked }));
  if (imageToggle) imageToggle.addEventListener("change", () => extApi.storage.local.set({ imageTaskEnabled: imageToggle.checked }));
  if (audioToggle) audioToggle.addEventListener("change", () => extApi.storage.local.set({ audioTaskEnabled: audioToggle.checked }));
  if (textToggle) textToggle.addEventListener("change", () => extApi.storage.local.set({ textTaskEnabled: textToggle.checked }));

  function startLocate(targetField) {
    statusMsg.textContent = "Picker started on website tab...";
    statusMsg.style.color = "#facc15";
    extApi.storage.local.set({ _popupPendingField: targetField });
    sendMessage({ type: "START_LOCATE", targetField }).catch((err) => {
      statusMsg.textContent = err.message || String(err);
      statusMsg.style.color = "#ef4444";
    });
    window.close();
  }

  locImgBtn.addEventListener("click", () => startLocate("source"));
  locInputBtn.addEventListener("click", () => startLocate("target"));

  extApi.storage.local.get(["_locatedSource", "_locatedTarget"], (res) => {
    if (res._locatedSource) locImg.value = res._locatedSource;
    if (res._locatedTarget) locInput.value = res._locatedTarget;
  });

  saveLocBtn.addEventListener("click", () => {
    if (!currentDomain) {
      statusMsg.textContent = "Cannot detect current site.";
      statusMsg.style.color = "#ef4444";
      return;
    }
    const taskType = taskTypeEl.value;
    const sourceSelector = locImg.value.trim();
    const targetSelector = locInput.value.trim();
    if (!sourceSelector || !targetSelector) {
      statusMsg.textContent = "Enter source and target selectors.";
      statusMsg.style.color = "#ef4444";
      return;
    }
    extApi.storage.local.get(["domainFieldRoutes"], async (res) => {
      try {
        const result = unwrapResponse(await sendMessage({ type: "VALIDATE_SELECTORS", sourceSelector, targetSelector }));
        if (!result?.ok) {
          statusMsg.textContent = `Invalid selectors: ${result?.error || "Unknown error"}`;
          statusMsg.style.color = "#ef4444";
          return;
        }
        if (!result.srcCount || !result.tgtCount) {
          statusMsg.textContent = `Selector not found (src:${result.srcCount}, tgt:${result.tgtCount}).`;
          statusMsg.style.color = "#ef4444";
          return;
        }
      } catch (err) {
        statusMsg.textContent = `Validation failed: ${err.message || err}`;
        statusMsg.style.color = "#ef4444";
        return;
      }

      const fieldName = makeFieldName(taskType, sourceSelector, targetSelector);
      const routes = Array.isArray(res.domainFieldRoutes) ? res.domainFieldRoutes : [];
      const globalRoutes = await new Promise((resolve) => {
        extApi.storage.local.get(["globalFieldRoutes"], (x) => resolve(x.globalFieldRoutes || {}));
      });
      const serverEntries = Array.isArray(globalRoutes?.[currentDomain]) ? globalRoutes[currentDomain] : [];
      const existsOnServer = serverEntries.some((entry) => (
        String(entry.task_type || entry.source_data_type || "image") === taskType
        && String(entry.source_selector || "") === sourceSelector
        && String(entry.target_selector || "") === targetSelector
      ));
      if (existsOnServer) {
        statusMsg.textContent = "This route already exists on server. Local duplicate not saved.";
        statusMsg.style.color = "#10b981";
        return;
      }
      const next = routes.filter((r) => !(
        r.domain === currentDomain && r.taskType === taskType && r.sourceSelector === sourceSelector && r.targetSelector === targetSelector
      ));
      next.push({
        domain: currentDomain,
        taskType,
        sourceSelector,
        targetSelector,
        fieldName,
        sourceFieldType: taskType,
        targetFieldType: "text_input",
      });
      extApi.storage.local.set({ domainFieldRoutes: next }, () => {});
      try {
        unwrapResponse(await sendMessage({
          type: "PROPOSE_FIELD_MAPPING",
          payload: {
            domain: currentDomain,
            task_type: taskType,
            source_data_type: taskType,
            source_selector: sourceSelector,
            target_data_type: "text_input",
            target_selector: targetSelector,
            proposed_field_name: fieldName,
          },
        }));
        statusMsg.textContent = `Route sent for ${currentDomain}`;
        statusMsg.style.color = "#10b981";
        locImg.value = "";
        locInput.value = "";
        extApi.storage.local.remove(["_locatedSource", "_locatedTarget", "_popupPendingField"]);
      } catch (err) {
        statusMsg.textContent = `Saved locally. Server sync failed.`;
        statusMsg.style.color = "#f59e0b";
      }
    });
  });

  syncBtn.addEventListener("click", async () => {
    statusMsg.textContent = "Syncing...";
    statusMsg.style.color = "#facc15";
    try {
      const locatorInfo = unwrapResponse(await sendMessage({ type: "SYNC_LOCATORS" })) || {};
      const info = unwrapResponse(await sendMessage({ type: "SYNC_PENDING_ROUTES" })) || {};
      const routeInfo = unwrapResponse(await sendMessage({ type: "SYNC_FIELD_MAPPINGS" })) || {};
      statusMsg.textContent = `Synced (${routeInfo.count ?? 0} domains, ${locatorInfo.count ?? 0} locators, ${info.proposed ?? 0} proposed, ${info.skipped ?? 0} skipped).`;
      statusMsg.style.color = "#10b981";
    } catch (err) {
      statusMsg.textContent = `Sync failed: ${err.message || err}`;
      statusMsg.style.color = "#ef4444";
    }
  });

  optionsBtn.addEventListener("click", () => extApi.runtime.openOptionsPage());
});

