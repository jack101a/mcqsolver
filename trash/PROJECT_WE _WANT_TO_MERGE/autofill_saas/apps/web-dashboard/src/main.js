const storageKeys = {
  apiBaseUrl: "apiBaseUrl",
  accessToken: "accessToken"
};

const output = document.getElementById("output");
const apiBaseUrlInput = document.getElementById("apiBaseUrl");
const accessTokenInput = document.getElementById("accessTokenInput");
const sessionBanner = document.getElementById("sessionBanner");
const subscriptionBadge = document.getElementById("subscriptionBadge");
const profilesList = document.getElementById("profilesList");
const workflowsList = document.getElementById("workflowsList");
const runsList = document.getElementById("runsList");

const defaultSteps = [
  { id: "s1", type: "navigate", config: { url: "https://example.test/form" } },
  { id: "s2", type: "autofill", config: { requiredFields: ["full_name", "email"] } },
  { id: "s3", type: "confirm", config: {} },
  { id: "s4", type: "end", config: {} }
];

const defaultProfileFields = [
  { key: "full_name", value: "Sample User", sensitivity: "standard" },
  { key: "email", value: "sample.user@example.test", sensitivity: "standard" },
  { key: "phone", value: "5551001000", sensitivity: "standard" }
];

const defaultSyncPayload = {
  profiles: [{ id: "local_profile_web_1", name: "Local Dashboard Profile", updatedAt: new Date().toISOString() }],
  workflows: [{ id: "local_workflow_web_1", name: "Local Dashboard Workflow", updatedAt: new Date().toISOString() }],
  settings: { defaultMode: "assisted", theme: "light" }
};

const setOutput = (label, data) => {
  const payload = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  output.textContent = `[${new Date().toISOString()}] ${label}\n${payload}`;
};

const getApiBaseUrl = () =>
  (window.localStorage.getItem(storageKeys.apiBaseUrl) || "http://localhost:4000").replace(/\/+$/, "");

const getToken = () => window.localStorage.getItem(storageKeys.accessToken);

