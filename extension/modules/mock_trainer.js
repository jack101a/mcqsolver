// extension/modules/mock_trainer.js
(function () {
    'use strict';

    window.MockTrainerModule = (() => {
        const MOCK_PATH = /\/sarathiservice\/stallexam\.do/i;
        const CFG = {
            POLL_MS: 900,
            PARSE_RETRY_MS: 250,
            PARSE_TIMEOUT_MS: 3500,
            SUBMIT_DELAY_MIN: 500,
            SUBMIT_DELAY_MAX: 1100,
            DEFAULT_NAME: 'darshan',
            DEFAULT_DOB: '01-02-2003',
            DEFAULT_LANGUAGE: 'HINDI',
            DEFAULT_STATE: 'MH',
        };

        let interval = null;
        let processing = false;
        let lastQuestionKey = '';
        let loginSubmitted = false;

        function isMockPage() {
            return location.hostname === 'sarathi.parivahan.gov.in' && MOCK_PATH.test(location.pathname);
        }

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        function setValue(el, value) {
            if (!el) return false;
            el.focus();
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.blur();
            return true;
        }

        function getQNum() {
            const text = document.querySelector('span.mytext1')?.innerText || '';
            const match = text.match(/\d+/);
            return match ? parseInt(match[0], 10) : 0;
        }

        function getQImageEl() {
            return document.querySelector('img[name="qframe"]');
        }

        function getOptionImageEls() {
            return [1, 2, 3, 4].map(i => document.getElementById('choice' + i)).filter(Boolean);
        }

        function imageToPayload(imgEl) {
            if (!imgEl || typeof window.up_imgToB64 !== 'function') return null;
            const dataUrl = window.up_imgToB64(imgEl);
            return dataUrl || null;
        }

        function getRadio(option) {
            return document.getElementById('stallradio' + option)
                || document.getElementById('radio' + option + option)
                || document.querySelector(`input[type="radio"][value="${option}"]`);
        }

        function getSubmitButton() {
            return document.getElementById('confirmbut')
                || document.getElementById('submitbut')
                || document.getElementById('nextbut')
                || document.querySelector('button[type="submit"], input[type="submit"], input[type="button"]');
        }

        async function clickCorrectAndSubmit(option) {
            const radio = getRadio(option);
            if (radio) {
                if (typeof window.up_humanMouse === 'function') await window.up_humanMouse(radio);
                radio.disabled = false;
                radio.click();
                radio.checked = true;
                radio.dispatchEvent(new Event('input', { bubbles: true }));
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
            await sleep(window.up_rndInt ? window.up_rndInt(CFG.SUBMIT_DELAY_MIN, CFG.SUBMIT_DELAY_MAX) : 750);
            const btn = getSubmitButton();
            if (btn) {
                if (typeof window.up_humanMouse === 'function') await window.up_humanMouse(btn);
                btn.disabled = false;
                btn.click();
            }
        }

        async function parseTeacherAnswer() {
            const deadline = Date.now() + CFG.PARSE_TIMEOUT_MS;
            let last = { ok: false, option: null, reason: 'not_started' };
            while (Date.now() < deadline) {
                last = await window.up_sendMsg('MOCK_PARSE_SHOW_ANSWER');
                if (last?.ok && last.option) return last;
                await sleep(CFG.PARSE_RETRY_MS);
            }
            return last || { ok: false, option: null, reason: 'parse_timeout' };
        }

        async function trainCurrentQuestion() {
            const qImg = getQImageEl();
            const optionEls = getOptionImageEls();
            if (!qImg || optionEls.length < 4) return;

            const qPayload = imageToPayload(qImg);
            const optPayloads = optionEls.map(imageToPayload).filter(Boolean);
            if (!qPayload || optPayloads.length < 4) return;

            const qNum = getQNum();
            const key = `${qNum}|${qImg.src || qPayload.slice(0, 80)}`;
            if (key === lastQuestionKey) return;

            processing = true;
            try {
                const teacher = await parseTeacherAnswer();
                if (!(teacher?.ok && teacher.option >= 1 && teacher.option <= 4)) {
                    console.warn('[MockTrainer] Teacher answer unavailable:', teacher?.reason || 'unknown');
                    return;
                }

                lastQuestionKey = key;
                const feedback = await window.up_sendMsg('EXAM_FEEDBACK', {
                    questionB64: qPayload,
                    optionB64s: optPayloads,
                    selectedOption: teacher.option,
                    wasCorrect: true,
                    method: 'mock_phase1_teacher',
                    processingMs: 0,
                    domain: window.location.hostname,
                    questionNum: qNum,
                });
                if (feedback?.ok) {
                    console.log('[MockTrainer] Learned confirmed option', teacher.option, feedback.data);
                } else {
                    console.warn('[MockTrainer] Feedback failed:', feedback?.error || 'no response');
                }
                await clickCorrectAndSubmit(teacher.option);
            } finally {
                processing = false;
            }
        }

        function findLoginSubmit() {
            const form = document.getElementById('stallLoginSubmit')?.closest('form')
                || document.querySelector('form');
            const candidates = Array.from((form || document).querySelectorAll('button, input[type="submit"], input[type="button"]'));
            return candidates.find(el => {
                const text = String(el.innerText || el.value || '').trim().toLowerCase();
                return text.includes('submit') || text.includes('start') || text.includes('continue') || text.includes('proceed');
            }) || candidates[0] || null;
        }

        async function fillMockLogin() {
            const name = document.getElementById('stallLoginSubmit_ApplicantName');
            const dob = document.getElementById('dob');
            const language = document.getElementById('sel');
            const state = document.getElementById('mockstate');
            const radio = document.getElementById('radio1') || document.querySelector('input[name="examselection"][value="woaudio"]');
            if (!name || !dob || !language || !state || !radio) return false;

            setValue(name, CFG.DEFAULT_NAME);
            setValue(dob, CFG.DEFAULT_DOB);
            setValue(language, CFG.DEFAULT_LANGUAGE);
            setValue(state, CFG.DEFAULT_STATE);
            radio.checked = true;
            radio.dispatchEvent(new Event('click', { bubbles: true }));
            radio.dispatchEvent(new Event('change', { bubbles: true }));

            if (!loginSubmitted) {
                loginSubmitted = true;
                await sleep(window.up_rndInt ? window.up_rndInt(500, 900) : 700);
                const submit = findLoginSubmit();
                if (submit) submit.click();
            }
            return true;
        }

        async function tick() {
            if (processing || !isMockPage()) return;
            const settings = await window.up_getStorage(['solverEnabled', 'learningEnabled', 'mockTrainingEnabled']);
            if (settings.solverEnabled === false || settings.learningEnabled === false || settings.mockTrainingEnabled === false) return;
            if (!getQImageEl()) {
                await fillMockLogin();
                return;
            }
            await trainCurrentQuestion();
        }

        return {
            activate() {
                if (!isMockPage()) return;
                if (interval) clearInterval(interval);
                interval = setInterval(() => tick().catch(e => console.warn('[MockTrainer] tick failed:', e.message)), CFG.POLL_MS);
                setTimeout(() => tick().catch(() => {}), 500);
                console.log('[MockTrainer] active on Sarathi mock test');
            }
        };
    })();
})();
