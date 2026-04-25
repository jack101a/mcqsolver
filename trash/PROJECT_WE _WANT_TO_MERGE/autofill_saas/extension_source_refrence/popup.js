document.addEventListener("DOMContentLoaded", () => {
  const btnRecord = document.getElementById("btnRecord");
  const recText = document.getElementById("recText");
  const btnDash = document.getElementById("btnDash");
  const profileSelect = document.getElementById("profileSelect");
  const masterSwitch = document.getElementById("masterSwitch");

  loadState();

  function updateRecordBtn(isRec) {
    if (isRec) {
      recText.textContent = "Stop Recording";
      btnRecord.classList.add("recording");
    } else {
      recText.textContent = "Start Recording";
      btnRecord.classList.remove("recording");
    }
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  }

  async function notifyActiveTab(payload) {
    const tab = await getActiveTab();
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
  }

  function loadState() {
    chrome.storage.local.get(
      ["isRecording", "autofillEnabled", "profiles", "activeProfile"],
      (data) => {
        const profiles = data.profiles || [{ id: "default", name: "Default" }];
        const options = profiles
          .map((p) => `<option value="${p.id}">${p.name}</option>`)
          .join("");
        profileSelect.innerHTML =
          `<option value="all" style="font-weight:bold; color:#2563eb;">All Profiles</option>` +
          options;
        profileSelect.value = data.activeProfile || "all";
        updateRecordBtn(!!data.isRecording);
        masterSwitch.checked = data.autofillEnabled !== false;
      }
    );
  }

  btnRecord.addEventListener("click", async () => {
    const data = await chrome.storage.local.get(["isRecording"]);
    const newState = !data.isRecording;
    chrome.storage.local.set({ isRecording: newState });
    updateRecordBtn(newState);
    notifyActiveTab({ action: "toggleRecord", state: newState });
  });

  profileSelect.addEventListener("change", () => {
    const newProfile = profileSelect.value;
    chrome.storage.local.set({ activeProfile: newProfile });
    notifyActiveTab({ action: "updateProfile", profile: newProfile });
  });

  masterSwitch.addEventListener("change", () => {
    chrome.storage.local.set({ autofillEnabled: masterSwitch.checked });
  });

  btnDash.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
});
