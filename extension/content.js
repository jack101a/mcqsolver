// content.js — Unified Platform Extension (V2.1)
// Three autonomous modules: CaptchaModule, ExamModule, AutofillModule (V26 Engine)
// Each detects its own trigger condition and acts independently.

(function () {
    'use strict';

    // Prevent double injection in the same frame
    if (window.__UNIFIED_PLATFORM_INJECTED__) return;
    window.__UNIFIED_PLATFORM_INJECTED__ = true;


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

    function utf8ToB64(value) {
        return btoa(unescape(encodeURIComponent(String(value || ''))));
    }

    async function sendMsg(type, payload = {}) {
        if (typeof chrome === 'undefined' || !chrome.runtime?.id) return { ok: false, error: 'Extension context invalidated' };
        return new Promise(resolve => {
            try {
                chrome.runtime.sendMessage({ type, ...payload }, response => {
                    if (chrome.runtime.lastError) {
                        resolve({ ok: false, error: chrome.runtime.lastError.message });
                    } else {
                        resolve(response || { ok: false, error: 'No response from background' });
                    }
                });
            } catch (e) {
                resolve({ ok: false, error: e.message });
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

    function flashElement(el, color) {
        if (!el) return;
        const old = el.style.outline;
        el.style.outline = `3px solid ${color}`;
        setTimeout(() => el.style.outline = old, 400);
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

        // Priority 1: server/local domain field routes
        function findImagePairFromRoutes(routes) {
            const imageRoutes = (routes || []).filter(r =>
                (r.task_type || r.taskType || r.source_data_type) === 'image'
            );
            for (const route of imageRoutes) {
                try {
                    const sourceSelector = route.source_selector || route.sourceSelector;
                    const targetSelector = route.target_selector || route.targetSelector;
                    const img = document.querySelector(sourceSelector);
                    const inp = document.querySelector(targetSelector);
                    if (img && inp) return { img, inp, fieldName: route.field_name || route.fieldName };
                } catch (_) {}
            }
            return null;
        }

        function getTextRoutePairs(routes) {
            const pairs = [];
            const textRoutes = (routes || []).filter(r =>
                (r.task_type || r.taskType || r.source_data_type) === 'text'
            );
            for (const route of textRoutes) {
                try {
                    const sourceSelector = route.source_selector || route.sourceSelector;
                    const targetSelector = route.target_selector || route.targetSelector;
                    const source = document.querySelector(sourceSelector);
                    const target = document.querySelector(targetSelector);
                    if (source && target) {
                        pairs.push({
                            source,
                            target,
                            fieldName: route.field_name || route.fieldName || 'text_default',
                        });
                    }
                } catch (_) {}
            }
            return pairs;
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
                taskType:   'image',
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

        async function solveTextRoute(source, target, fieldName) {
            const raw = (source.value ?? source.textContent ?? '').trim();
            if (!raw) return;
            const cacheKey = `${fieldName}:${raw.slice(0, 120)}`;
            if (_solvedMap.get(cacheKey) === raw) return;

            const domain = normHost(window.location.hostname);
            const resp = await sendMsg('SOLVE_CAPTCHA', {
                taskType:   'text',
                imageB64:   utf8ToB64(raw),
                domain,
                field_name: fieldName || 'text_default',
            });
            if (!resp?.ok || !resp.result) {
                console.warn('[Captcha] Text route solve failed:', resp?.error);
                return;
            }

            _solvedMap.set(cacheKey, raw);
            await humanMouse(target);
            await humanType(target, resp.result);
            console.log(`[Captcha] ✓ text route "${resp.result}" in ${resp.ms}ms (${domain})`);
        }

        async function tick() {
            if (!_active) return;
            const data = await getStorage(['globalFieldRoutes', 'domainFieldRoutes', 'globalLocators', 'customLocators', 'captchaEnabled']);
            if (data.captchaEnabled === false) return;

            const host   = normHost(window.location.hostname);
            const globalRoutes = data.globalFieldRoutes?.[host]
                              || data.globalFieldRoutes?.['www.' + host]
                              || [];
            const localRoutes = (data.domainFieldRoutes || []).filter(route => {
                const routeDomain = normHost(route.domain);
                return routeDomain === host || routeDomain === `www.${host}`;
            });
            const routes = [...globalRoutes, ...localRoutes];
            const locators = { ...(data.globalLocators || {}), ...(data.customLocators || {}) };

            const pair = findImagePairFromRoutes(routes)
                      || findPairFromLocators(locators)
                      || findPairHeuristic();

            if (pair) await solve(pair.img, pair.inp, pair.fieldName);

            const textPairs = getTextRoutePairs(routes);
            for (const item of textPairs) {
                await solveTextRoute(item.source, item.target, item.fieldName);
            }
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
            ABORT_MIN_Q:       14,   // only abort if failing is certain at the very end
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
            enabled:       true,
        };

        let panelEls = null;

        function createPanel() {
            if (document.getElementById('mcq-panel-host')) return;
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
        const getScore = () => {
            const el = document.getElementById('score');
            if (el && el.innerText.trim()) return el.innerText.trim();
            const alt = document.querySelector('h3.text-success');
            return alt ? alt.innerText.trim() : '—';
        };
        const getQImage  = () => document.querySelector('img[name="qframe"]')?.src       || null;
        const getOptImgs = () => [1,2,3,4].map(i => {
            const el = document.getElementById('choice' + i);
            return el ? (el.src || null) : null;
        }).filter(Boolean);
        const parseScore = () => {
            const txt = getScore();
            const m = txt.match(/\d+/);
            return m ? parseInt(m[0], 10) : 0;
        };

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
                        watchForResult();
                    }
                };
                if (!btn.disabled || Date.now() >= deadline) { await doSubmit(); return; }
            }, CFG.SUBMIT_POLL);
        }

        function watchForResult() {
            if (state._watching) return;
            state._watching = true;
            setStatus('Exam Done ✓', 'ok');
            const iv = setInterval(() => {
                try {
                    let text = document.body?.innerText || '';
                    try {
                        if (top.location.origin === window.location.origin) {
                            text += ' ' + (top.document.body?.innerText || '');
                        }
                    } catch (_) {}

                    // Precise matching based on user screenshot
                    const pass = /congratulations you have passed|licence generated successfully|your license number is/i.test(text);
                    if (pass) {
                        clearInterval(iv);
                        setStatus('🎉 PASSED!', 'ok');
                        setTimeout(() => {
                            console.log('[Exam] Triggering screenshot');
                            chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });
                        }, 2500);
                    }
                } catch (_) {}
            }, 1000);
            setTimeout(() => {
                clearInterval(iv);
                state._watching = false;
            }, 180000);
        }

        async function mainLoop() {
            const qSrc = getQImage();
            
            // Lazy create panel only when a question image is actually found
            if (!panelEls && qSrc) {
                createPanel();
            }

            updatePanel();
            if (!state.enabled || state.examComplete) return;

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

            setStatus('Solving…', 'work');

            try {
                const optImgs = getOptImgs();
                
                // Solve with a 20-second timeout. If it takes longer, we'll click randomly.
                const solvePromise = sendMsg('SOLVE_EXAM', {
                    questionB64: qSrc,
                    optionB64s:  optImgs,
                    domain:      window.location.hostname,
                });

                const timeout = new Promise(r => setTimeout(() => r({ ok: false, error: 'TIMEOUT_29S' }), 28500));
                const resp = await Promise.race([solvePromise, timeout]);

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
                    // FALLBACK: Pick random option at the very last second (29s)
                    const isTimeout = resp?.error === 'TIMEOUT_29S';
                    
                    // If we got "No Match" early, we MUST wait until 29s before clicking random
                    if (!isTimeout) {
                        const now = Date.now();
                        const targetTime = state.questionStart + 29000;
                        const waitTime = targetTime - now;
                        if (waitTime > 0) {
                            setStatus('✗ No Match (Wait 29s)', 'fail');
                            await new Promise(r => setTimeout(r, waitTime));
                        }
                    }

                    const optCount = getOptImgs().length || 3;
                    const randomOpt = rndInt(1, optCount);
                    
                    setStatus(isTimeout ? '⏰ Time Limit!' : '✗ Random Fallback', 'fail');
                    setResult(`${isTimeout ? '29s reached.' : 'No result.'} Picking random: ${randomOpt}`);
                    
                    const isLast = state.totalSeen >= CFG.TOTAL_QUESTIONS;
                    await clickOption(randomOpt);
                    waitAndSubmit(Date.now(), isLast);
                }
            } catch (err) {
                setStatus('✗ Error', 'fail');
                setResult(err.message);
            }
            state.processing = false;
        }

        return {
            activate() {
                const isExam = /stallexamaction|examselectaction/i.test(window.location.href);
                if (!isExam) return;
                // createPanel() is now called lazily in mainLoop()
                getStorage(['solverEnabled']).then(d => state.enabled = d.solverEnabled !== false);
                seedFromPage();
                setInterval(mainLoop, CFG.POLL_MS);
                console.log('[Exam] Module active (lazy UI)');
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
            if (!selectorObj) return null;
            const { strategy, id, name, css } = selectorObj;
            
            // Try explicit strategy first
            if (strategy === 'id' && id) {
                const el = document.getElementById(id);
                if (el) return el;
            }
            if (strategy === 'name' && name) {
                const el = document.querySelector(`[name="${CSS.escape(name)}"]`);
                if (el) return el;
            }
            if (strategy === 'css' && css) {
                const el = document.querySelector(css);
                if (el) return el;
            }

            // Fallback: try whatever is available
            if (id) {
                const el = document.getElementById(id);
                if (el) return el;
            }
            if (name) {
                const el = document.querySelector(`[name="${CSS.escape(name)}"]`);
                if (el) return el;
            }
            if (css) {
                try {
                    const el = document.querySelector(css);
                    if (el) return el;
                } catch (_) {}
            }
            return null;
        }

        function setNativeValue(el, value) {
            if (el instanceof HTMLSelectElement) {
                // Fuzzy Selection Logic (Legacy port)
                const target = String(value).trim().toLowerCase();
                let found = false;
                for (let i = 0; i < el.options.length; i++) {
                    const opt = el.options[i];
                    if (opt.value.trim().toLowerCase() === target || opt.text.trim().toLowerCase() === target) {
                        el.selectedIndex = i;
                        found = true;
                        break;
                    }
                }
                if (!found) el.value = value; // Fallback
            } else {
                const { set: valueSetter } = Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value') || {};
                if (valueSetter && valueSetter !== Object.getOwnPropertyDescriptor(el, 'value')?.set) {
                    valueSetter.call(el, value);
                } else {
                    el.value = value;
                }
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
                let fillValue = step.value ?? '';
                if (typeof fillValue === 'string' && fillValue.startsWith('{{') && fillValue.endsWith('}}')) {
                    const key = fillValue.slice(2, -2);
                    fillValue = profileData[key] || '';
                }

                if (!fillValue && step.action !== 'click') continue;

                try {
                    await humanMouse(el);
                    if (step.action === 'text') {
                        setNativeValue(el, fillValue);
                    } else if (step.action === 'select') {
                        setNativeValue(el, fillValue);
                    } else if (step.action === 'checkbox' || step.action === 'radio') {
                        el.checked = (fillValue === 'true' || fillValue === true || fillValue === '1');
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if (step.action === 'click') {
                        el.click();
                    }
                    _filledElements.add(el);
                    flashElement(el, '#10b981'); // Green flash
                    sendMsg('INCREMENT_STAT', { key: 'statFill' });
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
            const profileData = profile?.data || {};
            const rules = data.rules || [];

            const matchedRules = rules.filter(matchRule).sort((a,b) => (b.priority || 100) - (a.priority || 100));
            if (!matchedRules.length) return;

            for (const rule of matchedRules) {
                await executeRule(rule, profileData, settings);
            }
        }

        // ── Recorder ──────────────────────────────────────────────────────

        function cssPath(el) {
            // Prioritize Data Attributes (Standard for robust automation)
            const dataAttrs = ['data-testid', 'data-name', 'data-qa', 'data-cy', 'data-id'];
            for (const attr of dataAttrs) {
                const val = el.getAttribute(attr);
                if (val) return `[${attr}="${CSS.escape(val)}"]`;
            }

            if (el.id) return `#${CSS.escape(el.id)}`;
            if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
            
            if (el.className && typeof el.className === 'string') {
                const classes = el.className.trim().split(/\s+/).filter(c => c && !c.includes(':')).slice(0, 3);
                if (classes.length) return `${el.tagName.toLowerCase()}.${classes.map(c => CSS.escape(c)).join('.')}`;
            }
            
            return el.tagName.toLowerCase();
        }

        function generateSelector(el) {
            // Priority 1: Data Attributes
            const dataAttrs = ['data-testid', 'data-name', 'data-qa', 'data-cy', 'data-id'];
            for (const attr of dataAttrs) {
                const val = el.getAttribute(attr);
                if (val) return { strategy: 'css', css: `[${attr}="${CSS.escape(val)}"]` };
            }

            // Priority 2: ID
            if (el.id && !/^\d/.test(el.id)) { // Avoid numeric IDs which are often dynamic
                return { strategy: 'id', id: el.id, css: `#${CSS.escape(el.id)}` };
            }

            // Priority 3: Name
            if (el.name) return { strategy: 'name', name: el.name, css: cssPath(el) };

            // Fallback: CSS Path
            return { strategy: 'css', css: cssPath(el) };
        }

        function handleInteraction(e) {
            if (!_recording) return;
            const el = e.target.closest('input, select, textarea, button, a');
            if (!el || el.type === 'password') return;
            if (e.type === 'click' && el.tagName === 'INPUT' && ['text', 'email', 'number', 'tel'].includes(el.type)) return;

            let action = 'text';
            let value = el.value;
            if (el.type === 'checkbox') {
                action = 'checkbox';
                value = el.checked;
            } else if (el.type === 'radio') {
                if (!el.checked) return;
                action = 'radio';
                value = el.value;
            } else if (el.tagName === 'SELECT') {
                action = 'select';
            } else if (['BUTTON', 'A'].includes(el.tagName) || ['submit', 'button'].includes(el.type)) {
                action = 'click';
                value = '';
            }

            const rule = {
                local_rule_id: `local_${Date.now()}`,
                name: `${action} ${window.location.hostname}`,
                site: { match_mode: 'domainPath', pattern: window.location.hostname + window.location.pathname },
                steps: [{
                    order: 1,
                    action,
                    value,
                    selector: generateSelector(el)
                }],
                meta: {
                    recorded_at: new Date().toISOString(),
                    tag: el.tagName.toLowerCase(),
                    element_id: el.id || '',
                    element_name: el.name || '',
                }
            };

            console.log('[Autofill] Recorded interaction:', rule);
            flashElement(el, '#f43f5e'); // Red flash
            sendMsg('RECORD_STEP', { rule });
        }

        function showRecordToast(text, isOn) {
            const id = '__unified_record_toast';
            let toast = document.getElementById(id);
            if (!toast) {
                toast = document.createElement('div');
                toast.id = id;
                toast.style.position = 'fixed';
                toast.style.right = '16px';
                toast.style.bottom = '16px';
                toast.style.zIndex = '2147483647';
                toast.style.padding = '8px 12px';
                toast.style.borderRadius = '8px';
                toast.style.font = '600 12px/1.2 system-ui, sans-serif';
                toast.style.boxShadow = '0 8px 20px rgba(0,0,0,0.25)';
                document.documentElement.appendChild(toast);
            }
            toast.textContent = text;
            toast.style.background = isOn ? '#15803d' : '#334155';
            toast.style.color = '#ffffff';
            toast.style.opacity = '1';
            clearTimeout(toast._hideTimer);
            toast._hideTimer = setTimeout(() => {
                if (toast) toast.style.opacity = '0';
            }, 2200);
        }

        return {
            activate() {
                _active = true;
                getStorage(['isRecording', 'isMaster']).then(d => {
                    _recording = !!d.isRecording && !!d.isMaster;
                });
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
                document.addEventListener('click', handleInteraction, true);
                runEngine();
                console.log('[Autofill] V26 Engine active');
            },
            toggleRecording(state) {
                _recording = state;
                console.log(`[Autofill] Recording: ${_recording}`);
                showRecordToast(_recording ? 'Autofill recording ON' : 'Autofill recording OFF', _recording);
            },
            runNow() {
                runEngine();
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
            if (msg.type === 'FORCE_AUTOFILL') AutofillModule.runNow();
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
