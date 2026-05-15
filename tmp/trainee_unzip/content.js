(function() {
    // --- Initialization ---
    if (!window.location.hostname.includes("sarathi.parivahan.gov.in")) return;

    // Signal that the content script is loaded and ready for communication
    chrome.runtime.sendMessage({
        type: "CONTENT_SCRIPT_READY",
        dpr: window.devicePixelRatio
    });

    let isSolving = false;

    // --- Main Logic ---

    async function solve(force = false) {
        const settings = await window.MCQ_Scraper.getSettings();
        if (settings.power_on === false && !force) return;
        if (isSolving) return;
        isSolving = true;

        let stats = window.MCQ_Scraper.getScoreStats();
        window.MCQ_Scraper.persistLiveStats(stats);
        if (stats.decision === "STOP") {
            window.MCQ_UI.updateOverlay("STOP: fail threshold reached", stats);
            window.MCQ_Scraper.sendMessageSafe({ type: "CLOSE_CURRENT_TAB" });
            isSolving = false;
            return;
        }

        const phase1Enabled = settings.phase1_enabled !== false;
        const phase2Enabled = settings.ocr_enabled !== false;
        const timerAtStart = Math.max(4, Number(stats.timer || 30));
        const phase1WindowMs = phase1Enabled ? Math.max(1800, Math.min(7000, Math.floor(timerAtStart * 180))) : 0;

        window.MCQ_UI.updateOverlay(
            `Running${phase1Enabled ? " P1" : ""}${phase2Enabled ? "+P2" : ""}${!phase1Enabled && !phase2Enabled ? " (P3 only)" : ""}...`,
            stats
        );

        // Phase 1 loop: fire repeatedly as soon as possible while page settles.
        const phase1Promise = (async () => {
            if (!phase1Enabled) {
                return { ok: false, option: null, reason: "phase1_disabled" };
            }
            const deadline = Date.now() + phase1WindowMs;
            let lastReason = "phase1_no_hit";
            while (Date.now() < deadline) {
                const res = await window.MCQ_Scraper.getAnswerFromShowFunction();
                if (res?.option) {
                    return { ok: true, option: res.option, reason: res.reason || "ok" };
                }
                lastReason = res?.reason || lastReason;
                await window.MCQ_Scraper.sleep(250);
            }
            return { ok: false, option: null, reason: lastReason || "phase1_timeout" };
        })();

        const runPhase2 = async () => {
            if (!phase2Enabled) return { ok: false, answer: null, reason: "ocr_disabled" };
            try {
                const domHints = window.MCQ_DOMHints.getDomHints();
                const panelB64 = await window.MCQ_DOMHints.capturePanelBase64();
                const ocrResult = await window.MCQ_Scraper.sendMessageSafe({
                    type: "CAPTURE_AND_OCR",
                    dom_hints: domHints,
                    image_b64_override: panelB64 || undefined,
                    capture_mode: panelB64 ? "panel_html2canvas" : "tab_capture_fallback"
                });
                if (ocrResult?.found && ocrResult.answer) {
                    // As requested: prioritize phase2 for non-sign questions.
                    if (ocrResult.sign_label) {
                        return { ok: false, answer: null, reason: "sign_question_defer_to_phase3", raw: ocrResult };
                    }
                    return { ok: true, answer: ocrResult.answer, reason: "ok", raw: ocrResult };
                }
                const r = (ocrResult?.error || "ocr_no_answer").toString();
                return { ok: false, answer: null, reason: r, raw: ocrResult };
            } catch (e) {
                return { ok: false, answer: null, reason: `phase2_exception:${e?.message || e}` };
            }
        };

        const phase1Res = await phase1Promise;
        let phase2Res = { ok: false, answer: null, reason: phase2Enabled ? "phase2_pending" : "ocr_disabled" };
        if (!phase1Res.ok && phase2Enabled) {
            phase2Res = await runPhase2();
        }

        let answerOption = null;
        let answerSource = "";
        let ocrMeta = phase2Res?.raw?.metadata || null;

        console.log(`[MCQ] Phase1 result: option=${phase1Res.option || "none"} reason=${phase1Res.reason}`);
        if (phase1Res.ok && phase1Res.option) {
            answerOption = phase1Res.option;
            answerSource = "phase1";
            window.MCQ_UI.updateOverlay(`Phase1: Opt ${answerOption}`, stats);
        } else if (phase2Res.ok && phase2Res.answer) {
            answerOption = phase2Res.answer;
            answerSource = "phase2";
            window.MCQ_UI.updateOverlay(`Phase2: Opt ${answerOption}`, stats, ocrMeta);
        } else {
            // Phase 3 only after 10 seconds passed and no usable P1/P2 answer.
            const apiEnabled = settings.api_enabled === true || settings.ai_fallback_enabled === true;
            if (!apiEnabled) {
                window.MCQ_UI.updateOverlay(`No answer (P1:${phase1Res.reason}, P2:${phase2Res.reason})`, stats, ocrMeta);
                isSolving = false;
                return;
            }

            window.MCQ_UI.updateOverlay("Phase3 API fallback...", stats, ocrMeta);
            try {
                const aiResult = await window.MCQ_Scraper.sendMessageSafe({ type: "CAPTURE_AND_SOLVE" });
                if (aiResult?.answer && !aiResult.disabled) {
                    answerOption = aiResult.answer;
                    answerSource = "phase3";
                    window.MCQ_UI.updateOverlay(`Phase3: Opt ${answerOption}`, stats, ocrMeta);
                } else {
                    window.MCQ_UI.updateOverlay(`API failed: ${aiResult?.error || "no answer"}`, stats, ocrMeta);
                    isSolving = false;
                    return;
                }
            } catch (e) {
                window.MCQ_UI.updateOverlay(`API error: ${e?.message || e}`, stats, ocrMeta);
                isSolving = false;
                return;
            }
        }

        // Submission window: never before 10s, submit between remaining 19..4 sec.
        const targetRemaining = Math.floor(Math.random() * (19 - 4 + 1)) + 4;
        let waitGuard = 0;
        while (waitGuard < 80) {
            stats = window.MCQ_Scraper.getScoreStats();
            window.MCQ_Scraper.persistLiveStats(stats);
            if (stats.decision === "STOP") {
                window.MCQ_UI.updateOverlay("STOP: closing tab", stats, ocrMeta);
                window.MCQ_Scraper.sendMessageSafe({ type: "CLOSE_CURRENT_TAB" });
                isSolving = false;
                return;
            }
            // timer counts down; submit when at/below target but keep >=4 where possible.
            if (stats.timer <= targetRemaining || stats.timer <= 4) break;
            window.MCQ_UI.updateOverlay(`Wait (${answerSource}) t=${stats.timer}s`, stats, ocrMeta);
            await new window.MCQ_Scraper.sleep(300);
            waitGuard += 1;
        }

        const picked = await window.MCQ_Interactions.clickRadio(answerOption);
        if (!picked) {
            window.MCQ_UI.updateOverlay(`Could not click option ${answerOption}`, window.MCQ_Scraper.getScoreStats(), ocrMeta);
            isSolving = false;
            return;
        }

        await window.MCQ_Scraper.sleep(600);
        await window.MCQ_Interactions.submitAnswer();
        window.MCQ_UI.updateOverlay(`Submitted ${answerSource}`, window.MCQ_Scraper.getScoreStats(), ocrMeta);
        isSolving = false;
    }

    // --- Event Listeners ---
    // Continuous check
    setInterval(() => {
        if (!isSolving && window.MCQ_Scraper.isNewQuestion()) {
            // Need a slight delay to allow the page rendering before reading DOM
            setTimeout(solve, 500);
        }
    }, 1500);

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg?.type !== "MANUAL_SOLVE") return;
        solve(true)
            .then(() => sendResponse({ ok: true }))
            .catch((e) => sendResponse({ ok: false, error: e?.message || "manual solve failed" }));
        return true;
    });

    // Initial check on load
    setTimeout(() => {
        if (!isSolving && window.MCQ_Scraper.getRealSecondsRemaining() > 0) {
            const fp = window.MCQ_Scraper.getQuestionFingerprint();
            if (fp) lastQuestionFingerprint = fp;
            solve();
        }
    }, 2000);

})();
