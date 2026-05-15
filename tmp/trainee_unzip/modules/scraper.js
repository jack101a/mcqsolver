function getSettings() {
    return new Promise(resolve => {
        chrome.storage.sync.get(
            ['power_on', 'debug_mode', 'phase1_enabled', 'ocr_enabled', 'api_enabled', 'ai_fallback_enabled'],
            resolve
        );
    });
}

function getOptionRadios() {
    const fixed = [];
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`stallradio${i}`);
        if (el && el.type === "radio") fixed.push(el);
    }
    if (fixed.length) return fixed;

    const all = Array.from(document.querySelectorAll('input[type="radio"]'));
    const visible = all.filter(r => {
        const rect = r.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    });
    return (visible.length ? visible : all).slice(0, 4);
}

function getRadioForOption(optionNumber) {
    const direct = document.getElementById(`stallradio${optionNumber}`);
    if (direct) return direct;

    const radios = getOptionRadios();
    if (!radios.length) return null;

    const target = String(optionNumber);
    return (
        radios.find(r => String(r.value || "").trim() === target) ||
        radios[optionNumber - 1] ||
        null
    );
}

function getOptionContainer(radio) {
    if (!radio) return null;
    const candidates = [];
    const push = (el) => { if (el && !candidates.includes(el)) candidates.push(el); };

    push(radio.closest('tr'));
    push(radio.closest('li'));
    push(radio.closest('.option'));
    push(radio.closest('.answer'));
    push(radio.closest('.form-check'));
    push(radio.closest('.question-option'));

    if (radio.id) {
        const byFor = document.querySelector(`label[for="${radio.id}"]`);
        push(byFor?.closest('tr') || byFor?.closest('li') || byFor);
    }
    push(radio.parentElement);
    push(radio.closest('td'));

    let best = null;
    let bestScore = -1;
    for (const c of candidates) {
        const rect = c.getBoundingClientRect();
        const area = rect.width * rect.height;
        const txt = (c.innerText || "").trim();
        const score = area + Math.min(5000, txt.length * 40);
        if (score > bestScore) {
            best = c;
            bestScore = score;
        }
    }
    return best || radio.parentElement || radio;
}

function getQuestionFingerprint() {
    const timer = document.getElementById("timer");
    const hasOptions = getOptionRadios().length >= 2;
    if (!timer || !hasOptions) return null;

    const qno = window.currqno || "";
    const qText = (readQuestionText() || "").replace(/\s+/g, " ").trim().slice(0, 180);
    const firstOption = (getOptionContainer(getOptionRadios()[0])?.innerText || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
    const signature = `${qno}|${qText}|${firstOption}`;
    return signature === "||" ? null : signature;
}

let lastQuestionFingerprint = null;
function isNewQuestion() {
    const current = getQuestionFingerprint();
    if (!current) return false;
    if (current === lastQuestionFingerprint) return false;
    lastQuestionFingerprint = current;
    return true;
}

function readQuestionText() {
    const selectors = [
        '.question-text', 'td.quesText', '#questionDiv',
        '.qtext', 'td[class*="ques"]', '.ques', '[id*="question"]'
    ];
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText.trim().length > 5) return el.innerText.trim();
    }
    return null;
}

function getSignImageBase64() {
    const questionSelectors = ['.question-text', 'td.quesText', '#questionDiv'];
    for (const sel of questionSelectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const img = el.querySelector('img');
        if (img) {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            try {
                ctx.drawImage(img, 0, 0);
                return canvas.toDataURL('image/png').split(',')[1];
            } catch (e) {
                return null;
            }
        }
    }
    return null;
}

function getRealSecondsRemaining() {
    const el = document.getElementById("timer");
    return el ? (parseInt(el.innerHTML) || 30) : 30;
}

function getScoreStats() {
    const TOTAL_QUESTIONS = 15;
    const REQUIRED_CORRECT = 11;

    const bodyText = document.body.innerText || "";
    const scoreMatch = bodyText.match(/(?:Score|स्कोर)\s*[:\s]*(\d+)/i);
    const timerEl = document.getElementById("timer");
    const timerFromDom = timerEl ? parseInt((timerEl.innerText || timerEl.textContent || "").trim(), 10) : NaN;
    const timerTextMatch = bodyText.match(/(?:Time|Timer|समय)\s*[:\s]*(\d{1,2})/i);

    const score = Number.isFinite(parseInt(scoreMatch?.[1] || "", 10))
        ? parseInt(scoreMatch[1], 10)
        : 0;

    const attemptedGuess = (typeof window.pCount !== "undefined" && Number.isFinite(Number(window.pCount)))
        ? Number(window.pCount)
        : null;
    const attempted = attemptedGuess !== null ? attemptedGuess : Math.max(score, 0);

    const wrong = Math.max(0, attempted - score);
    const remaining = Math.max(0, TOTAL_QUESTIONS - attempted);
    const canStillPass = (score + remaining) >= REQUIRED_CORRECT;
    const decision = (wrong >= 5 || !canStillPass) ? "STOP" : "CONTINUE";

    const timer = Number.isFinite(timerFromDom)
        ? timerFromDom
        : (Number.isFinite(parseInt(timerTextMatch?.[1] || "", 10)) ? parseInt(timerTextMatch[1], 10) : 30);

    const safe = Math.max(0, 4 - wrong);
    const safeColor = decision === "STOP" ? "#f44336" : (safe <= 1 ? "#ff9800" : "#4CAF50");
    return { score, attempted, wrong, remaining, timer, decision, safe, safeColor };
}

function persistLiveStats(stats) {
    try {
        chrome.storage.local.set({
            live_score: stats.score,
            live_wrong: stats.wrong,
            live_timer: stats.timer,
            live_decision: stats.decision
        });
    } catch (_e) {}
}

async function sendMessageSafe(message) {
    try {
        return await chrome.runtime.sendMessage(message);
    } catch (e) {
        console.debug("[MCQ] sendMessage failed:", message?.type, e?.message || e);
        return null;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAnswerFromShowFunction() {
    const res = await sendMessageSafe({ type: "PARSE_SHOW_ANSWER" });
    if (res && (res.ok || res.reason)) {
        return { option: res.option || null, reason: res.reason || (res.ok ? "ok" : "unknown") };
    }
    return { option: null, reason: "phase1_unavailable" };
}

window.MCQ_Scraper = {
    getSettings,
    getOptionRadios,
    getRadioForOption,
    getOptionContainer,
    getQuestionFingerprint,
    isNewQuestion,
    readQuestionText,
    getSignImageBase64,
    getRealSecondsRemaining,
    getScoreStats,
    persistLiveStats,
    sendMessageSafe,
    sleep,
    getAnswerFromShowFunction
};
