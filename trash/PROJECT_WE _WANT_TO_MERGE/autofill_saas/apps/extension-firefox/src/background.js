const API_BASE_URL = "http://localhost:4000";
const ext = typeof browser !== "undefined" ? browser : chrome;

const state = {
  mode: "assisted",
  autofillEnabled: true,
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

const sendToFrame = async (tabId, frameId, message) => {
  try {
    const response = await ext.tabs.sendMessage(tabId, message, { frameId });
    return response || { ok: false, error: "No response", frameId };
  } catch (error) {
    return { ok: false, error: String(error), frameId };
  }
};

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

ext.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "FRAME_READY") {
    if (sender.tab?.id !== undefined && sender.frameId !== undefined) {
      getTabFrameSet(sender.tab.id).add(sender.frameId);
    }
    return Promise.resolve({ ok: true });
  }
  if (message.type === "GET_STATE") {
    return Promise.resolve(state);
  }
  if (message.type === "SET_MODE") {
    state.mode = message.mode;
    return Promise.resolve({ ok: true });
  }
  if (message.type === "SET_PROFILE_DATA") {
    state.profileData = {
      ...state.profileData,
      ...(message.profileData || {})
    };
    return Promise.resolve({ ok: true });
  }
  if (message.type === "RUN_AUTOFILL") {
    return ext.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) {
        return { ok: false, error: "No active tab" };
      }
      const payload = {
        profileData: {
          ...state.profileData,
          ...(message.profileData || {})
        }
      };
      return runAutofillInTab(activeTab.id, payload);
    });
  }
  if (message.type === "RUN_WORKFLOW") {
    return fetch(`${API_BASE_URL}/execution/runs`, {
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
      .then((data) => ({ ok: true, data }))
      .catch((error) => ({ ok: false, error: String(error) }));
  }
  return Promise.resolve({ ok: false, error: "Unknown message type" });
});

ext.tabs.onRemoved.addListener((tabId) => {
  frameRegistry.delete(tabId);
});
