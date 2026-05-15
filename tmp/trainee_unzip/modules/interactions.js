async function clickRadio(target) {
    if (!target) return false;
    let optionNumber = null;

    if (!isNaN(target)) {
        optionNumber = parseInt(target);
    } else {
        const targetText = target.trim().toLowerCase().replace(/\s+/g, ' ');
        let maxScore = -1;
        const radios = window.MCQ_Scraper.getOptionRadios();

        for (let i = 1; i <= radios.length; i++) {
            const radio = radios[i - 1];
            if (!radio) continue;
            
            let container = window.MCQ_Scraper.getOptionContainer(radio);
            let text = container.innerText.trim().toLowerCase().replace(/\s+/g, ' ');
            
            if (text.includes(targetText) || targetText.includes(text)) {
                optionNumber = i; break;
            }
            
            let overlap = [...new Set(text.split(' '))].filter(x => targetText.split(' ').includes(x)).length;
            if (overlap > maxScore) { maxScore = overlap; optionNumber = i; }
        }
    }

    if (!optionNumber) return false;

    const radio = window.MCQ_Scraper.getRadioForOption(optionNumber);
    if (!radio) { console.error(`option ${optionNumber} radio not found`); return false; }
    if (radio.disabled) await window.MCQ_Scraper.sleep(1500);
    if (radio.disabled) return false;
    radio.focus();
    if (radio.labels && radio.labels[0]) radio.labels[0].click();
    radio.click();
    radio.checked = true;
    radio.dispatchEvent(new Event("input", { bubbles: true }));
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
}

async function submitAnswer() {
    let btn = document.getElementById("confirmbut")
        || document.getElementById("submitbut")
        || document.getElementById("nextbut")
        || document.getElementById("submitBtn")
        || document.querySelector('button[type="submit"], input[type="submit"]');

    if (!btn) {
        const candidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
        btn = candidates.find(el => {
            const t = ((el.innerText || el.value || "") + "").trim().toLowerCase();
            return t.includes("confirm") || t.includes("submit") || t.includes("next") || t.includes("पुष्टि");
        }) || null;
    }

    if (!btn) {
        const form = document.StallExam || document.querySelector('form[name="StallExam"]') || document.querySelector('form');
        if (form && typeof form.submit === "function") { form.submit(); return; }
        return;
    }
    let waited = 0;
    while (btn.disabled && waited < 8000) {
        await window.MCQ_Scraper.sleep(300);
        waited += 300;
    }
    btn.focus();
    btn.click();
}

window.MCQ_Interactions = {
    clickRadio,
    submitAnswer
};
