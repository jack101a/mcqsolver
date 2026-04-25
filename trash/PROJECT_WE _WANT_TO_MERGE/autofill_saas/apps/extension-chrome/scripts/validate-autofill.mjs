import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(workspaceRoot, "tests", "fixtures");
const defaultContentScript = resolve(workspaceRoot, "src", "content.js");
const reportPath = resolve(workspaceRoot, "tests", "results", "autofill-validation-report.json");
const markdownReportPath = resolve(workspaceRoot, "tests", "results", "autofill-validation-report.md");

const validationThreshold = 0.8;

const fixtureSpecs = [
  {
    id: "job-application",
    filename: "job-application.html",
    url: "https://careers.example.com/apply",
    expectedKeys: ["full_name", "email", "phone"]
  },
  {
    id: "checkout-form",
    filename: "checkout-form.html",
    url: "https://shop.example.com/checkout",
    expectedKeys: ["full_name", "email", "phone"]
  },
  {
    id: "contact-table",
    filename: "contact-table.html",
    url: "https://portal.example.com/contact",
    expectedKeys: ["full_name", "email", "phone"]
  }
];

const profileData = {
  full_name: "Autofill Validation User",
  email: "validation.user@example.test",
  phone: "5551112233"
};

const createChromeStub = (storageState) => {
  const runtimeListeners = [];
  const storageChangeListeners = [];
  const runtime = {
    onMessage: {
      addListener(listener) {
        runtimeListeners.push(listener);
      }
    },
    sendMessage(_message, callback) {
      if (typeof callback === "function") {
        callback({ ok: true });
      }
      return Promise.resolve({ ok: true });
    }
  };

  const storage = {
    local: {
      get(_keys, callback) {
        callback({ ...storageState });
      },
      set(patch, callback) {
        Object.assign(storageState, patch || {});
        if (typeof callback === "function") callback();
      }
    },
    onChanged: {
      addListener(listener) {
        storageChangeListeners.push(listener);
      }
    }
  };

  const dispatchMessage = async (message) =>
    new Promise((resolve) => {
      let settled = false;
      const sendResponse = (response) => {
        settled = true;
        resolve(response);
      };
      for (const listener of runtimeListeners) {
        const maybeAsync = listener(message, {}, sendResponse);
        if (maybeAsync === true) {
          return;
        }
        if (settled) {
          return;
        }
      }
      resolve({ ok: false, error: "no_listener_response" });
    });

  return {
    runtime,
    storage,
    __dispatchMessage: dispatchMessage,
    __emitStorageChanged(changes, areaName = "local") {
      for (const listener of storageChangeListeners) {
        listener(changes, areaName);
      }
    }
  };
};

const uniqueKeyCount = (values) => new Set(values).size;

const intersectCount = (expected, actual) => {
  const actualSet = new Set(actual);
  let count = 0;
  for (const item of expected) {
    if (actualSet.has(item)) count += 1;
  }
  return count;
};

const runFixtureValidation = async (contentScriptSource, fixtureSpec) => {
  const html = await readFile(resolve(fixtureRoot, fixtureSpec.filename), "utf8");
  const dom = new JSDOM(html, {
    url: fixtureSpec.url,
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true
  });

  const storageState = {
    autofillEnabled: true,
    isRecording: false,
    activeProfile: "default",
    autofillSettings: { siteScopeMode: "domainPath" },
    rules: []
  };
  const chromeStub = createChromeStub(storageState);

  dom.window.chrome = chromeStub;
  dom.window.browser = undefined;
  dom.window.crypto = dom.window.crypto || globalThis.crypto;
  let rectIndex = 1;
  dom.window.document.querySelectorAll("*").forEach((node) => {
    node.setAttribute("data-rect-index", String(rectIndex));
    rectIndex += 1;
  });
  if (!dom.window.CSS) {
    dom.window.CSS = {};
  }
  if (typeof dom.window.CSS.escape !== "function") {
    dom.window.CSS.escape = (value) => String(value).replace(/[^a-zA-Z0-9_\-]/g, "\\$&");
  }
  const elementProto = dom.window.HTMLElement?.prototype;
  if (elementProto && !elementProto.__autofillRectPatched) {
    Object.defineProperty(elementProto, "__autofillRectPatched", {
      value: true,
      enumerable: false,
      configurable: false
    });
    elementProto.getBoundingClientRect = function getBoundingClientRect() {
      const index = Number(this.getAttribute("data-rect-index") || "1");
      const top = index * 24;
      return {
        x: 12,
        y: top,
        width: 260,
        height: 20,
        top,
        right: 272,
        bottom: top + 20,
        left: 12,
        toJSON() {
          return this;
        }
      };
    };
  }

  dom.window.eval(contentScriptSource);

  const scanResponse = await chromeStub.__dispatchMessage({ type: "SCAN_FIELDS" });
  if (!scanResponse || !scanResponse.ok) {
    throw new Error(`scan failed for fixture ${fixtureSpec.id}`);
  }

  const fillResponse = await chromeStub.__dispatchMessage({
    type: "FILL_FIELDS",
    payload: { profileData }
  });
  if (!fillResponse || !fillResponse.ok) {
    throw new Error(`fill failed for fixture ${fixtureSpec.id}`);
  }

  const detectedKeys = (scanResponse.fields || []).map((field) => field.mappingKey);
  const expectedCount = uniqueKeyCount(fixtureSpec.expectedKeys);
  const detectedCount = uniqueKeyCount(detectedKeys);
  const matchedCount = intersectCount(fixtureSpec.expectedKeys, detectedKeys);
  const detectionAccuracy = expectedCount ? matchedCount / expectedCount : 0;
  const fillSuccessRate = fillResponse.result.totalPlanned
    ? fillResponse.result.successCount / fillResponse.result.totalPlanned
    : 0;

  return {
    fixtureId: fixtureSpec.id,
    expectedKeys: fixtureSpec.expectedKeys,
    detectedKeys,
    expectedCount,
    detectedCount,
    matchedCount,
    detectionAccuracy: Number(detectionAccuracy.toFixed(4)),
    fillSuccessRate: Number(fillSuccessRate.toFixed(4)),
    fillSummary: {
      totalDetected: fillResponse.result.totalDetected,
      totalPlanned: fillResponse.result.totalPlanned,
      successCount: fillResponse.result.successCount
    },
    passesDetectionGate: detectionAccuracy >= validationThreshold,
    passesFillGate: fillSuccessRate >= validationThreshold
  };
};

