function updateOverlay(statusText, stats = null, ocrMetadata = null) {
    let overlay = document.getElementById("mcq-solver-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "mcq-solver-overlay";
        Object.assign(overlay.style, {
            position: "fixed", bottom: "15px", right: "15px", zIndex: "2147483647",
            background: "rgba(10, 10, 20, 0.95)", color: "#fff",
            fontFamily: "monospace", fontSize: "12px", padding: "12px",
            borderRadius: "8px", border: "1px solid #4facfe",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)", width: "180px", pointerEvents: "none"
        });
        document.body.appendChild(overlay);
    }

    let content = `<b>🤖 SOLVER PRO v4</b><br><hr style="border:0;border-top:1px solid #333;margin:8px 0;">`;
    content += `<span style="color:#4facfe">${statusText}</span>`;

    if (ocrMetadata) {
        content += `<br><hr style="border:0;border-top:1px solid #333;margin:8px 0;">`;
        content += `<div style="display:flex;justify-content:space-between"><span>OCR QNo:</span> <span>${ocrMetadata.qno || "0"}</span></div>`;
        content += `<div style="display:flex;justify-content:space-between"><span>OCR Score:</span> <span>${ocrMetadata.score || "0.0"}</span></div>`;
    } else if (stats) {
        content += `<br><hr style="border:0;border-top:1px solid #333;margin:8px 0;">`;
        content += `<div style="display:flex;justify-content:space-between"><span>Score:</span> <span>${stats.score}</span></div>`;
        content += `<div style="display:flex;justify-content:space-between"><span>Left:</span> <span>${stats.remaining}</span></div>`;
        content += `<div style="display:flex;justify-content:space-between;color:${stats.safeColor}"><span>Safe Fail:</span> <span><b>${stats.safe}</b></span></div>`;
    }
    
    overlay.innerHTML = content;
}

window.MCQ_UI = {
    updateOverlay
};
