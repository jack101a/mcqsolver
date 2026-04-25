/**
 * Content script - multi-task field automation for image, audio, and text sources.
 */

const extApi = typeof browser !== "undefined" ? browser : chrome;

const DEFAULTS = {
  imageSourceSelector: [
    'img[src*="captcha"]',
    'img[src*="captchaimage"]',
    'img[src*=".jsp"]',
    'img[id*="captcha"]',
    '#captchaImg',
    '#capimg',
  ].join(', '),
  imageInputSelector: [
    'input[id*="captcha"]',
    'input[name*="captcha"]',
    'input[id*="capt"]',
    'input[name*="capt"]',
  ].join(', '),
  audioSourceSelector: 'audio[src], audio source[src]',
  audioInputSelector: 'input[id*="audio"], input[name*="audio"], textarea[id*="audio"], textarea[name*="audio"]',
  textSourceSelector: '[data-ai-text-source], textarea[data-ai-source], input[data-ai-source]',
  textInputSelector: '[data-ai-text-target], textarea[data-ai-target], input[data-ai-target], textarea[id*="result"], input[id*="result"]',
};

let scanning = false;
const solvedMap = new Map();
const failedAttemptMap = new Map();
const FAILED_RETRY_COOLDOWN_MS = 15000;
let globalLocators = {};
let globalFieldRoutes = {};

let currentSettings = {
  masterEnabled: true,
  imageTaskEnabled: true,
  audioTaskEnabled: true,
  textTaskEnabled: true,
  apiKey: '',
  autoSolve: true,
  delayMs: 300,
  customLocators: {},
  domainFieldRoutes: [],
  disabledHosts: [],
  audioSourceSelector: DEFAULTS.audioSourceSelector,
  audioInputSelector: DEFAULTS.audioInputSelector,
  textSourceSelector: DEFAULTS.textSourceSelector,
  textInputSelector: DEFAULTS.textInputSelector,
};

function log(...args) {
  console.log('[ai-task-assistant]', ...args);
}

function sendMessage(message) {
  const maybe = extApi.runtime.sendMessage(message);
  if (maybe && typeof maybe.then === 'function') return maybe;
  return new Promise((resolve) => extApi.runtime.sendMessage(message, resolve));
}

function baseSrc(src) {
  try {
    return new URL(src, location.href).href;
  } catch {
    return src;
  }
}

function normalizeDomain(value) {
  let token = String(value || '').trim().toLowerCase();
  if (!token) return '';
  token = token.split('/', 1)[0].split(':', 1)[0].replace(/\.$/, '');
  if (token.startsWith('www.')) token = token.slice(4);
  return token;
}

function getDomainCandidates(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) return [];
  const out = [];
  const seen = new Set();
  const push = (v) => {
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  };
  push(normalized);
  push(`www.${normalized}`);
  const labels = normalized.split('.');
  for (let i = 1; i < labels.length - 1; i += 1) {
    const suffix = labels.slice(i).join('.');
    push(suffix);
    push(`www.${suffix}`);
  }
  return out;
}

function utf8ToBase64(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

function imageToBase64(img) {
  return new Promise((resolve, reject) => {
    const process = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 200;
        canvas.height = img.naturalHeight || img.height || 60;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png').replace(/^data:image\/\w+;base64,/, ''));
      } catch (err) {
        reject(err);
      }
    };

    if (img.complete && img.naturalWidth > 0) process();
    else {
      img.addEventListener('load', process, { once: true });
      img.addEventListener('error', () => reject(new Error('Image load failed')), { once: true });
    }
  });
}