const buildMarkdown = (report) => {
  const lines = [];
  lines.push("# Autofill Validation Report");
  lines.push("");
  lines.push(`- Content Script: \`${report.contentScriptPath}\``);
  lines.push(`- Threshold: ${Math.round(validationThreshold * 100)}%`);
  lines.push(`- Generated At: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Websites Tested: ${report.summary.websitesTested}`);
  lines.push(`- Avg Detection Accuracy: ${(report.summary.avgDetectionAccuracy * 100).toFixed(2)}%`);
  lines.push(`- Avg Fill Success Rate: ${(report.summary.avgFillSuccessRate * 100).toFixed(2)}%`);
  lines.push(`- Detection Gate Passed: ${report.summary.detectionGatePassed ? "Yes" : "No"}`);
  lines.push(`- Fill Gate Passed: ${report.summary.fillGatePassed ? "Yes" : "No"}`);
  lines.push("");
  lines.push("## Website Results");
  lines.push("");
  for (const result of report.results) {
    lines.push(`### ${result.fixtureId}`);
    lines.push(`- Detection Accuracy: ${(result.detectionAccuracy * 100).toFixed(2)}%`);
    lines.push(`- Fill Success Rate: ${(result.fillSuccessRate * 100).toFixed(2)}%`);
    lines.push(`- Detection Gate: ${result.passesDetectionGate ? "Pass" : "Fail"}`);
    lines.push(`- Fill Gate: ${result.passesFillGate ? "Pass" : "Fail"}`);
    lines.push(`- Detected Keys: ${result.detectedKeys.join(", ") || "(none)"}`);
    lines.push("");
  }
  return lines.join("\n");
};

const main = async () => {
  const contentScriptArgIndex = process.argv.indexOf("--content-script");
  const contentScriptPath =
    contentScriptArgIndex > -1 && process.argv[contentScriptArgIndex + 1]
      ? resolve(process.cwd(), process.argv[contentScriptArgIndex + 1])
      : defaultContentScript;

  const contentScriptSource = await readFile(contentScriptPath, "utf8");
  const results = [];
  for (const fixture of fixtureSpecs) {
    const result = await runFixtureValidation(contentScriptSource, fixture);
    results.push(result);
  }

  const avgDetectionAccuracy =
    results.reduce((sum, item) => sum + item.detectionAccuracy, 0) / Math.max(1, results.length);
  const avgFillSuccessRate =
    results.reduce((sum, item) => sum + item.fillSuccessRate, 0) / Math.max(1, results.length);
  const detectionGatePassed = avgDetectionAccuracy >= validationThreshold;
  const fillGatePassed = avgFillSuccessRate >= validationThreshold;

  const report = {
    generatedAt: new Date().toISOString(),
    contentScriptPath,
    threshold: validationThreshold,
    results,
    summary: {
      websitesTested: results.length,
      avgDetectionAccuracy: Number(avgDetectionAccuracy.toFixed(4)),
      avgFillSuccessRate: Number(avgFillSuccessRate.toFixed(4)),
      detectionGatePassed,
      fillGatePassed
    }
  };

  await mkdir(resolve(workspaceRoot, "tests", "results"), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(markdownReportPath, buildMarkdown(report), "utf8");

  process.stdout.write(JSON.stringify(report.summary, null, 2));
  process.stdout.write("\n");

  if (!detectionGatePassed || !fillGatePassed) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error("autofill validation failed", error);
  process.exitCode = 1;
});
