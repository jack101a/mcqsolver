import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const htmlPath = path.resolve(appRoot, "src", "index.html");
const jsPath = path.resolve(appRoot, "src", "main.js");

const html = await readFile(htmlPath, "utf8");
const js = await readFile(jsPath, "utf8");

const idRegex = /\sid="([^"]+)"/g;
const usedIdRegex = /getElementById\("([^"]+)"\)/g;

const definedIds = new Set();
const usedIds = new Set();

let match;
while ((match = idRegex.exec(html)) !== null) {
  definedIds.add(match[1]);
}

while ((match = usedIdRegex.exec(js)) !== null) {
  usedIds.add(match[1]);
}

const missing = [...usedIds].filter((id) => !definedIds.has(id));
if (missing.length > 0) {
  process.stderr.write(`UI contract check failed. Missing IDs in HTML: ${missing.join(", ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`UI contract check passed. ${usedIds.size} JS bindings are present in HTML.\n`);
}