const parseJsonInput = (value, fallback, label) => {
  const source = value.trim();
  if (!source) return fallback;
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} JSON is invalid: ${String(error.message || error)}`);
  }
};

const request = async (path, options = {}) => {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (!options.skipAuth && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers
  });

  let payload;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }

  if (!response.ok) {
    const message = payload.message || payload.code || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
};

const setSessionBanner = () => {
  const token = getToken();
  if (!token) {
    sessionBanner.innerHTML = '<span class="pill danger">No active token</span>';
    return;
  }
  const shown = token.slice(0, 24);
  sessionBanner.innerHTML = `<span class="pill ok">Token loaded</span> <span class="mono">${shown}...</span>`;
};

const renderSubscription = (subscription) => {
  if (!subscription) {
    subscriptionBadge.innerHTML = '<span class="pill warn">No subscription loaded</span>';
    return;
  }
  const levelClass = subscription.plan === "enterprise" ? "ok" : subscription.plan === "pro" ? "warn" : "danger";
  const featureCount = Array.isArray(subscription.features) ? subscription.features.length : 0;
  subscriptionBadge.innerHTML =
    `<span class="pill ${levelClass}">Plan: ${subscription.plan}</span> ` +
    `<span class="pill warn">AI: ${subscription.aiQuotaRemaining}</span> ` +
    `<span class="pill warn">CAPTCHA: ${subscription.captchaQuotaRemaining}</span> ` +
    `<span class="pill ok">Features: ${featureCount}</span>`;
};

const renderCollection = (element, items, formatter) => {
  element.innerHTML = "";
  if (!Array.isArray(items) || !items.length) {
    element.innerHTML = "<li>No records found.</li>";
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.innerHTML = formatter(item);
    element.appendChild(li);
  }
};

const fillDefaults = () => {
  apiBaseUrlInput.value = getApiBaseUrl();
  accessTokenInput.value = getToken() || "";
  document.getElementById("workflowSteps").value = JSON.stringify(defaultSteps, null, 2);
  document.getElementById("profileFields").value = JSON.stringify(defaultProfileFields, null, 2);
  document.getElementById("syncPayload").value = JSON.stringify(defaultSyncPayload, null, 2);
  setSessionBanner();
};

document.getElementById("saveApiBaseUrl").addEventListener("click", () => {
  const url = apiBaseUrlInput.value.trim() || "http://localhost:4000";
  window.localStorage.setItem(storageKeys.apiBaseUrl, url.replace(/\/+$/, ""));
  setOutput("Environment", { apiBaseUrl: getApiBaseUrl() });
});

document.getElementById("saveAccessToken").addEventListener("click", () => {
  const token = accessTokenInput.value.trim();
  if (!token) {
    setOutput("Session", "Token input is empty.");
    return;
  }
  window.localStorage.setItem(storageKeys.accessToken, token);
  setSessionBanner();
  setOutput("Session", { tokenStored: true });
});

document.getElementById("loadSession").addEventListener("click", () => {
  accessTokenInput.value = getToken() || "";
  apiBaseUrlInput.value = getApiBaseUrl();
  setSessionBanner();
  setOutput("Session", { apiBaseUrl: getApiBaseUrl(), hasToken: Boolean(getToken()) });
});

document.getElementById("clearSession").addEventListener("click", () => {
  window.localStorage.removeItem(storageKeys.accessToken);
  accessTokenInput.value = "";
  setSessionBanner();
  setOutput("Session", { cleared: true });
});

document.getElementById("registerBtn").addEventListener("click", async () => {
  try {
    const payload = {
      email: document.getElementById("authEmail").value.trim(),
      password: document.getElementById("authPassword").value.trim(),
      fullName: document.getElementById("authFullName").value.trim() || "Dashboard User",
      deviceName: document.getElementById("authDeviceName").value.trim() || "web-dashboard"
    };
    const data = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
      skipAuth: true
    });
    window.localStorage.setItem(storageKeys.accessToken, data.tokens.accessToken);
    accessTokenInput.value = data.tokens.accessToken;
    setSessionBanner();
    renderSubscription(null);
    setOutput("Register success", data);
  } catch (error) {
    setOutput("Register failed", String(error.message || error));
  }
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  try {
    const payload = {
      email: document.getElementById("authEmail").value.trim(),
      password: document.getElementById("authPassword").value.trim(),
      deviceName: document.getElementById("authDeviceName").value.trim() || "web-dashboard"
    };
    const data = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
      skipAuth: true
    });
    window.localStorage.setItem(storageKeys.accessToken, data.tokens.accessToken);
    accessTokenInput.value = data.tokens.accessToken;
    setSessionBanner();
    renderSubscription(null);
    setOutput("Login success", data);
  } catch (error) {
    setOutput("Login failed", String(error.message || error));
  }
});

document.getElementById("loadSubscription").addEventListener("click", async () => {
  try {
    const data = await request("/subscription");
    renderSubscription(data);
    setOutput("Subscription", data);
  } catch (error) {
    renderSubscription(null);
    setOutput("Subscription failed", String(error.message || error));
  }
});

document.getElementById("upgradeSubscription").addEventListener("click", async () => {
  try {
    const plan = document.getElementById("upgradePlan").value;
    const data = await request(`/subscription/upgrade/${plan}`, { method: "POST", body: "{}" });
    renderSubscription(data);
    setOutput("Subscription upgraded", data);
  } catch (error) {
    setOutput("Upgrade failed", String(error.message || error));
  }
});

document.getElementById("createCheckout").addEventListener("click", async () => {
  try {
    const plan = document.getElementById("upgradePlan").value;
    const data = await request("/subscription/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan, billingCycle: "monthly" })
    });
    setOutput("Checkout created", data);
  } catch (error) {
    setOutput("Checkout failed", String(error.message || error));
  }
});

document.getElementById("createProfile").addEventListener("click", async () => {
  try {
    const fields = parseJsonInput(document.getElementById("profileFields").value, defaultProfileFields, "Profile fields");
    const data = await request("/profiles", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("profileName").value.trim() || "Dashboard Profile",
        locale: document.getElementById("profileLocale").value.trim() || "en-US",
        fields
      })
    });
    setOutput("Profile created", data);
    document.getElementById("loadProfiles").click();
  } catch (error) {
    setOutput("Create profile failed", String(error.message || error));
  }
});

document.getElementById("loadProfiles").addEventListener("click", async () => {
  try {
    const data = await request("/profiles");
    renderCollection(profilesList, data.profiles, (profile) => {
      const firstFields = Array.isArray(profile.fields) ? profile.fields.slice(0, 2) : [];
      return (
        `<div><strong>${profile.name}</strong> <span class="pill warn">${profile.locale}</span></div>` +
        `<div class="mono">${profile.id}</div>` +
        `<div>${firstFields.map((field) => `${field.key}:${field.value}`).join(" | ")}</div>`
      );
    });
    setOutput("Profiles loaded", data);
  } catch (error) {
    setOutput("Load profiles failed", String(error.message || error));
  }
});

document.getElementById("createWorkflow").addEventListener("click", async () => {
  try {
    const steps = parseJsonInput(document.getElementById("workflowSteps").value, defaultSteps, "Workflow steps");
    const data = await request("/workflows", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("workflowName").value.trim() || "Dashboard Workflow",
        description: "Created from web dashboard",
        sitePattern: document.getElementById("workflowSitePattern").value.trim() || "example.test/form",
        executionMode: document.getElementById("workflowMode").value,
        steps
      })
    });
    setOutput("Workflow created", data);
    document.getElementById("loadWorkflows").click();
  } catch (error) {
    setOutput("Create workflow failed", String(error.message || error));
  }
});

document.getElementById("loadWorkflows").addEventListener("click", async () => {
  try {
    const data = await request("/workflows");
    renderCollection(workflowsList, data.workflows, (workflow) => {
      const steps = Array.isArray(workflow.steps) ? workflow.steps.length : 0;
      return (
        `<div><strong>${workflow.name}</strong> <span class="pill ok">${workflow.executionMode}</span></div>` +
        `<div class="mono">${workflow.id}</div>` +
        `<div>Pattern: ${workflow.sitePattern} | Steps: ${steps}</div>`
      );
    });
    setOutput("Workflows loaded", data);
  } catch (error) {
    setOutput("Load workflows failed", String(error.message || error));
  }
});

document.getElementById("createRun").addEventListener("click", async () => {
  try {
    const workflowId = document.getElementById("runWorkflowId").value.trim();
    const inputProfileId = document.getElementById("runProfileId").value.trim();
    const modeOverride = document.getElementById("runModeOverride").value.trim();
    const idempotencyKey = document.getElementById("idempotencyKey").value.trim();
    const payload = { workflowId, inputProfileId };
    if (modeOverride) payload.modeOverride = modeOverride;
    const data = await request("/execution/runs", {
      method: "POST",
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
      body: JSON.stringify(payload)
    });
    setOutput("Run created", data);
    document.getElementById("loadRuns").click();
  } catch (error) {
    setOutput("Create run failed", String(error.message || error));
  }
});

document.getElementById("loadRuns").addEventListener("click", async () => {
  try {
    const data = await request("/execution/runs");
    renderCollection(runsList, data.runs, (run) => {
      const statusClass = run.status === "completed" ? "ok" : run.status === "failed" ? "danger" : "warn";
      return (
        `<div><strong>${run.id}</strong></div>` +
        `<div><span class="pill ${statusClass}">${run.status}</span> <span class="pill ok">${run.mode}</span></div>` +
        `<div>Workflow: ${run.workflowId}</div>`
      );
    });
    setOutput("Runs loaded", data);
  } catch (error) {
    setOutput("Load runs failed", String(error.message || error));
  }
});

document.getElementById("submitDecision").addEventListener("click", async () => {
  try {
    const runId = document.getElementById("decisionRunId").value.trim();
    if (!runId) {
      throw new Error("Run ID is required for decision.");
    }
    const approved = document.getElementById("decisionApproved").value === "true";
    const note = document.getElementById("decisionNote").value.trim();
    const data = await request(`/execution/runs/${runId}/decision`, {
      method: "POST",
      body: JSON.stringify({ approved, note: note || undefined })
    });
    setOutput("Decision submitted", data);
    document.getElementById("loadRuns").click();
  } catch (error) {
    setOutput("Decision failed", String(error.message || error));
  }
});

document.getElementById("pushSync").addEventListener("click", async () => {
  try {
    const checkpoint = document.getElementById("syncCheckpoint").value.trim() || "cp_001";
    const deviceId = document.getElementById("syncDeviceId").value.trim() || "web-dashboard-device-1";
    const payload = parseJsonInput(document.getElementById("syncPayload").value, defaultSyncPayload, "Sync payload");
    const data = await request("/sync/push", {
      method: "POST",
      headers: { "X-Device-Id": deviceId },
      body: JSON.stringify({ checkpoint, payload })
    });
    setOutput("Sync pushed", data);
  } catch (error) {
    setOutput("Sync push failed", String(error.message || error));
  }
});

document.getElementById("pullSync").addEventListener("click", async () => {
  try {
    const data = await request("/sync/pull");
    setOutput("Sync pulled", data);
  } catch (error) {
    setOutput("Sync pull failed", String(error.message || error));
  }
});

document.getElementById("solveCaptcha").addEventListener("click", async () => {
  try {
    const runId = document.getElementById("captchaRunId").value.trim();
    if (!runId) {
      throw new Error("Run ID is required by captcha API schema.");
    }
    const captchaType = document.getElementById("captchaType").value.trim() || "image_grid";
    const data = await request("/captcha/solve", {
      method: "POST",
      body: JSON.stringify({ runId, captchaType })
    });
    setOutput("CAPTCHA response", data);
  } catch (error) {
    setOutput("CAPTCHA failed", String(error.message || error));
  }
});

document.getElementById("loadAuditHint").addEventListener("click", () => {
  setOutput("Audit hint", "Use the admin dashboard to review audit events generated by these actions.");
});

fillDefaults();
renderSubscription(null);
