function getTopViewportOffset() {
    let x = 0;
    let y = 0;
    let w = window;
    try {
        while (w !== w.top) {
            const frameEl = w.frameElement;
            if (!frameEl) break;
            const fr = frameEl.getBoundingClientRect();
            x += fr.left;
            y += fr.top;
            w = w.parent;
        }
    } catch (_e) {
        // If cross-origin blocks traversal, fallback to local frame coordinates.
    }
    return { x, y };
}

function getCaptureBoundsPx() {
    const dpr = window.devicePixelRatio || 1;
    let vw = window.innerWidth;
    let vh = window.innerHeight;
    try {
        vw = window.top.innerWidth || vw;
        vh = window.top.innerHeight || vh;
    } catch (_e) {}
    return { maxX: Math.round(vw * dpr), maxY: Math.round(vh * dpr) };
}

function getRectOf(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const offset = getTopViewportOffset();
    const dpr = window.devicePixelRatio || 1;
    return { 
        x: Math.round((r.left + offset.x) * dpr), 
        y: Math.round((r.top + offset.y) * dpr), 
        w: Math.round(r.width * dpr), 
        h: Math.round(r.height * dpr) 
    };
}

function getFocusPanelRect(questionEl, optionRects) {
    const dpr = window.devicePixelRatio || 1;
    const candidates = [];
    const push = (el) => { if (el && !candidates.includes(el)) candidates.push(el); };

    push(questionEl ? questionEl.closest('.panel-body') : null);
    push(document.querySelector('.panel-body'));
    push(document.querySelector('.class-panel .panel-body'));
    push(document.querySelector('.class-panel-body'));
    push(document.querySelector('.question-panel .panel-body'));
    push(document.querySelector('.exam-panel .panel-body'));
    push(questionEl ? questionEl.closest('.panel') : null);
    push(questionEl ? questionEl.parentElement : null);

    let best = null;
    let bestArea = 0;
    for (const c of candidates) {
        const r = c.getBoundingClientRect();
        const area = r.width * r.height;
        if (r.width < 280 || r.height < 180) continue;
        if (area <= 0) continue;
        if (area > bestArea) {
            best = c;
            bestArea = area;
        }
    }
    if (best) return getRectOf(best);

    const qRect = getRectOf(questionEl);
    const rows = (optionRects || []).map(o => o.rect).filter(Boolean);
    if (!qRect && rows.length === 0) return null;

    let minX = qRect ? qRect.x : rows[0].x;
    let minY = qRect ? qRect.y : rows[0].y;
    let maxX = qRect ? (qRect.x + qRect.w) : (rows[0].x + rows[0].w);
    let maxY = qRect ? (qRect.y + qRect.h) : (rows[0].y + rows[0].h);

    rows.forEach(r => {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.w);
        maxY = Math.max(maxY, r.y + r.h);
    });

    const padX = Math.round(20 * dpr);
    const padTop = Math.round(28 * dpr);
    const padBottom = Math.round(36 * dpr);
    minX = Math.max(0, minX - padX);
    minY = Math.max(0, minY - padTop);
    const bounds = getCaptureBoundsPx();
    maxX = Math.min(bounds.maxX, maxX + padX);
    maxY = Math.min(bounds.maxY, maxY + padBottom);

    const w = Math.max(0, maxX - minX);
    const h = Math.max(0, maxY - minY);
    if (w < Math.round(280 * dpr) || h < Math.round(180 * dpr)) return null;
    return { x: minX, y: minY, w, h };
}

function inferQuestionRectFromOptions(options) {
    const rows = (options || []).map(o => o.rect).filter(Boolean);
    if (rows.length < 2) return null;
    const dpr = window.devicePixelRatio || 1;
    const firstY = Math.min(...rows.map(r => r.y));
    const minX = Math.min(...rows.map(r => r.x));
    const maxX = Math.max(...rows.map(r => r.x + r.w));
    const avgH = rows.reduce((a, r) => a + r.h, 0) / rows.length;
    const qH = Math.max(Math.round(80 * dpr), Math.min(Math.round(280 * dpr), Math.round(avgH * 1.35)));
    const qY = Math.max(0, firstY - qH - Math.round(10 * dpr));
    const bounds = getCaptureBoundsPx();
    const qX = Math.max(0, minX);
    const qW = Math.max(0, Math.min(bounds.maxX, maxX) - qX);
    if (qW < Math.round(260 * dpr) || qH < Math.round(50 * dpr)) return null;
    return { x: qX, y: qY, w: qW, h: qH };
}

async function ensureHtml2Canvas(targetWindow, targetDoc) {
    if (targetWindow?.html2canvas) return true;
    return new Promise((resolve) => {
        try {
            const script = targetDoc.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
            script.onload = () => resolve(!!targetWindow?.html2canvas);
            script.onerror = () => resolve(false);
            targetDoc.head.appendChild(script);
        } catch (_e) {
            resolve(false);
        }
    });
}

async function capturePanelBase64() {
    const cfg = { useCORS: true, backgroundColor: "#ffffff", scale: 2 };
    try {
        const iframe = document.querySelector("iframe#stallexam, iframe[name='stallexam']");
        if (iframe) {
            const fwin = iframe.contentWindow;
            const fdoc = iframe.contentDocument || fwin?.document;
            if (fwin && fdoc) {
                const ok = await ensureHtml2Canvas(fwin, fdoc);
                if (ok) {
                    const panel = fdoc.querySelector("div.panel-body");
                    if (panel) {
                        const canvas = await fwin.html2canvas(panel, cfg);
                        return canvas.toDataURL("image/png").split(",")[1];
                    }
                }
            }
        }
    } catch (_e) {}

    try {
        const panel = document.querySelector("div.panel-body");
        if (!panel) return null;
        const ok = await ensureHtml2Canvas(window, document);
        if (!ok) return null;
        const canvas = await window.html2canvas(panel, cfg);
        return canvas.toDataURL("image/png").split(",")[1];
    } catch (_e) {
        return null;
    }
}

function getDomHints() {
    const qSelectors = ['.question-text', 'td.quesText', '#questionDiv', '.qtext', '[id*="question"]'];
    let qEl = null;
    for (const sel of qSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText.trim().length > 5) { qEl = el; break; }
    }
    const signImg = qEl ? qEl.querySelector('img') : null;

    const options = [];
    const radios = window.MCQ_Scraper.getOptionRadios();
    radios.forEach((radio, idx) => {
        const i = idx + 1;
        if (!radio) return;
        const container = window.MCQ_Scraper.getOptionContainer(radio);
        const rect = getRectOf(container);
        if (rect && rect.w > 220 && rect.h > 24) options.push({ num: i, rect });
    });

    const timerEl = document.getElementById("timer");
    const scoreMatch = document.body.innerText.match(/(?:Score|स्कोर)\s*[:\s]*(\d+\.?\d*)/i);
    const focusPanelRect = getFocusPanelRect(qEl, options);
    const questionRect = getRectOf(qEl) || inferQuestionRectFromOptions(options);

    return {
        question_no:   window.currqno || null,
        score:         scoreMatch ? parseFloat(scoreMatch[1]) : null,
        time_left:     timerEl ? (parseInt(timerEl.innerHTML) || 30) : 30,
        focus_panel_rect: focusPanelRect,
        question_rect: questionRect,
        sign_rect:     getRectOf(signImg),
        options:       options.length >= 2 ? options : null
    };
}

window.MCQ_DOMHints = {
    getRectOf,
    getFocusPanelRect,
    capturePanelBase64,
    getDomHints
};
