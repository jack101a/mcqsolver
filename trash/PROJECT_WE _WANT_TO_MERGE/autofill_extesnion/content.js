/* =========================================================================
   ENGINE V21.0 - FUZZY SELECT & TRAILING SPACE FIX
   ========================================================================= */

let IS_RECORDING = false;
let ACTIVE_PROFILE = "default";

// SYNC STATE
chrome.storage.local.get(['isRecording', 'activeProfile', 'autofillEnabled'], (data) => {
  IS_RECORDING = data.isRecording || false;
  ACTIVE_PROFILE = data.activeProfile || "default";
  
  if (data.autofillEnabled !== false) {
      console.log(`[Autofill V21] Initializing Fuzzy Engine...`);
      runAutofill(); 
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "toggleRecord") IS_RECORDING = msg.state;
  if (msg.action === "updateProfile") {
      ACTIVE_PROFILE = msg.profile;
      runAutofill(); 
  }
  if (msg.action === "forceRun") runAutofill();
});

/* =========================================================================
   PART 1: PLAYBACK ENGINE (FUZZY MATCHING)
   ========================================================================= */

function fireAllEvents(el) {
  // standard events
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  el.dispatchEvent(new Event('click', { bubbles: true }));
  // mouse events (legacy UI support)
  el.dispatchEvent(new Event('mousedown', { bubbles: true }));
  el.dispatchEvent(new Event('mouseup', { bubbles: true }));
}

function setSelectValue(el, value) {
    // 1. Try Exact Match
    el.value = value;
    
    // 2. Check if it stuck. If not, try Fuzzy Match (Trimmed spaces)
    // The RTO dropdown in your HTML has trailing spaces "MH47 " which causes issues.
    if (el.value !== value) {
        const cleanVal = String(value).trim();
        for (let i = 0; i < el.options.length; i++) {
            const optVal = el.options[i].value.trim();
            const optText = el.options[i].text.trim();
            
            if (optVal === cleanVal || optText === cleanVal) {
                el.selectedIndex = i;
                break;
            }
        }
    }
}

function tryFillRule(rule) {
  const cleanName = rule.name ? rule.name.replace(/^"+|"+$/g, '') : '';
  const cleanId = rule.elementId ? rule.elementId.replace(/^"+|"+$/g, '') : '';
  let el = null;

  // PRIORITY 1: ID
  if (cleanId) el = document.getElementById(cleanId);

  // PRIORITY 2: NAME
  if (!el && cleanName) el = document.getElementsByName(cleanName)[0];

  // PRIORITY 3: CSS
  if (!el && rule.selector && rule.selector !== 'input' && rule.selector !== 'select') {
    try { el = document.querySelector(rule.selector); } catch(e) {}
  }

  // FALLBACK: Radio/Click by Name
  if (!el && (rule.action === "radio" || rule.action === "click") && cleanName) {
    el = document.querySelector(`[name="${cleanName}"]`);
  }

  if (el) {
    if (rule.action === "selectorClick" || rule.action === "click") {
      el.click();
      fireAllEvents(el);
    } 
    else if (rule.action === "radio") {
      const radios = document.querySelectorAll(`input[name="${cleanName}"]`);
      let found = false;
      for (const radio of radios) {
        if (radio.value === rule.value) {
          radio.checked = true;
          radio.click(); 
          fireAllEvents(radio);
          found = true;
          break;
        }
      }
      if (!found && radios.length > 0) {
        radios[0].checked = true;
        radios[0].click();
        fireAllEvents(radios[0]);
      }
    } 
    else if (rule.action === "checkbox") {
        const desiredState = (rule.value === true || rule.value === "true");
        if (el.checked !== desiredState) el.click();
        if (el.checked !== desiredState) { el.checked = desiredState; fireAllEvents(el); }
    }
    else if (rule.action === "select") {
        // FUZZY SELECT LOGIC
        setSelectValue(el, rule.value);
        fireAllEvents(el);
    }
    else if (rule.action === "text") {
      el.value = rule.value;
      fireAllEvents(el);
    }
    
    // Green Flash
    if (el.style.outline !== "3px solid green") {
        const old = el.style.outline;
        el.style.outline = "3px solid green";
        setTimeout(() => el.style.outline = old, 300);
    }
    
    return true;
  }
  return false;
}

