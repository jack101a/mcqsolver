// download_assets.js — Downloads Tesseract.js v5 assets into extension/assets/
const https = require('https');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, 'extension', 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

const FILES = [
    // Tesseract.js v5 — main library (loaded as content script)
    {
        url: 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js',
        dest: 'tesseract.min.js'
    },
    // Tesseract.js v5 — worker (blob-loaded internally by the lib)
    {
        url: 'https://unpkg.com/tesseract.js@5/dist/worker.min.js',
        dest: 'worker.min.js'
    },
    // Tesseract core WASM wrapper for v5
    {
        url: 'https://unpkg.com/tesseract.js-core@5/tesseract-core-simd.wasm.js',
        dest: 'tesseract-core-simd.wasm.js'
    },
    // Traineddata (kept local so no 12MB CDN download on every exam)
    {
        url: 'https://github.com/naptha/tessdata/raw/gh-pages/4.0.0_best/eng.traineddata.gz',
        dest: 'eng.traineddata.gz'
    },
    {
        url: 'https://github.com/naptha/tessdata/raw/gh-pages/4.0.0_best/hin.traineddata.gz',
        dest: 'hin.traineddata.gz'
    },
];

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const fullDest = path.join(ASSETS_DIR, dest);
        const file = fs.createWriteStream(fullDest);
        const get = (u) => {
            const parsedUrl = new URL(u);
            https.get(u, { headers: { 'User-Agent': 'node' } }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    const loc = res.headers.location;
                    const next = loc.startsWith('http') ? loc : `${parsedUrl.protocol}//${parsedUrl.host}${loc}`;
                    get(next);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} for ${u}`));
                    return;
                }
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    const size = fs.statSync(fullDest).size;
                    console.log(`[OK] ${dest} (${(size/1024).toFixed(1)} KB)`);
                    resolve();
                });
            }).on('error', reject);
        };
        get(url);
    });
}

(async () => {
    console.log('Downloading Tesseract.js v5 assets...\n');
    for (const f of FILES) {
        try {
            await download(f.url, f.dest);
        } catch (e) {
            console.error(`[FAIL] ${f.dest}: ${e.message}`);
        }
    }
    console.log('\nDone.');
})();
