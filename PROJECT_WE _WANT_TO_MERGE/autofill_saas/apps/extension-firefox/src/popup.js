document.addEventListener("DOMContentLoaded", () => {
  const ext = typeof browser !== "undefined" ? browser : chrome;
  const btnRecord = document.getElementById("btnRecord");
  const recText = document.getElementById("recText");
  const btnDash = document.getElementById("btnDash");
  const btnFillNow = document.getElementById("btnFillNow");
  const profileSelect = document.getElementById("profileSelect");
  const masterSwitch = document.getElementById("masterSwitch");

  const updateRecordBtn = (isRec) => {
    if (isRec) {
      recText.textContent = "Stop Recording";
      btnRecord.classList.add("recording");
    } else {
      recText.textContent = "Start Recording";
      btnRecord.classList.remove("recording");
    }
  };

  const getActiveTab = async () => {
    const tabs = await ext.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  };

  const notifyActiveTab = async (payload) => {
    const tab = await getActiveTab();
    if (!tab || !tab.id) return;
    try {
      await ext.tabs.sendMessage(tab.id, payload);
    } catch (_error) {}
  };

  const loadState = async () => {
    const data = await ext.storage.local.get([
      "isRecording",
      "autofillEnabled",
      "profiles",
      "activeProfile"
    ]);
    const profiles = data.profiles || [{ id: "default", name: "Default" }];
    const options = profiles.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
    profileSelect.innerHTML =
      `<option value="all" style="font-weight:bold; color:#2563eb;">All Profiles</option>${options}`;
    profileSelect.value = data.activeProfile || "all";
    updateRecordBtn(!!data.isRecording);
    masterSwitch.checked = data.autofillEnabled !== false;
  };

  btnRecord.addEventListener("click", async () => {
    const data = await ext.storage.local.get(["isRecording"]);
    const newState = !data.isRecording;
    await ext.storage.local.set({ isRecording: newState });
    updateRecordBtn(newState);
    await notifyActiveTab({ action: "toggleRecord", state: newState });
  });

  profileSelect.addEventListener("change", async () => {
    const newProfile = profileSelect.value;
    await ext.storage.local.set({ activeProfile: newProfile });
    await notifyActiveTab({ action: "updateProfile", profile: newProfile });
  });

  masterSwitch.addEventListener("change", async () => {
    await ext.storage.local.set({ autofillEnabled: masterSwitch.checked });
  });

  btnDash.addEventListener("click", () => {
    ext.runtime.openOptionsPage();
  });

  btnFillNow.addEventListener("click", async () => {
    await notifyActiveTab({ action: "forceRun" });
  });

  loadState();
});
