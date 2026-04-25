const API_BASE_URL = "http://localhost:4000";

const state = {
  mode: "assisted",
  autofillEnabled: true,
  recordEnabled: false,
  profileData: {
    full_name: "",
    email: "",
    phone: ""
  }
};

const frameRegistry = new Map();

const getTabFrameSet = (tabId) => {
  const existing = frameRegistry.get(tabId);
  if (existing) return existing;
  const created = new Set([0]);
  frameRegistry.set(tabId, created);
  return created;
};

const sendToFrame = (tabId, frameId, message) =>
  new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, { frameId }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message, frameId });
        return;
      }
      resolve(response || { ok: false, error: "No response", frameId });
    });
  });

const runAutofillInTab = async (tabId, payload) => {
  const frames = [...getTabFrameSet(tabId)];
  const fillResults = await Promise.all(
    frames.map((frameId) =>
      sendToFrame(tabId, frameId, {
        type: "FILL_FIELDS",
        payload
      }).then((response) => ({
        frameId,
        ...response
      }))
    )
  );

  const summaries = fillResults
    .filter((r) => r.ok && r.result)
    .map((r) => ({
      frameId: r.frameId,
      frameUrl: r.result.frameUrl,
      successCount: r.result.successCount,
      totalPlanned: r.result.totalPlanned
    }));
  const successCount = summaries.reduce((sum, s) => sum + s.successCount, 0);
  const totalPlanned = summaries.reduce((sum, s) => sum + s.totalPlanned, 0);
  return {
    ok: true,
    mode: state.mode,
    summary: {
      frameCount: frames.length,
      successCount,
      totalPlanned
    },
    frames: summaries,
    errors: fillResults.filter((r) => !r.ok)
  };
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FRAME_READY") {
    const tabId = _sender.tab?.id;
    const frameId = _sender.frameId;
    if (typeof tabId === "number" && typeof frameId === "number") {
      getTabFrameSet(tabId).add(frameId);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "GET_STATE") {
    sendResponse(state);
    return true;
  }

  if (message.type === "SET_MODE") {
    state.mode = message.mode;
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "SET_PROFILE_DATA") {
    state.profileData = {
      ...state.profileData,
      ...(message.profileData || {})
    };
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "RUN_AUTOFILL") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) {
        sendResponse({ ok: false, error: "No active tab" });
        return;
      }
      const payload = {
        profileData: {
          ...state.profileData,
          ...(message.profileData || {})
        }
      };
      const result = await runAutofillInTab(activeTab.id, payload);
      sendResponse(result);
    });
    return true;
  }

  if (message.type === "RUN_WORKFLOW") {
    fetch(`${API_BASE_URL}/execution/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${message.accessToken}`
      },
      body: JSON.stringify({
        workflowId: message.workflowId,
        inputProfileId: message.profileId,
        modeOverride: state.mode
      })
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  sendResponse({ ok: false, error: "Unknown message type" });
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  frameRegistry.delete(tabId);
});
