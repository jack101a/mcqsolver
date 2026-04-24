const storageKeys = {
  apiBase: "admin.apiBase",
  accessToken: "admin.accessToken"
};

const el = {
  apiBase: document.getElementById("apiBase"),
  accessToken: document.getElementById("accessToken"),
  saveSession: document.getElementById("saveSession"),
  rawOutput: document.getElementById("rawOutput"),
  loadStats: document.getElementById("loadStats"),
  statsStatus: document.getElementById("statsStatus"),
  mUsers: document.getElementById("mUsers"),
  mWorkflows: document.getElementById("mWorkflows"),
  mProfiles: document.getElementById("mProfiles"),
  mRuns: document.getElementById("mRuns"),
  mAudits: document.getElementById("mAudits"),
  windowMinutes: document.getElementById("windowMinutes"),
  loadInsights: document.getElementById("loadInsights"),
  insightTypeRows: document.getElementById("insightTypeRows"),
  insightStatus: document.getElementById("insightStatus"),
  alertStatus: document.getElementById("alertStatus"),
  alertType: document.getElementById("alertType"),
  loadAlerts: document.getElementById("loadAlerts"),
  alertRows: document.getElementById("alertRows"),
  alertStatusText: document.getElementById("alertStatusText"),
  auditActor: document.getElementById("auditActor"),
  auditAction: document.getElementById("auditAction"),
  loadAudit: document.getElementById("loadAudit"),
  auditRows: document.getElementById("auditRows"),
  auditStatusText: document.getElementById("auditStatusText")
};

const getApiBase = () => (el.apiBase.value || "").trim().replace(/\/+$/, "");
const getToken = () => (el.accessToken.value || "").trim();

const setStatus = (node, text, kind = "neutral") => {
  node.textContent = text;
  node.classList.remove("ok", "err");
  if (kind === "ok") node.classList.add("ok");
  if (kind === "err") node.classList.add("err");
};

const setRawOutput = (value) => {
  el.rawOutput.value = JSON.stringify(value, null, 2);
};

const toQuery = (params) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    q.set(key, String(value));
  });
  const text = q.toString();
  return text ? `?${text}` : "";
};

const apiFetch = async (path, options = {}) => {
  const apiBase = getApiBase();
  const token = getToken();
  if (!apiBase) throw new Error("API base URL is required.");
  if (!token) throw new Error("Access token is required.");

  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {})
  };

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers
  });
  const contentType = response.headers.get("content-type") || "";
  const body =
    contentType.includes("application/json") ? await response.json() : { message: await response.text() };
  if (!response.ok) {
    const code = body?.code ? `[${body.code}] ` : "";
    const message = body?.message || `Request failed with ${response.status}`;
    throw new Error(`${code}${message}`);
  }
  return body;
};

const renderStats = (stats) => {
  el.mUsers.textContent = String(stats.users ?? 0);
  el.mWorkflows.textContent = String(stats.workflows ?? 0);
  el.mProfiles.textContent = String(stats.profiles ?? 0);
  el.mRuns.textContent = String(stats.runs ?? 0);
  el.mAudits.textContent = String(stats.audits ?? 0);
};

const renderInsights = (payload) => {
  const byType = payload.byType || {};
  const rows = Object.keys(byType)
    .sort()
    .map((type) => `<tr><td><code>${type}</code></td><td>${byType[type]}</td></tr>`)
    .join("");
  el.insightTypeRows.innerHTML = rows || '<tr><td colspan="2">No incidents in window.</td></tr>';
};

const renderAlerts = (alerts) => {
  const rows = alerts
    .map((alert) => {
      const statusClass = alert.status === "acknowledged" ? "acknowledged" : "open";
      const ackButton =
        alert.status === "open"
          ? `<button class="danger" data-ack-id="${alert.id}">Acknowledge</button>`
          : `<span>-</span>`;
      return `
        <tr>
          <td><span class="pill ${statusClass}">${alert.status}</span></td>
          <td><code>${alert.type}</code></td>
          <td>${alert.source}</td>
          <td>${new Date(alert.createdAt).toLocaleString()}</td>
          <td>${ackButton}</td>
        </tr>`;
    })
    .join("");
  el.alertRows.innerHTML = rows || '<tr><td colspan="5">No alerts.</td></tr>';
};