function tryAutofillAll(profileRules) {
  let success = 0;
  for (const rule of profileRules) {
    if (tryFillRule(rule)) success++;
  }
  return success;
}

function autofillWithRetries(profileRules, retries = 20, interval = 500) {
  let tries = 0;
  console.log(`[Autofill] Processing ${profileRules.length} rules...`);
  
  const tryFill = () => {
    const filled = tryAutofillAll(profileRules);
    tries++;
    if (filled === profileRules.length || tries >= retries) return;
    setTimeout(tryFill, interval);
  };
  tryFill();
}

/* =========================================================================
   PART 2: RECORDER
   ========================================================================= */

function generateCssPath(el) {
    if (el.classList.contains('popupclose')) return '.popupclose';
    let path = el.tagName.toLowerCase();
    
    // Classes
    if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(/\s+/).filter(c => c.length > 2 && !['active','focus','hover','select2'].includes(c));
        if (classes.length > 0) path += `.${classes.join('.')}`;
    }
    
    // Type
    if (el.getAttribute('type')) path += `[type="${el.getAttribute('type')}"]`;
    return path;
}

function handleInteraction(e) {
  if (!IS_RECORDING) return;
  const el = e.target.closest('input, select, textarea, button, a, .popupclose');
  if (!el || el.type === 'password') return;
  if (e.type === 'click' && el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'email')) return;

  let action = 'text';
  let val = el.value;

  if (el.tagName === 'SELECT') action = 'select';
  else if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.type === 'submit' || el.type === 'button') {
      action = 'click';
      val = 'N/A';
  } else if (el.type === 'checkbox') {
      action = 'checkbox';
      val = el.checked;
  } else if (el.type === 'radio') {
      action = 'radio';
      if (!el.checked) return;
  }

  const rule = {
    id: Date.now().toString(),
    profileId: ACTIVE_PROFILE,
    site: window.location.hostname + window.location.pathname,
    name: el.name || el.getAttribute('name') || '',
    elementId: el.id || '', 
    selector: generateCssPath(el),
    value: val,
    action: action,
    timestamp: Date.now()
  };

  saveRule(rule);
}

function saveRule(newRule) {
  chrome.storage.local.get(['rules'], (data) => {
    let rules = data.rules || [];
    const last = rules[rules.length - 1];
    
    // Strict Deduplication
    if (last && last.name === newRule.name && last.selector === newRule.selector && last.value === newRule.value) return;
    
    rules.push(newRule);
    
    chrome.storage.local.set({ rules: rules }, () => {
        const el = document.querySelector(newRule.selector) || document.getElementsByName(newRule.name)[0];
        if (el) { 
            const old = el.style.outline;
            el.style.outline = "4px solid red"; 
            setTimeout(() => el.style.outline = old, 400); 
        }
    });
  });
}

document.addEventListener('change', handleInteraction, true);
document.addEventListener('click', handleInteraction, true);

/* =========================================================================
   PART 3: INIT
   ========================================================================= */

function runAutofill() {
    chrome.storage.local.get(['rules', 'autofillEnabled', 'activeProfile'], (data) => {
        if (data.autofillEnabled === false) return;
        
        const currentPath = window.location.hostname + window.location.pathname;
        const profile = data.activeProfile || "default";
        
        const rules = (data.rules || []).filter(r => r.profileId === profile && currentPath.includes(r.site));
        
        if (rules.length === 0) return;

        autofillWithRetries(rules, 20, 500);
    });
}