async function mediaUrlToBase64(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Media fetch failed: HTTP ${resp.status}`);
  const blob = await resp.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const data = String(reader.result || '');
      resolve(data.replace(/^data:[^;]+;base64,/, ''));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function findTargetForSource(sourceEl, targetSelector) {
  const form = sourceEl.closest('form');
  if (form) {
    const inForm = form.querySelector(targetSelector);
    if (inForm) return inForm;
  }
  let ancestor = sourceEl.parentElement;
  for (let i = 0; i < 6 && ancestor; i++) {
    const nearby = ancestor.querySelector(targetSelector);
    if (nearby) return nearby;
    ancestor = ancestor.parentElement;
  }
  return document.querySelector(targetSelector);
}

function fillInput(input, value) {
  if (!input || !value) return;
  const setValue = () => {
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) nativeSetter.call(input, value);
      else input.value = value;
    } else {
      input.textContent = value;
    }
    ['input', 'change', 'blur', 'keyup', 'keydown', 'keypress'].forEach((type) => {
      input.dispatchEvent(new Event(type, { bubbles: true }));
    });
  };

  setValue();
  setTimeout(setValue, 300);
}

function attachFailureMonitor(input, originalSolvedText) {
  let hasReported = false;
  input.addEventListener('input', (e) => {
    if (hasReported) return;
    if (e.target.value !== originalSolvedText && String(e.target.value).length > 2) {
      hasReported = true;
      extApi.runtime.sendMessage({ type: 'REPORT_FAILURE' }, () => {});
    }
  });
}

async function refreshSettings() {
  return new Promise((resolve) => {
    extApi.storage.local.get([
      'masterEnabled',
      'textCaptchaEnabled',
      'imageTaskEnabled',
      'audioTaskEnabled',
      'textTaskEnabled',
      'apiKey',
      'autoSolve',
      'delayMs',
      'customLocators',
      'domainFieldRoutes',
      'disabledHosts',
      'globalLocators',
      'globalFieldRoutes',
      'audioSourceSelector',
      'audioInputSelector',
      'textSourceSelector',
      'textInputSelector',
    ], (res) => {
      currentSettings.masterEnabled = res.masterEnabled !== undefined ? res.masterEnabled : true;
      currentSettings.imageTaskEnabled = res.imageTaskEnabled !== undefined
        ? res.imageTaskEnabled
        : (res.textCaptchaEnabled !== undefined ? res.textCaptchaEnabled : true);
      currentSettings.audioTaskEnabled = res.audioTaskEnabled !== undefined ? res.audioTaskEnabled : true;
      currentSettings.textTaskEnabled = res.textTaskEnabled !== undefined ? res.textTaskEnabled : true;
      currentSettings.apiKey = res.apiKey || '';
      currentSettings.autoSolve = res.autoSolve !== undefined ? res.autoSolve : true;
      currentSettings.delayMs = res.delayMs !== undefined ? res.delayMs : 300;
      currentSettings.customLocators = res.customLocators || {};
      currentSettings.domainFieldRoutes = Array.isArray(res.domainFieldRoutes) ? res.domainFieldRoutes : [];
      currentSettings.disabledHosts = res.disabledHosts || [];
      currentSettings.audioSourceSelector = res.audioSourceSelector || DEFAULTS.audioSourceSelector;
      currentSettings.audioInputSelector = res.audioInputSelector || DEFAULTS.audioInputSelector;
      currentSettings.textSourceSelector = res.textSourceSelector || DEFAULTS.textSourceSelector;
      currentSettings.textInputSelector = res.textInputSelector || DEFAULTS.textInputSelector;
      globalLocators = res.globalLocators || {};
      globalFieldRoutes = res.globalFieldRoutes || {};
      resolve();
    });
  });
}

function getDomainSelectors(domain) {
  const candidates = getDomainCandidates(domain);
  let user = {};
  let global = {};
  for (const key of candidates) {
    if (!Object.keys(user).length && currentSettings.customLocators[key]) user = currentSettings.customLocators[key];
    if (!Object.keys(global).length && globalLocators[key]) global = globalLocators[key];
  }

  return {
    imageSource: user.img || global.img || DEFAULTS.imageSourceSelector,
    imageInput: user.input || global.input || DEFAULTS.imageInputSelector,
    audioSource: user.audioSrc || currentSettings.audioSourceSelector,
    audioInput: user.audioInput || currentSettings.audioInputSelector,
    textSource: user.textSrc || currentSettings.textSourceSelector,
    textInput: user.textInput || currentSettings.textInputSelector,
  };
}

function getDomainRoutes(domain) {
  const candidates = getDomainCandidates(domain);
  const localRoutes = Array.isArray(currentSettings.domainFieldRoutes)
    ? currentSettings.domainFieldRoutes.filter((item) => (
      item && candidates.includes(normalizeDomain(item.domain))
    ))
    : [];
  const remoteRoutes = [];
  candidates.forEach((candidate) => {
    (globalFieldRoutes?.[candidate] || []).forEach((item) => {
      remoteRoutes.push({
        domain: candidate,
        taskType: item.task_type || item.source_data_type || 'image',
        sourceSelector: item.source_selector || '',
        targetSelector: item.target_selector || '',
        fieldName: item.field_name || '',
      });
    });
  });
  const routeSeen = new Set();
  const routes = [...remoteRoutes, ...localRoutes].filter((route) => {
    const sig = `${normalizeDomain(route.domain)}|${route.taskType}|${route.sourceSelector}|${route.targetSelector}`;
    if (routeSeen.has(sig)) return false;
    routeSeen.add(sig);
    return true;
  });
  return {
    image: routes.filter((r) => r.taskType === 'image'),
    audio: routes.filter((r) => r.taskType === 'audio'),
    text: routes.filter((r) => r.taskType === 'text'),
  };
}

function safeQueryAll(selector) {
  try {
    return document.querySelectorAll(selector);
  } catch {
    return [];
  }
}

async function solveAndFill({ taskType, fieldName, payloadBase64, sourceKey, sourceElement, targetSelector, monitorFailure }) {
  if (!payloadBase64) return;
  const uniqueKey = `${taskType}:${fieldName}:${sourceKey}`;
  if (solvedMap.get(uniqueKey) === payloadBase64) return;
  const failedAttempt = failedAttemptMap.get(uniqueKey);
  if (failedAttempt && failedAttempt.payloadBase64 === payloadBase64 && (Date.now() - failedAttempt.lastFailedAt) < FAILED_RETRY_COOLDOWN_MS) {
    return;
  }

  const response = await sendMessage({
    type: 'PROCESS_TASK',
    payload: {
      type: taskType,
      payload_base64: payloadBase64,
      mode: 'accurate',
      domain: normalizeDomain(window.location.hostname),
      field_name: fieldName,
    },
  });

  if (!response || !response.ok || !response.result || !response.result.solved) {
    failedAttemptMap.set(uniqueKey, { payloadBase64, lastFailedAt: Date.now() });
    return;
  }

  const solvedText = response.result.solved.result;
  failedAttemptMap.delete(uniqueKey);
  if (currentSettings.delayMs > 0) await new Promise((r) => setTimeout(r, currentSettings.delayMs));

  const target = findTargetForSource(sourceElement, targetSelector);
  if (target) {
    fillInput(target, solvedText);
    if (monitorFailure) attachFailureMonitor(target, solvedText);
  }
  solvedMap.set(uniqueKey, payloadBase64);
}

async function processImageTasks(selectors) {
  if (!currentSettings.imageTaskEnabled) return;
  const images = document.querySelectorAll(selectors.imageSource);
  for (const img of images) {
    const src = img.getAttribute('src') || img.src;
    if (!src) continue;
    try {
      const payloadBase64 = await imageToBase64(img);
      await solveAndFill({
        taskType: 'image',
        fieldName: img.getAttribute('data-ai-field') || 'image_default',
        payloadBase64,
        sourceKey: baseSrc(src),
        sourceElement: img,
        targetSelector: selectors.imageInput,
        monitorFailure: true,
      });
    } catch (err) {
      log('image task failed', err.message || err);
    }
  }
}

async function processImageRoutes(routes) {
  for (const route of routes) {
    if (!route.sourceSelector) continue;
    const nodes = safeQueryAll(route.sourceSelector);
    for (const img of nodes) {
      const src = img.getAttribute('src') || img.src;
      if (!src) continue;
      try {
        const payloadBase64 = await imageToBase64(img);
        await solveAndFill({
          taskType: 'image',
          fieldName: route.fieldName || img.getAttribute('data-ai-field') || 'image_default',
          payloadBase64,
          sourceKey: `${route.sourceSelector}|${baseSrc(src)}`,
          sourceElement: img,
          targetSelector: route.targetSelector || DEFAULTS.imageInputSelector,
          monitorFailure: true,
        });
      } catch (err) {
        log('image route failed', err.message || err);
      }
    }
  }
}

async function processAudioTasks(selectors) {
  if (!currentSettings.audioTaskEnabled) return;
  const nodes = document.querySelectorAll(selectors.audioSource);
  for (const node of nodes) {
    const src = node.tagName.toLowerCase() === 'source'
      ? node.getAttribute('src')
      : (node.getAttribute('src') || node.src);
    if (!src) continue;
    try {
      const payloadBase64 = await mediaUrlToBase64(src);
      await solveAndFill({
        taskType: 'audio',
        fieldName: node.getAttribute('data-ai-field') || 'audio_default',
        payloadBase64,
        sourceKey: baseSrc(src),
        sourceElement: node,
        targetSelector: selectors.audioInput,
        monitorFailure: false,
      });
    } catch (err) {
      log('audio task failed', err.message || err);
    }
  }
}

async function processAudioRoutes(routes) {
  for (const route of routes) {
    if (!route.sourceSelector) continue;
    const nodes = safeQueryAll(route.sourceSelector);
    for (const node of nodes) {
      const src = node.tagName.toLowerCase() === 'source'
        ? node.getAttribute('src')
        : (node.getAttribute('src') || node.src);
      if (!src) continue;
      try {
        const payloadBase64 = await mediaUrlToBase64(src);
        await solveAndFill({
          taskType: 'audio',
          fieldName: route.fieldName || node.getAttribute('data-ai-field') || 'audio_default',
          payloadBase64,
          sourceKey: `${route.sourceSelector}|${baseSrc(src)}`,
          sourceElement: node,
          targetSelector: route.targetSelector || DEFAULTS.audioInputSelector,
          monitorFailure: false,
        });
      } catch (err) {
        log('audio route failed', err.message || err);
      }
    }
  }
}

async function processTextTasks(selectors) {
  if (!currentSettings.textTaskEnabled) return;
  const nodes = document.querySelectorAll(selectors.textSource);
  for (const node of nodes) {
    const raw = (node.value ?? node.textContent ?? '').trim();
    if (!raw) continue;
    try {
      const payloadBase64 = utf8ToBase64(raw);
      const sourceKey = `${node.tagName}:${raw.slice(0, 160)}`;
      await solveAndFill({
        taskType: 'text',
        fieldName: node.getAttribute('data-ai-field') || 'text_default',
        payloadBase64,
        sourceKey,
        sourceElement: node,
        targetSelector: selectors.textInput,
        monitorFailure: false,
      });
    } catch (err) {
      log('text task failed', err.message || err);
    }
  }
}

async function processTextRoutes(routes) {
  for (const route of routes) {
    if (!route.sourceSelector) continue;
    const nodes = safeQueryAll(route.sourceSelector);
    for (const node of nodes) {
      const raw = (node.value ?? node.textContent ?? '').trim();
      if (!raw) continue;
      try {
        const payloadBase64 = utf8ToBase64(raw);
        await solveAndFill({
          taskType: 'text',
          fieldName: route.fieldName || node.getAttribute('data-ai-field') || 'text_default',
          payloadBase64,
          sourceKey: `${route.sourceSelector}|${raw.slice(0, 80)}`,
          sourceElement: node,
          targetSelector: route.targetSelector || DEFAULTS.textInputSelector,
          monitorFailure: false,
        });
      } catch (err) {
        log('text route failed', err.message || err);
      }
    }
  }
}

async function scan() {
  if (scanning) return;
  scanning = true;
  try {
    await refreshSettings();
    if (!currentSettings.masterEnabled || !currentSettings.autoSolve || !currentSettings.apiKey) return;

    const domain = normalizeDomain(window.location.hostname);
    const disabled = (currentSettings.disabledHosts || []).map((d) => normalizeDomain(d));
    if (disabled.includes(domain)) return;

    const selectors = getDomainSelectors(domain);
    const routed = getDomainRoutes(domain);

    if (currentSettings.imageTaskEnabled) {
      if (routed.image.length > 0) await processImageRoutes(routed.image);
      else await processImageTasks(selectors);
    }
    if (currentSettings.audioTaskEnabled) {
      if (routed.audio.length > 0) await processAudioRoutes(routed.audio);
      else await processAudioTasks(selectors);
    }
    if (currentSettings.textTaskEnabled) {
      if (routed.text.length > 0) await processTextRoutes(routed.text);
      else await processTextTasks(selectors);
    }
  } catch (err) {
    log('scan failed', err.message || err);
  } finally {
    scanning = false;
  }
}

setInterval(scan, 2000);
scan();

const observer = new MutationObserver(() => scan());
observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
