document.addEventListener('DOMContentLoaded', () => {
  const tableBody = document.querySelector('#rulesTable tbody');
  const searchBox = document.getElementById('searchBox');
  const filterProfile = document.getElementById('filterProfile');
  
  // Modal Elements
  const modal = document.getElementById('ruleModal');
  const editId = document.getElementById('editId');
  const editProfile = document.getElementById('editProfile');
  const editSite = document.getElementById('editSite');
  const editName = document.getElementById('editName');
  const editElementId = document.getElementById('editElementId');
  const editSelector = document.getElementById('editSelector');
  const editAction = document.getElementById('editAction');
  const editValue = document.getElementById('editValue');

  let allRules = [];
  let profiles = [];

  loadData();

  function loadData() {
    chrome.storage.local.get(['rules', 'profiles'], (data) => {
      allRules = data.rules || [];
      profiles = data.profiles || [{id: 'default', name: 'Default'}];
      updateDropdowns();
      renderTable();
    });
  }

  function renderTable() {
    const searchText = searchBox.value.toLowerCase();
    const selProfile = filterProfile.value;
    
    const filtered = allRules.filter(r => {
      const matchText = (r.site + (r.value||'') + (r.selector||'') + (r.name||'')).toLowerCase().includes(searchText);
      const matchProfile = selProfile === 'all' || r.profileId === selProfile;
      return matchText && matchProfile;
    });

    filtered.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#94a3b8;">No rules found.</td></tr>`;
      return;
    }

    tableBody.innerHTML = filtered.map(rule => {
      const pName = getProfileName(rule.profileId);
      const displayValue = formatValue(rule);
      const displayTarget = getTargetDisplay(rule);
      
      return `
      <tr>
        <td><span class="badge">${pName}</span></td>
        <td title="${rule.site}" style="font-size:12px; color:#475569;">${truncate(rule.site, 40)}</td>
        <td style="font-family:monospace; font-size:12px; color:#334155;">${displayTarget}</td>
        <td><b>${displayValue}</b></td>
        <td style="text-align:right">
          <button class="btn btn-outline btn-edit" data-id="${rule.id}" style="padding:4px 8px">✏️</button>
          <button class="btn btn-danger btn-delete" data-id="${rule.id}" style="padding:4px 8px">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  }

  // --- EVENT DELEGATION ---
  tableBody.addEventListener('click', (e) => {
    const target = e.target.closest('button');
    if (!target) return;
    const id = target.getAttribute('data-id');
    if (target.classList.contains('btn-edit')) openModal(id);
    if (target.classList.contains('btn-delete')) deleteRule(id);
  });

  // --- HELPERS ---
  function getTargetDisplay(rule) {
      if (rule.name) return `<span style="color:#059669; font-weight:bold;">NAME:</span> ${truncate(rule.name, 20)}`;
      if (rule.elementId) return `<span style="color:#2563eb; font-weight:bold;">ID:</span> #${truncate(rule.elementId, 20)}`;
      return `<span style="color:#d97706; font-weight:bold;">CSS:</span> ${truncate(rule.selector, 20)}`;
  }

  function formatValue(rule) {
      if (rule.action === 'click') return '<span style="color:#2563eb">🖱️ Click</span>';
      if (rule.action === 'checkbox') return rule.value ? '☑ Checked' : '☐ Unchecked';
      return truncate(String(rule.value), 20);
  }

  function updateDropdowns() {
    const currentVal = filterProfile.value || 'all';
    const opts = profiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    filterProfile.innerHTML = `<option value="all">All Profiles</option>` + opts;
    filterProfile.value = currentVal;
    editProfile.innerHTML = opts;
  }

  function getProfileName(id) { const p = profiles.find(x => x.id === id); return p ? p.name : id; }
  function truncate(str, n) { if(!str) return ''; return (str.length > n) ? str.substr(0, n) + '...' : str; }

  // --- CRUD LOGIC ---
  function openModal(id = null) {
    if (id) {
      const r = allRules.find(x => x.id === id);
      if(!r) return;
      editId.value = r.id;
      editProfile.value = r.profileId || 'default';
      editSite.value = r.site;
      
      editName.value = r.name || '';
      editElementId.value = r.elementId || '';
      editSelector.value = r.selector || '';
      
      editAction.value = r.action;
      editValue.value = r.value;
    } else {
      editId.value = "";
      editProfile.value = filterProfile.value === 'all' ? 'default' : filterProfile.value;
      editSite.value = "";
      editName.value = "";
      editElementId.value = "";
      editSelector.value = "";
      editAction.value = "text";
      editValue.value = "";
    }
    modal.classList.add('active');
  }

  function deleteRule(id) {
    if(confirm("Delete this rule?")) {
      allRules = allRules.filter(r => r.id !== id);
      chrome.storage.local.set({ rules: allRules }, renderTable);
    }
  }

  document.getElementById('cancelModal').addEventListener('click', () => modal.classList.remove('active'));

  document.getElementById('saveModal').addEventListener('click', () => {
    const id = editId.value;
    const newRule = {
      id: id || Date.now().toString(),
      profileId: editProfile.value,
      site: editSite.value.trim(),
      
      name: editName.value.trim(),
      elementId: editElementId.value.trim(),
      selector: editSelector.value.trim(),
      
      action: editAction.value,
      value: editValue.value,
      timestamp: Date.now()
    };

    if(!newRule.site || (!newRule.name && !newRule.elementId && !newRule.selector)) {
      alert("Site and at least one Target (Name, ID, or Selector) are required");
      return;
    }

    if (id) {
      const idx = allRules.findIndex(r => r.id === id);
      if (idx !== -1) allRules[idx] = newRule;
    } else {
      allRules.push(newRule);
    }

    chrome.storage.local.set({ rules: allRules }, () => {
      renderTable();
      modal.classList.remove('active');
    });
  });

  document.getElementById('addRuleBtn').addEventListener('click', () => openModal(null));
  
  document.getElementById('clearAllBtn').addEventListener('click', () => {
    if(confirm("Delete ALL rules?")) chrome.storage.local.set({rules: []}, loadData);
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({rules: allRules, profiles})], {type: "application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = "autofill_backup.json";
      a.click();
  });
  
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', (e) => {
      const fr = new FileReader();
      fr.onload = (ev) => {
          try {
              const d = JSON.parse(ev.target.result);
              if(d.rules) chrome.storage.local.set({ rules: d.rules, profiles: d.profiles || profiles }, () => location.reload());
          } catch(err) { alert("Invalid file"); }
      };
      fr.readAsText(e.target.files[0]);
  });

  searchBox.addEventListener('input', renderTable);
  filterProfile.addEventListener('change', renderTable);
});