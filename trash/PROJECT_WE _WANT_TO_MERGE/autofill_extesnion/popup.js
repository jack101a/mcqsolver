document.addEventListener('DOMContentLoaded', () => {
  const btnRecord = document.getElementById('btnRecord');
  const recText = document.getElementById('recText');
  const btnDash = document.getElementById('btnDash');
  const btnAddProfile = document.getElementById('btnAddProfile');
  const profileSelect = document.getElementById('profileSelect');
  const masterSwitch = document.getElementById('masterSwitch');

  // Load initial state
  loadState();

  function loadState() {
    chrome.storage.local.get(['isRecording', 'autofillEnabled', 'profiles', 'activeProfile'], (data) => {
      const profiles = data.profiles || [{id: 'default', name: 'Default'}];
      
      // Render Dropdown
      profileSelect.innerHTML = profiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
      
      // Set Selected Profile
      if (data.activeProfile && profiles.find(p => p.id === data.activeProfile)) {
          profileSelect.value = data.activeProfile;
      } else {
          profileSelect.value = 'default';
      }

      updateRecordBtn(data.isRecording);
      masterSwitch.checked = data.autofillEnabled !== false;
    });
  }

  // --- ACTIONS ---

  // 1. Toggle Recording
  btnRecord.addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['isRecording']);
    const newState = !data.isRecording;
    
    chrome.storage.local.set({ isRecording: newState });
    updateRecordBtn(newState);
    
    // Notify active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: "toggleRecord", state: newState }).catch(() => {});
    }
  });

  // 2. Add New Profile
  btnAddProfile.addEventListener('click', () => {
    const name = prompt("Enter new Profile Name:");
    if (!name) return;

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    chrome.storage.local.get(['profiles'], (data) => {
      const profiles = data.profiles || [{id: 'default', name: 'Default'}];
      
      if (profiles.find(p => p.id === id)) {
        alert("Profile already exists!");
        return;
      }

      profiles.push({ id, name });
      
      // Save, then update UI and set as active
      chrome.storage.local.set({ profiles, activeProfile: id }, () => {
        loadState(); // Reload UI
        // Notify background/content
        chrome.runtime.sendMessage({ action: "updateProfile", profile: id }); 
      });
    });
  });

  // 3. Change Profile
  profileSelect.addEventListener('change', () => {
    const newProfile = profileSelect.value;
    chrome.storage.local.set({ activeProfile: newProfile });
    
    // Notify active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if(tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "updateProfile", profile: newProfile }).catch(()=>{});
    });
  });

  // 4. Master Switch
  masterSwitch.addEventListener('change', () => {
    chrome.storage.local.set({ autofillEnabled: masterSwitch.checked });
  });

  // 5. Open Dashboard
  btnDash.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
  });

  function updateRecordBtn(isRec) {
    if(isRec) {
      recText.textContent = "Stop Recording";
      btnRecord.classList.add('recording');
    } else {
      recText.textContent = "Start Recording";
      btnRecord.classList.remove('recording');
    }
  }
});