const renderAudit = (events) => {
  const rows = events
    .map(
      (event) => `
      <tr>
        <td>${event.actor}</td>
        <td><code>${event.action}</code></td>
        <td>${event.userId || "-"}</td>
        <td>${new Date(event.createdAt).toLocaleString()}</td>
      </tr>`
    )
    .join("");
  el.auditRows.innerHTML = rows || '<tr><td colspan="4">No audit events.</td></tr>';
};

const loadStats = async () => {
  setStatus(el.statsStatus, "Loading stats...");
  try {
    const payload = await apiFetch("/admin/stats");
    renderStats(payload);
    setRawOutput(payload);
    setStatus(el.statsStatus, "Stats loaded.", "ok");
  } catch (error) {
    setStatus(el.statsStatus, String(error.message || error), "err");
  }
};

const loadInsights = async () => {
  setStatus(el.insightStatus, "Loading incident insights...");
  try {
    const payload = await apiFetch(
      `/admin/insights/incidents${toQuery({ windowMinutes: el.windowMinutes.value || 60 })}`
    );
    renderInsights(payload);
    setRawOutput(payload);
    setStatus(el.insightStatus, "Insights loaded.", "ok");
  } catch (error) {
    setStatus(el.insightStatus, String(error.message || error), "err");
  }
};

const loadAlerts = async () => {
  setStatus(el.alertStatusText, "Loading alerts...");
  try {
    const payload = await apiFetch(
      `/admin/alerts${toQuery({
        status: el.alertStatus.value,
        type: el.alertType.value,
        limit: 100
      })}`
    );
    renderAlerts(payload.alerts || []);
    setRawOutput(payload);
    setStatus(el.alertStatusText, `Loaded ${payload.alerts?.length || 0} alerts.`, "ok");
  } catch (error) {
    setStatus(el.alertStatusText, String(error.message || error), "err");
  }
};

const acknowledgeAlert = async (id) => {
  setStatus(el.alertStatusText, `Acknowledging alert ${id}...`);
  try {
    const payload = await apiFetch(`/admin/alerts/${id}/ack`, { method: "POST" });
    setRawOutput(payload);
    setStatus(el.alertStatusText, `Alert ${id} acknowledged.`, "ok");
    await loadAlerts();
  } catch (error) {
    setStatus(el.alertStatusText, String(error.message || error), "err");
  }
};

const loadAudit = async () => {
  setStatus(el.auditStatusText, "Loading audit trail...");
  try {
    const payload = await apiFetch(
      `/admin/audit${toQuery({
        actor: el.auditActor.value.trim(),
        action: el.auditAction.value.trim(),
        limit: 100
      })}`
    );
    renderAudit(payload.events || []);
    setRawOutput(payload);
    setStatus(el.auditStatusText, `Loaded ${payload.events?.length || 0} events.`, "ok");
  } catch (error) {
    setStatus(el.auditStatusText, String(error.message || error), "err");
  }
};

const saveSession = () => {
  localStorage.setItem(storageKeys.apiBase, el.apiBase.value.trim());
  localStorage.setItem(storageKeys.accessToken, el.accessToken.value.trim());
  setStatus(el.statsStatus, "Session saved.", "ok");
};

const loadSession = () => {
  el.apiBase.value = localStorage.getItem(storageKeys.apiBase) || "http://127.0.0.1:4000";
  el.accessToken.value = localStorage.getItem(storageKeys.accessToken) || "";
};

el.saveSession.addEventListener("click", saveSession);
el.loadStats.addEventListener("click", loadStats);
el.loadInsights.addEventListener("click", loadInsights);
el.loadAlerts.addEventListener("click", loadAlerts);
el.loadAudit.addEventListener("click", loadAudit);

el.alertRows.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const ackId = target.getAttribute("data-ack-id");
  if (!ackId) return;
  void acknowledgeAlert(ackId);
});

loadSession();
