document.addEventListener("DOMContentLoaded", async () => {
    const powerEl = document.getElementById("power-switch");
    const phase1El = document.getElementById("phase1-switch");
    const ocrEl = document.getElementById("ocr-switch");
    const apiEl = document.getElementById("api-switch");
    const autoRefreshEl = document.getElementById("auto-refresh-switch");
    const backendStatusEl = document.getElementById("backend-status");
    const backendUrlInputEl = document.getElementById("backend-url-input");
    const saveUrlBtn = document.getElementById("save-url-btn");
    const refreshBtn = document.getElementById("refresh-btn");
    const solveBtn = document.getElementById("solve-btn");
    const resetBtn = document.getElementById("reset-btn");

    const scoreEl = document.getElementById("s-score");
    const wrongEl = document.getElementById("s-wrong");
    const timerEl = document.getElementById("s-timer");
    const decisionEl = document.getElementById("s-decision");
    const DEFAULT_URL = "http://127.0.0.1:8765";
    let autoRefreshTimer = null;

    const syncKeys = [
        "power_on",
        "phase1_enabled",
        "ocr_enabled",
        "api_enabled",
        "ai_fallback_enabled",
        "auto_refresh_enabled",
        "server_url"
    ];
    chrome.storage.sync.get(syncKeys, (res) => {
        powerEl.checked = res.power_on !== false;
        phase1El.checked = res.phase1_enabled !== false;
        ocrEl.checked = res.ocr_enabled !== false;
        const apiEnabled = (res.api_enabled !== undefined) ? !!res.api_enabled : !!res.ai_fallback_enabled;
        apiEl.checked = apiEnabled;
        autoRefreshEl.checked = res.auto_refresh_enabled !== false;
        backendUrlInputEl.value = (res.server_url || DEFAULT_URL).toString();
        // keep both keys in sync for existing code paths
        chrome.storage.sync.set({
            api_enabled: apiEnabled,
            ai_fallback_enabled: apiEnabled
        });
        applyAutoRefresh();
        refreshAll();
    });

    const saveToggles = () => {
        const payload = {
            power_on: !!powerEl.checked,
            phase1_enabled: !!phase1El.checked,
            ocr_enabled: !!ocrEl.checked,
            api_enabled: !!apiEl.checked,
            ai_fallback_enabled: !!apiEl.checked,
            auto_refresh_enabled: !!autoRefreshEl.checked
        };
        chrome.storage.sync.set(payload);
        chrome.runtime.sendMessage({ type: "CONFIG_UPDATE", payload });
        applyAutoRefresh();
    };

    const saveUrl = () => {
        const url = backendUrlInputEl.value.trim();
        if (!url) return;
        chrome.storage.sync.set({ server_url: url }, () => {
            chrome.runtime.sendMessage({ 
                type: "CONFIG_UPDATE", 
                payload: { server_url: url } 
            });
            refreshBackendStatus();
        });
    };
    powerEl.addEventListener("change", saveToggles);
    phase1El.addEventListener("change", saveToggles);
    ocrEl.addEventListener("change", saveToggles);
    apiEl.addEventListener("change", saveToggles);
    autoRefreshEl.addEventListener("change", saveToggles);
    saveUrlBtn.addEventListener("click", saveUrl);

    function refreshStats() {
        chrome.storage.local.get(["live_score", "live_wrong", "live_timer", "live_decision"], (res) => {
            const score = Number(res.live_score || 0);
            const wrong = Number(res.live_wrong || 0);
            const timer = Number(res.live_timer || 30);
            const decision = (res.live_decision || "CONTINUE").toUpperCase();
            scoreEl.textContent = String(score);
            wrongEl.textContent = String(wrong);
            timerEl.textContent = String(timer);
            decisionEl.textContent = decision;
            decisionEl.style.color = decision === "STOP" ? "#dc2626" : "#16a34a";
        });
    }
    function refreshBackendStatus() {
        chrome.runtime.sendMessage({ type: "PING_BACKEND" }, (res) => {
            const ok = !!res?.ok;
            backendStatusEl.textContent = ok ? "Online" : "Offline";
            backendStatusEl.className = ok ? "status-ok" : "status-bad";
        });
    }

    function refreshAll() {
        refreshStats();
        refreshBackendStatus();
    }

    function applyAutoRefresh() {
        if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
            autoRefreshTimer = null;
        }
        if (autoRefreshEl.checked) {
            autoRefreshTimer = setInterval(refreshAll, 4000);
        }
    }

    refreshBtn.addEventListener("click", refreshAll);

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.live_score || changes.live_wrong || changes.live_timer || changes.live_decision) {
            refreshStats();
        }
    });

// Retry helper: attempts sendMessage up to maxRetries with delay between each
    async function sendMessageWithRetry(tabId, message, maxRetries = 3, delayMs = 300) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await chrome.tabs.sendMessage(tabId, message);
            } catch (e) {
                const isConnectionError = e.message.includes("Could not establish connection") ||
                                         e.message.includes("Receiving end does not exist");
                if (!isConnectionError || attempt === maxRetries) {
                    throw e; // Re-throw if not a connection error, or if all retries exhausted
                }
                console.warn(`[Popup] Attempt ${attempt}/${maxRetries} failed: ${e.message}. Retrying...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    solveBtn.addEventListener("click", async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return;
            await sendMessageWithRetry(tab.id, { type: "MANUAL_SOLVE" });
        } catch (e) {
            const isConnectionError = e.message.includes("Could not establish connection") ||
                                    e.message.includes("Receiving end does not exist");
            const errorMsg = isConnectionError
                ? "Please refresh the page to activate the solver!"
                : `Solve failed: ${e.message}`;
            console.warn(`[Popup] ${errorMsg}`);
            alert(errorMsg);
        }
    });

    resetBtn.addEventListener("click", () => {
        chrome.storage.local.set({
            correct: 0,
            total: 0,
            live_score: 0,
            live_wrong: 0,
            live_timer: 30,
            live_decision: "CONTINUE"
        }, refreshStats);
    });
});
