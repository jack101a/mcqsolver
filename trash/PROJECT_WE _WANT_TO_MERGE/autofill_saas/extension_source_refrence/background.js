const SCHEMA_VERSION = 2;
const MENU_FILL = "af_fill_current";
const MENU_RECORD_START = "af_record_start";
const MENU_RECORD_STOP = "af_record_stop";
const MENU_OPTIONS = "af_open_options";
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

function migrateRule(rule) {
  const migrated = { ...rule };
  if (!migrated.id) migrated.id = String(Date.now() + Math.random());
  if (!migrated.profileId) migrated.profileId = "default";
  if (!migrated.strategy) migrated.strategy = "auto";
  if (!migrated.siteScopeMode) migrated.siteScopeMode = "domainPath";
  if (!migrated.framePath) migrated.framePath = "any";
  if (!migrated.schemaVersion) migrated.schemaVersion = SCHEMA_VERSION;
  if (!migrated.timestamp) migrated.timestamp = Date.now();
  if (migrated.value === undefined || migrated.value === null) migrated.value = "";
  if (!migrated.action) migrated.action = "text";
  if (!migrated.site) migrated.site = "";
  if (!migrated.name) migrated.name = "";
  if (!migrated.elementId) migrated.elementId = "";
  if (!migrated.selector) migrated.selector = "";
  return migrated;
}

function migrateStorage() {
  chrome.storage.local.get(
    ["schemaVersion", "rules", "profiles", "autofillSettings", "siteProfileDefaults"],
    (data) => {
      const updates = {};
      const hasOldSchema = !data.schemaVersion || data.schemaVersion < SCHEMA_VERSION;

      const profiles = Array.isArray(data.profiles) && data.profiles.length
        ? data.profiles
        : [{ id: "default", name: "Default" }];
      if (!Array.isArray(data.profiles) || !data.profiles.length) {
        updates.profiles = profiles;
      }
      if (!data.siteProfileDefaults || typeof data.siteProfileDefaults !== "object") {
        updates.siteProfileDefaults = {};
      }

      const rules = Array.isArray(data.rules) ? data.rules : [];
      if (hasOldSchema || !Array.isArray(data.rules)) {
        updates.rules = rules.map(migrateRule);
      }

      updates.autofillSettings = mergeSettings(data.autofillSettings);
      updates.schemaVersion = SCHEMA_VERSION;

      chrome.storage.local.set(updates);
    }
  );
}

function sendToActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.id || !tab.url || tab.url.startsWith("chrome://")) return;
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  });
}

function setRecordingState(state) {
  chrome.storage.local.set({ isRecording: !!state }, () => {
    sendToActiveTab({ action: "toggleRecord", state: !!state });
  });
}

function buildContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_FILL,
      title: "Autofill: Fill Current Page",
      contexts: ["all"]
    });
    chrome.contextMenus.create({
      id: MENU_RECORD_START,
      title: "Autofill: Start Recording",
      contexts: ["all"]
    });
    chrome.contextMenus.create({
      id: MENU_RECORD_STOP,
      title: "Autofill: Stop Recording",
      contexts: ["all"]
    });
    chrome.contextMenus.create({
      id: MENU_OPTIONS,
      title: "Autofill: Open Dashboard",
      contexts: ["all"]
    });
  });
}

function handleMenuClick(info) {
  if (info.menuItemId === MENU_FILL) {
    sendToActiveTab({ action: "forceRun" });
    return;
  }
  if (info.menuItemId === MENU_RECORD_START) {
    setRecordingState(true);
    return;
  }
  if (info.menuItemId === MENU_RECORD_STOP) {
    setRecordingState(false);
    return;
  }
  if (info.menuItemId === MENU_OPTIONS) {
    chrome.runtime.openOptionsPage();
  }
}

function setRunBadge(tabId, data) {
  if (!tabId) return;
  const filled = Number(data.filled || 0);
  const matched = Number(data.matched || 0);
  const skipped = Number(data.skipped || 0);
  const preview = Number(data.preview || 0);
  const failed = Number(data.failed || 0);
  const durationMs = Number(data.durationMs || 0);
  const trigger = String(data.trigger || "manual");
  const text = filled > 0 ? String(filled) : matched > 0 ? String(matched) : "";
  chrome.action.setBadgeText({ tabId, text });
  if (text) {
    const color = failed > 0 ? "#b91c1c" : "#2563eb";
    chrome.action.setBadgeBackgroundColor({ tabId, color });
  }
  const title =
    `Autofill Recorder\n` +
    `Trigger: ${trigger}\n` +
    `Matched: ${matched}  Filled: ${filled}\n` +
    `Skipped: ${skipped}  Preview: ${preview}  Failed: ${failed}\n` +
    `Duration: ${durationMs} ms`;
  chrome.action.setTitle({ tabId, title });
}

chrome.runtime.onInstalled.addListener(() => {
  migrateStorage();
  buildContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  migrateStorage();
  buildContextMenus();
});

chrome.contextMenus.onClicked.addListener(handleMenuClick);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === "runStats") {
    const tabId = sender && sender.tab ? sender.tab.id : null;
    setRunBadge(tabId, msg);
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-autofill") {
    sendToActiveTab({ action: "forceRun" });
  }
});
