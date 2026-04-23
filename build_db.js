// Build script: generates extension/database.js from questions.json
const fs = require('fs');
const path = require('path');

const questions = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');

const signHashDict = `
const SIGN_HASH_DICT = {
    // Populate with actual hashes from console logs during first run.
    // Format: "hex_hash_string": "sign_label_name"
    // Example: "a1b2c3d4...": "sign_compulsory_turn_left"
};
`;

const output = `// ═══════════════════════════════════════════════════════════════
// database.js — Sarathi STALL Solver Question DB & Sign Hashes
// Auto-generated from questions.json
// Total entries: ${JSON.parse(questions).length}
// ═══════════════════════════════════════════════════════════════

const EXAM_DB = ${questions.trim()};

${signHashDict}
`;

const outPath = path.join(__dirname, 'extension', 'database.js');
fs.writeFileSync(outPath, output, 'utf8');
console.log('database.js written to', outPath, '— entries:', JSON.parse(questions).length);
