// content.js — Unified Platform Extension (V2.1)
// Three autonomous modules: CaptchaModule, ExamModule, AutofillModule (V26 Engine)
// Each detects its own trigger condition and acts independently.

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // SHARED UTILITIES
    // ═══════════════════════════════════════════════════════════════════════

    function getStorage(keys) {
        return new Promise(resolve => {
            if (typeof chrome === 'undefined' || !chrome.runtime?.id) return resolve({});
            try {
                const p = chrome.storage.local.get(keys, resolve);
                if (p && typeof p.catch === 'function') {
                    p.catch(() => resolve({}));
                }
            } catch (e) {
                resolve({});
            }
        });
    }

    function imgToB64(imgEl) {
        try {
            const w = imgEl.naturalWidth  || imgEl.width  || 0;
            const h = imgEl.naturalHeight || imgEl.height || 0;
            if (w === 0 || h === 0) return null; // image not yet loaded
            const canvas = document.createElement('canvas');
            canvas.width  = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/png');
        } catch (_) { return null; }
    }

    function sendMsg(type, payload) {
        return new Promise(resolve => {
            if (typeof chrome === 'undefined' || !chrome.runtime?.id) return resolve({});
            try {
                const p = chrome.runtime.sendMessage({ type, ...payload }, resolve);
                if (p && typeof p.catch === 'function') {
                    p.catch(() => resolve({}));
                }
            } catch (e) {
                resolve({});
            }
        });
    }

    function rndInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    async function humanMouse(el) {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const cx = r.left + rndInt(5, Math.max(6, r.width  - 5));
        const cy = r.top  + rndInt(3, Math.max(4, r.height - 3));
        const o  = { bubbles: true, cancelable: true, clientX: cx, clientY: cy };
        el.dispatchEvent(new MouseEvent('mouseover',  o));
        await new Promise(r => setTimeout(r, rndInt(60, 180)));
        el.dispatchEvent(new MouseEvent('mousemove',  o));
        await new Promise(r => setTimeout(r, rndInt(40, 120)));
        el.dispatchEvent(new MouseEvent('mouseenter', o));
        await new Promise(r => setTimeout(r, rndInt(30, 90)));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MODULE 1 — TEXT CAPTCHA
    // Detects <img> + <input> captcha pairs and auto-fills the answer.
    // ═══════════════════════════════════════════════════════════════════════

    const CaptchaModule = (() => {
        let _active = false;
        const _solvedMap = new Map(); // src → b64 prefix, per-captcha dedup

        function normHost(h) {
            return String(h || '').replace(/^www\./, '').toLowerCase();
        }

        // Set value via native setter (React/Angular/Vue safe)
        function setNativeVal(el, value) {
            try {
                const proto = el instanceof HTMLTextAreaElement
                    ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                if (setter) setter.call(el, value);
                else el.value = value;
            } catch (_) { el.value = value; }
        }

        // Human-like typing: clears field then types character by character
        async function humanType(inp, text) {
            inp.focus();
            // Clear existing value first
            setNativeVal(inp, '');
            inp.dispatchEvent(new Event('input', { bubbles: true }));

            await new Promise(r => setTimeout(r, rndInt(80, 200))); // brief focus pause

            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                const keyOpts = { key: ch, bubbles: true, cancelable: true };

                inp.dispatchEvent(new KeyboardEvent('keydown',  keyOpts));
                inp.dispatchEvent(new KeyboardEvent('keypress', keyOpts));

                // Set value up to this char
                setNativeVal(inp, text.slice(0, i + 1));
                inp.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));

                inp.dispatchEvent(new KeyboardEvent('keyup', keyOpts));

                // Random inter-key delay: 40–130ms, occasional longer pause
                const pause = Math.random() < 0.1 ? rndInt(250, 500) : rndInt(40, 130);
                await new Promise(r => setTimeout(r, pause));
            }

            await new Promise(r => setTimeout(r, rndInt(60, 160)));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            inp.dispatchEvent(new Event('blur',   { bubbles: true }));
        }

        // Priority 1: server-synced domain field routes
        function findPairFromRoutes(routes) {
            const imageRoutes = (routes || []).filter(r =>
                (r.task_type || r.source_data_type) === 'image'
            );
            for (const route of imageRoutes) {
                try {
                    const img = document.querySelector(route.source_selector);
                    const inp = document.querySelector(route.target_selector);
                    if (img && inp) return { img, inp, fieldName: route.field_name };
                } catch (_) {}
            }
            return null;
        }

        // Priority 2: server-synced globalLocators
        function findPairFromLocators(locators) {
            const host = normHost(window.location.hostname);
            const loc = locators?.[host] || locators?.['www.' + host];
            if (loc?.img && loc?.input) {
                try {
                    const img = document.querySelector(loc.img);
                    const inp = document.querySelector(loc.input);
                    if (img && inp) return { img, inp };
                } catch (_) {}
            }
            return null;
        }

        // Priority 3: heuristic fallback (common captcha selectors)
        function findPairHeuristic() {
            const SELECTORS = [
                '#capimg', '#capimg1', '#captchaImg', '#captcha-img',
                'img[src*="captcha"]', 'img[src*="captchaimage"]',
                'img[src*=".jsp"]', 'img[id*="captcha"]', 'img[class*="captcha"]',
            ];
            for (const sel of SELECTORS) {
                try {
                    const img = document.querySelector(sel);
                    if (!img) continue;
                    const w = img.naturalWidth || img.width;
                    const h = img.naturalHeight || img.height;
                    if (w < 20 || h < 10) continue;
                    const parent = img.closest('form, div, td, tr') || document.body;
                    const inp = parent.querySelector(
                        'input[id*="captcha"], input[name*="captcha"], ' +
                        'input[id*="capt"], input[name*="capt"], ' +
                        'input[type="text"], input:not([type])'
                    );
                    if (inp) return { img, inp };
                } catch (_) {}
            }
            return null;
        }

        async function solve(img, inp, fieldName) {
            const b64 = imgToB64(img);
            if (!b64) return;
            const cacheKey = img.src || b64.slice(0, 80);
            const b64Key   = b64.slice(0, 80);
            if (_solvedMap.get(cacheKey) === b64Key) return; // same image already solved

            const domain = normHost(window.location.hostname);
            const resp = await sendMsg('SOLVE_CAPTCHA', {
                imageB64:   b64,
                domain,
                field_name: fieldName || 'image_default',
            });
            if (!resp?.ok || !resp.result) {
                console.warn('[Captcha] Solve failed:', resp?.error);
                return;
            }

            _solvedMap.set(cacheKey, b64Key);
            await humanMouse(inp);
            await humanType(inp, resp.result);
            console.log(`[Captcha] ✓ "${resp.result}" in ${resp.ms}ms (${domain})`);
        }

        async function tick() {
            if (!_active) return;
            const data = await getStorage(['globalFieldRoutes', 'globalLocators', 'captchaEnabled']);
            if (data.captchaEnabled === false) return;

            const host   = normHost(window.location.hostname);
            const routes = data.globalFieldRoutes?.[host]
                        || data.globalFieldRoutes?.['www.' + host]
                        || [];

            const pair = findPairFromRoutes(routes)
                      || findPairFromLocators(data.globalLocators)
                      || findPairHeuristic();

            if (pair) await solve(pair.img, pair.inp, pair.fieldName);
        }

        return {
            activate() {
                _active = true;
                tick(); // immediate first try
                setInterval(tick, 2500);
                console.log('[Captcha] Module active (route-aware)');
            },
            deactivate() { _active = false; },
            resetCache() { _solvedMap.clear(); }, // called when routes update
        };
    })();

    // ═══════════════════════════════════════════════════════════════════════
    // MODULE 2 — EXAM SOLVER (Sarathi STALL)
    // ═══════════════════════════════════════════════════════════════════════

    const ExamModule = (() => {
        const CFG = {
            POLL_MS:           500,
            TOTAL_QUESTIONS:   15,
            REQUIRED_CORRECT:  9,
            MAX_WRONG:         6,
            ABORT_MIN_Q:       5,   // don't abort before Q5 — give solver a chance
            CLICK_MIN:         12000,
            CLICK_MAX:         19000,
            DEADLINE:          29000,
            SUBMIT_POLL:       300,
            AUTO_REFRESH:      36000,
        };

        const state = {
            lastQSrc:      null,
            processing:    false,
            correctCount:  0,
            wrongCount:    0,
            prevScore:     -1,
            totalSeen:     0,
            examComplete:  false,
            questionStart: 0,
            refreshTimer:  null,
            enabled:       true,
        };

        let panelEls = null;

        function createPanel() {
            const host = document.createElement('div');
            host.id = 'mcq-panel-host';
            document.documentElement.appendChild(host);
            const shadow = host.attachShadow({ mode: 'open' });
            shadow.innerHTML = `
            <style>
                *{box-sizing:border-box;font-family:'Segoe UI',sans-serif}
                #panel{position:fixed;bottom:16px;right:16px;width:240px;background:#111827;
                    border:1px solid #374151;border-radius:12px;padding:12px;z-index:2147483647;
                    color:#f3f4f6;font-size:12px;box-shadow:0 4px 24px rgba(0,0,0,.6)}
                h3{margin:0 0 8px;font-size:13px;color:#10b981;letter-spacing:.5px}
                .row{display:flex;justify-content:space-between;margin:3px 0;color:#9ca3af}
                .row span:last-child{color:#f3f4f6;font-weight:600}
                #status{margin-top:8px;padding:6px 8px;border-radius:6px;background:#1f2937;font-size:11px;color:#6ee7b7}
                #result{margin-top:4px;font-size:10px;color:#9ca3af;min-height:14px}
                .ok{color:#6ee7b7}.work{color:#fbbf24}.fail{color:#f87171}.idle{color:#9ca3af}
            </style>
            <div id="panel">
                <h3>🎯 STALL Solver</h3>
                <div class="row"><span>Question</span><span id="q">?</span></div>
                <div class="row"><span>Timer</span><span id="timer">—</span></div>
                <div class="row"><span>Score</span><span id="score">—</span></div>
                <div class="row"><span>C / W</span><span id="cw">0 / 0</span></div>
                <div class="row"><span>Risk</span><span id="risk">Safe</span></div>
                <div id="status" class="idle">Ready</div>
                <div id="result"></div>
            </div>`;
            panelEls = {
                q:      shadow.getElementById('q'),
                timer:  shadow.getElementById('timer'),
                score:  shadow.getElementById('score'),
                cw:     shadow.getElementById('cw'),
                risk:   shadow.getElementById('risk'),
                status: shadow.getElementById('status'),
                result: shadow.getElementById('result'),
            };
        }

        function setStatus(text, cls = 'idle') {
            if (!panelEls) return;
            panelEls.status.textContent = text;
            panelEls.status.className   = cls;
        }
        function setResult(text) {
            if (!panelEls) return;
            panelEls.result.textContent = text;
        }

        const getQNum  = () => document.querySelector('span.mytext1')?.innerText?.trim() || '?';
        const getTimer = () => document.getElementById('timer')?.innerText?.trim()       || '—';
        const getScore = () => document.getElementById('score')?.innerText?.trim()       || '—';
        const getQImage  = () => document.querySelector('img[name="qframe"]')?.src       || null;
        const getOptImgs = () => [1,2,3,4].map(i => {
            const el = document.getElementById('choice' + i);
            return el ? (el.src || null) : null;
        }).filter(Boolean);
        const parseScore = () => parseFloat(getScore()) || 0;

        function updatePanel() {
            if (!panelEls) return;
            panelEls.q.textContent     = getQNum();
            panelEls.timer.textContent = getTimer();
            panelEls.score.textContent = getScore();
            panelEls.cw.textContent    = `${state.correctCount} / ${state.wrongCount}`;
            const canPass = (15 - state.wrongCount) + state.correctCount >= CFG.REQUIRED_CORRECT;
            panelEls.risk.textContent  = state.wrongCount > CFG.MAX_WRONG ? 'FAIL!' :
                                         state.wrongCount >= 4              ? 'Warning' : 'Safe';
        }

        function seedFromPage() {
            const qNum = parseInt(getQNum(), 10);
            const sc   = parseScore();
            if (!isNaN(qNum) && qNum > 1) {
                const answered     = qNum - 1;
                state.correctCount = Math.min(sc, answered);
                state.wrongCount   = answered - state.correctCount;
                state.prevScore    = sc;
                state.totalSeen    = answered;
                updatePanel();
                if (state.wrongCount > CFG.MAX_WRONG) abortSession();
            }
        }

        function abortSession() {
            setStatus('ABORT — W>=7 FAIL', 'fail');
            setResult('❌ Cannot pass. Exiting in 3s…');
            let c = 3;
            const iv = setInterval(() => {
                c--;
                setResult(`❌ Cannot pass. Exiting in ${c}s…`);
                if (c <= 0) {
                    clearInterval(iv);
                    try { top.location.href = 'https://www.google.com'; }
                    catch (_) { chrome.runtime.sendMessage({ type: 'ABORT_TAB' }); }
                }
            }, 1000);
        }

        function armWatchdog(qSrc) {
            if (!state.enabled) return;
            if (state.refreshTimer) clearTimeout(state.refreshTimer);
            state.refreshTimer = setTimeout(() => {
                if (getQImage() === qSrc) window.location.reload();
            }, CFG.AUTO_REFRESH);
        }

        async function clickOption(optNum) {
            const radio = document.getElementById('stallradio' + optNum);
            if (!radio) return false;
            await humanMouse(radio);
            radio.click();
            return true;
        }

        function waitAndSubmit(deadline, isLast) {
            const iv = setInterval(async () => {
                const btn = document.getElementById('confirmbut');
                if (!btn) { clearInterval(iv); return; }
                const doSubmit = async () => {
                    clearInterval(iv);
                    await humanMouse(btn);
                    btn.disabled = false;
                    btn.click();
                    if (isLast) {
                        state.examComplete = true;
                        if (state.refreshTimer) clearTimeout(state.refreshTimer);
                        watchForResult();
                    }
                };
                if (!btn.disabled || Date.now() >= deadline) { await doSubmit(); return; }
            }, CFG.SUBMIT_POLL);
        }

        function watchForResult() {
            setStatus('Exam Done ✓', 'ok');
            const iv = setInterval(() => {
                try {
                    const text = (document.body?.innerText || '') + ' ' + (top.document.body?.innerText || '');
                    if (/congratulations|you have passed|licence generated/i.test(text)) {
                        clearInterval(iv);
                        setStatus('🎉 PASSED!', 'ok');
                        setTimeout(() => chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }), 2500);
                    }
                } catch (_) {}
            }, 1000);
            setTimeout(() => clearInterval(iv), 180000);
        }

        async function mainLoop() {
            updatePanel();
            if (!state.enabled || state.examComplete) return;
            const qSrc = getQImage();
            if (!qSrc || qSrc === state.lastQSrc || state.processing) return;

            if (state.prevScore >= 0 && state.totalSeen > 0) {
                const curr = parseScore();
                if (curr > state.prevScore) state.correctCount++;
                else state.wrongCount++;
            }
            state.prevScore = parseScore();

            updatePanel();
            const currentQ = parseInt(getQNum(), 10) || 0;
            if (state.wrongCount > CFG.MAX_WRONG && currentQ >= CFG.ABORT_MIN_Q) {
                abortSession(); return;
            }

            state.lastQSrc     = qSrc;
            state.processing   = true;
            state.totalSeen++;
            state.questionStart = Date.now();
            armWatchdog(qSrc);

            setStatus('Solving…', 'work');

            try {
                const optImgs = getOptImgs();
                const resp = await sendMsg('SOLVE_EXAM', {
                    questionB64: qSrc,
                    optionB64s:  optImgs,
                    domain:      window.location.hostname,
                });

                if (resp?.ok && resp.data?.option_number) {
                    const optNum = resp.data.option_number;
                    setStatus(`✓ ${resp.data.method} (${resp.data.processing_ms}ms)`, 'ok');
                    setResult(`Option ${optNum}: ${resp.data.answer_text || ''}`);

                    const delay = rndInt(CFG.CLICK_MIN, CFG.CLICK_MAX);
                    const elapsed = Date.now() - state.questionStart;
                    if (elapsed < delay) await new Promise(r => setTimeout(r, delay - elapsed));

                    const isLast = state.totalSeen >= CFG.TOTAL_QUESTIONS;
                    const deadline = state.questionStart + CFG.DEADLINE;

                    await clickOption(optNum);
                    waitAndSubmit(deadline, isLast);
                } else {
                    setStatus('✗ No Match', 'fail');
                    setResult(resp?.error || 'No answer found');
                }
            } catch (err) {
                setStatus('✗ Error', 'fail');
                setResult(err.message);
            }
            state.processing = false;
        }

        return {
            activate() {
                if (!/stallexamaction/i.test(window.location.href)) return;
                createPanel();
                getStorage(['solverEnabled']).then(d => state.enabled = d.solverEnabled !== false);
                seedFromPage();
                setInterval(mainLoop, CFG.POLL_MS);
                console.log('[Exam] Module active');
            },
        };
    })();

    // ═══════════════════════════════════════════════════════════════════════
    // MODULE 3 — AUTOFILL ENGINE (V26)
    // Local playback engine with multi-profile and recorder support.
    // ═══════════════════════════════════════════════════════════════════════

    const AutofillModule = (() => {
        let _active = false;
        let _recording = false;
        let _filledElements = new WeakSet();
        let _mutationObs = null;

        const SCHEMA_VERSION = 2;
        const DEFAULT_SETTINGS = {
            skipHidden: true,
            skipLocked: true,
            skipPassword: true,
            maxRetries: 5,
            retryInterval: 1000
        };

        // ── Selection Logic ───────────────────────────────────────────────

        function findBestElement(selectorObj) {
            const { strategy, id, name, css } = selectorObj;
            if (strategy === 'id' && id) return document.getElementById(id);
            if (strategy === 'name' && name) return document.querySelector(`[name="${name}"]`);
            if (strategy === 'css' && css) return document.querySelector(css);
            return null;
        }

        function setNativeValue(el, value) {
            const { set: valueSetter } = Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value') || {};
            if (valueSetter && valueSetter !== Object.getOwnPropertyDescriptor(el, 'value')?.set) {
                valueSetter.call(el, value);
            } else {
                el.value = value;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // ── Rule Engine ───────────────────────────────────────────────────

        function matchRule(rule) {
            const url = window.location.href;
            const site = rule.site;
            if (!site?.pattern) return false;
            
            if (site.match_mode === 'domain') return window.location.hostname === site.pattern;
            if (site.match_mode === 'domainPath') return url.includes(site.pattern);
            if (site.match_mode === 'fullUrl') return url === site.pattern;
            return false;
        }

        async function executeRule(rule, profileData, settings) {
            if (!rule.steps?.length) return;
            for (const step of rule.steps) {
                const el = findBestElement(step.selector);
                if (!el || _filledElements.has(el)) continue;

                // Guards
                if (settings.skipHidden && el.offsetParent === null) continue;
                if (settings.skipLocked && (el.disabled || el.readOnly)) continue;
                if (settings.skipPassword && el.type === 'password') continue;

                // Resolve Value (Profile Tokens)
                let fillValue = step.value || '';
                if (fillValue.startsWith('{{') && fillValue.endsWith('}}')) {
                    const key = fillValue.slice(2, -2);
                    fillValue = profileData[key] || '';
                }

                if (!fillValue && step.action !== 'click') continue;

                try {
                    await humanMouse(el);
                    if (step.action === 'text') {
                        setNativeValue(el, fillValue);
                    } else if (step.action === 'select') {
                        el.value = fillValue;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if (step.action === 'checkbox' || step.action === 'radio') {
                        el.checked = (fillValue === 'true' || fillValue === true || fillValue === '1');
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if (step.action === 'click') {
                        el.click();
                    }
                    _filledElements.add(el);
                } catch (e) {
                    console.error('[Autofill] Step failed:', e);
                }
            }
        }

        async function runEngine() {
            if (!_active || _recording || typeof chrome === 'undefined' || !chrome.runtime?.id) return;
            const data = await getStorage(['rules', 'profiles', 'activeProfileId', 'autofillSettings']);
            const settings = { ...DEFAULT_SETTINGS, ...data.autofillSettings };
            const profiles = data.profiles || [];
            const activeId = data.activeProfileId || 'default';
            const profile = profiles.find(p => p.id === activeId) || profiles[0] || { data: {} };
            const rules = data.rules || [];

            const matchedRules = rules.filter(matchRule).sort((a,b) => (b.priority || 100) - (a.priority || 100));
            if (!matchedRules.length) return;

            for (const rule of matchedRules) {
                await executeRule(rule, profile.data, settings);
            }
        }

        // ── Recorder ──────────────────────────────────────────────────────

        function generateSelector(el) {
            if (el.id) return { strategy: 'id', id: el.id };
            if (el.name) return { strategy: 'name', name: el.name };
            return { strategy: 'css', css: el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ').join('.') : '') };
        }

        function handleInteraction(e) {
            if (!_recording) return;
            const el = e.target;
            if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;

            let action = 'text';
            if (el.type === 'checkbox') action = 'checkbox';
            else if (el.type === 'radio') action = 'radio';
            else if (el.tagName === 'SELECT') action = 'select';

            const rule = {
                site: { match_mode: 'domainPath', pattern: window.location.hostname + window.location.pathname },
                steps: [{
                    order: 1,
                    action,
                    value: (action === 'checkbox' || action === 'radio') ? el.checked : el.value,
                    selector: generateSelector(el)
                }]
            };

            console.log('[Autofill] Recorded interaction:', rule);
            // Save logic would typically go to background script to append to storage
            sendMsg('RECORD_STEP', { rule });
        }

        return {
            activate() {
                _active = true;
                // Debounce: avoid flooding runEngine() on rapid DOM mutations (SPA routing)
                let _mutationTimer = null;
                _mutationObs = new MutationObserver(() => {
                    if (_mutationTimer) return;
                    _mutationTimer = setTimeout(() => {
                        _mutationTimer = null;
                        runEngine();
                    }, 300);
                });
                _mutationObs.observe(document.body, { childList: true, subtree: true });
                document.addEventListener('change', handleInteraction, true);
                runEngine();
                console.log('[Autofill] V26 Engine active');
            },
            toggleRecording(state) {
                _recording = state;
                console.log(`[Autofill] Recording: ${_recording}`);
            }
        };
    })();

    // ═══════════════════════════════════════════════════════════════════════
    // BOOT
    // ═══════════════════════════════════════════════════════════════════════

    async function boot() {
        const data = await getStorage(['solverEnabled', 'autofillEnabled', 'captchaEnabled']);

        if (data.solverEnabled !== false) ExamModule.activate();
        if (data.captchaEnabled !== false) CaptchaModule.activate();
        if (data.autofillEnabled !== false) AutofillModule.activate();

        // Listen for control messages
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg.type === 'TOGGLE_RECORD') AutofillModule.toggleRecording(msg.state);
            if (msg.type === 'FORCE_AUTOFILL') AutofillModule.activate();
            // Background pushes this when routes are updated — no page reload needed
            if (msg.type === 'ROUTES_UPDATED') {
                console.log('[Content] Routes updated by background sync — applying immediately');
                CaptchaModule.resetCache && CaptchaModule.resetCache();
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

})();
