// extension/modules/stall_automation.js
(function () {
    'use strict';

    window.StallAutomation = {
        async sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        async randomSleep(min, max) {
            const delay = Math.floor(Math.random() * (max - min + 1) + min);
            return this.sleep(delay);
        },

        async humanType(el, value) {
            if (!el) return;
            el.focus();
            for (const char of value) {
                el.value += char;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                await this.sleep(Math.random() * 50 + 50);
            }
            el.blur();
        },

        async superClick(selector, retries = 5) {
            for (let i = 0; i < retries; i++) {
                const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
                if (el && el.offsetParent !== null) {
                    console.log(`[Automation] SuperClick attempt ${i+1} on:`, selector);
                    el.focus();
                    el.click();
                    // Fallback to JS trigger
                    if (el.onclick || el.getAttribute('onclick')) {
                        const code = el.getAttribute('onclick');
                        location.href = `javascript:${code}`;
                    }
                    await this.sleep(500);
                    return true;
                }
                await this.sleep(1000);
            }
            return false;
        },

        async scrapeQuestion() {
            try {
                // Total Merge logic to find question text in the DOM
                const qEl = document.querySelector('.question') || document.querySelector('#question') || document.querySelector('.exam-text');
                if (qEl) {
                    const text = qEl.innerText.trim();
                    chrome.runtime.sendMessage({ type: 'MCQ_QUESTION_DETECTED', text });
                    return text;
                }
            } catch (e) {}
            return null;
        },

        async triggerClick(el) {
            if (!el) return;
            return await this.superClick(el);
        },

        async run() {
            chrome.runtime.sendMessage({ type: 'GET_STALL_STATE' }, async (resp) => {
                if (!resp?.ok || !resp.state?.active) return;
                const { state } = resp;
                const { payloads } = state;
                const url = location.href;

                console.log(`[Automation] Heartbeat - Step ${state.step}`);

                this.handlePopups();

                try {
                    // --- 1. PERSISTENT HUMAN FILLING ---
                    const appInput = document.querySelector('#llappln');
                    const dobInput = document.querySelector('#dob');
                    const pwdInput = document.getElementsByName('pwd')[0];

                    if (appInput && !appInput.value && payloads.appNo) {
                        await this.randomSleep(500, 1000);
                        await this.humanType(appInput, payloads.appNo);
                        return;
                    }

                    if (dobInput && !dobInput.value && payloads.dob) {
                        await this.randomSleep(500, 1000);
                        await this.humanType(dobInput, payloads.dob);
                        return;
                    }

                    if (pwdInput && !pwdInput.value && payloads.pwd) {
                        await this.randomSleep(300, 800);
                        await this.humanType(pwdInput, payloads.pwd);
                        return;
                    }

                    // --- 2. SIMPLIFIED ACTIONS ---

                    if (url.includes('authenticationaction.do')) {
                        // Action: Submit Step 1
                        if (state.step === 1 && appInput && appInput.value) {
                            const captchaInput = document.querySelector('#captcha') || document.querySelector('[name="v_captcha"]') || document.querySelector('[name="captcha"]');
                            if (!captchaInput || (captchaInput.value && captchaInput.value.length >= 5)) {
                                const submitBtn = document.querySelector('input[value="Submit"]');
                                if (submitBtn) {
                                    await this.randomSleep(1000, 2000);
                                    chrome.runtime.sendMessage({ type: 'UPDATE_STALL_STEP', step: 2 });
                                    await this.triggerClick(submitBtn);
                                }
                            }
                        }
                        // Action: Advance Step 2
                        else if (state.step === 2 && dobInput && dobInput.value) {
                            if (!url.includes('authenticationaction.do') || document.body.innerText.includes('Welcome')) {
                                chrome.runtime.sendMessage({ type: 'UPDATE_STALL_STEP', step: 3 });
                            }
                        }
                    }
                    
                    // Step 3 -> 5s Wait -> Step 4
                    if (state.step === 3) {
                        await this.randomSleep(1500, 2500);
                        await this.executePayload('step3');
                        chrome.runtime.sendMessage({ type: 'UPDATE_STALL_STEP', step: 3.5 });
                        await this.sleep(5500);
                        await this.executePayload('step4');
                        chrome.runtime.sendMessage({ type: 'UPDATE_STALL_STEP', step: 5 });
                    }

                    // Action: Step 5 (Continue)
                    if (state.step === 5) {
                        const continueBtn = document.querySelector('input[value="CONTINUE"]') || document.querySelector('.btn.top-space[value="CONTINUE"]');
                        if (continueBtn) {
                            await this.randomSleep(2000, 4000);
                            chrome.runtime.sendMessage({ type: 'UPDATE_STALL_STEP', step: 6 });
                            await this.triggerClick(continueBtn);
                        }
                    }

                    // Action: Step 6 (Finalizing)
                    if (state.step === 6) {
                        // Total Merge: Continuously scrape questions for the solver
                        await this.scrapeQuestion();

                        const langSelect = document.querySelector('#language');
                        if (langSelect && langSelect.value !== 'HINDI') {
                            await this.randomSleep(1000, 2000);
                            langSelect.value = 'HINDI';
                            langSelect.dispatchEvent(new Event('change'));
                            return;
                        }
                        
                        const woAudio = document.querySelector('#radio1') || document.querySelector('input[value="woaudio"]');
                        if (woAudio && !woAudio.checked) {
                            await this.randomSleep(500, 1000);
                            woAudio.click();
                            return;
                        }

                        const d1 = document.getElementsByName('disclaimer1')[0];
                        const d2 = document.getElementsByName('disclaimer2')[0];
                        if (d1 && !d1.checked) { d1.click(); return; }
                        if (d2 && !d2.checked) { d2.click(); return; }

                        const finishBtn = document.getElementById('subm') || document.querySelector('input[onclick*="validateExamSelection"]');
                        if (finishBtn) {
                            await this.randomSleep(1000, 2000);
                            chrome.runtime.sendMessage({ type: 'FINISH_STALL_AUTOMATION' });
                            await this.superClick(finishBtn);
                        }
                    }

                } catch (e) {
                    console.error('[Automation] Sequential error:', e);
                }
            });
        },

        handlePopups() {
            try {
                const okButtons = document.querySelectorAll('button, input[type="button"]');
                for (const btn of okButtons) {
                    const txt = (btn.innerText || btn.value || '').toLowerCase();
                    if (txt === 'ok' || txt === 'close' || txt === 'agree' || txt === 'accept') {
                        if (btn.offsetParent !== null) {
                            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                            btn.click();
                        }
                    }
                }
            } catch {}
        },

        async executePayload(stepId) {
            return new Promise((resolve) => {
                chrome.runtime.sendMessage({ type: 'FETCH_STALL_PAYLOAD', stepId }, (resp) => {
                    if (resp?.ok && resp.payload) {
                        chrome.runtime.sendMessage({ type: 'SP_EXEC', code: resp.payload }, () => resolve());
                    } else {
                        resolve();
                    }
                });
            });
        }
    };

})();
