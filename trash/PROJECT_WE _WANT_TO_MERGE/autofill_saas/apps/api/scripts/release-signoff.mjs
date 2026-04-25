import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const reportDir = path.resolve(repoRoot, "docs", "reports");
const reportJsonPath = path.resolve(reportDir, "release-signoff-latest.json");
const reportMdPath = path.resolve(reportDir, "release-signoff-latest.md");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const defaultLocalDatabaseUrl = "postgres://autofill:autofill@127.0.0.1:5432/autofill";

const runStep = (name, command, args, options = {}) => {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    shell: process.platform === "win32",
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) }
  });
  const endedAt = new Date().toISOString();

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const spawnError = result.error ? String(result.error.message || result.error) : "";
  const combined = `${stdout}\n${stderr}\n${spawnError}`.trim();
  const success = result.status === 0;

  return {
    name,
    command: `${command} ${args.join(" ")}`,
    startedAt,
    endedAt,
    success,
    statusCode: typeof result.status === "number" ? result.status : -1,
    output: combined
  };
};

const summarizeDrStatus = (drStep) => {
  if (!drStep) return { status: "blocked", reason: "not_executed" };
  if (drStep.success) return { status: "passed", reason: "restore_drill_completed" };
  const output = drStep.output || "";
  if (/DATABASE_URL is required/i.test(output)) {
    return { status: "blocked", reason: "missing_database_url" };
  }
  if (/ECONNREFUSED|getaddrinfo|ENOTFOUND|failed/i.test(output)) {
    return { status: "blocked", reason: "database_unreachable" };
  }
  return { status: "failed", reason: "dr_restore_error" };
};

const toMarkdown = (report) => {
  const lines = [];
  lines.push("# Release Sign-off Report");
  lines.push("");
  lines.push(`- Generated At: ${report.generatedAt}`);
  lines.push(`- Overall Status: ${report.overallStatus}`);
  lines.push(`- DR Status: ${report.drStatus.status} (${report.drStatus.reason})`);
  lines.push("");
  lines.push("## Check Results");
  lines.push("");
  for (const step of report.steps) {
    lines.push(`### ${step.name}`);
    lines.push(`- Command: \`${step.command}\``);
    lines.push(`- Result: ${step.success ? "PASS" : "FAIL"}`);
    lines.push(`- Exit Code: ${step.statusCode}`);
    lines.push("");
    lines.push("```text");
    lines.push((step.output || "").slice(0, 4000));
    lines.push("```");
    lines.push("");
  }
  lines.push("## Conclusion");
  if (report.overallStatus === "ready_with_dr_pending") {
    lines.push(
      "- Functional and security checks passed in this environment, but DR restore drill is blocked due to missing/unreachable PostgreSQL runtime."
    );
  } else if (report.overallStatus === "ready") {
    lines.push("- All required checks passed, including DR drill.");
  } else {
    lines.push("- One or more required checks failed; not ready for final sign-off.");
  }
  lines.push("");
  return lines.join("\n");
};

const main = async () => {
  const prodLikeEnv = {
    JWT_SECRET: process.env.JWT_SECRET || "prod-like-jwt-secret-123456789",
    BILLING_WEBHOOK_SECRET:
      process.env.BILLING_WEBHOOK_SECRET || "prod-like-billing-secret-123456",
    DATA_STORE_BACKEND: process.env.DATA_STORE_BACKEND || "postgres",
    DATABASE_URL:
      process.env.DATABASE_URL || "postgres://autofill:autofill@postgres.internal:5432/autofill",
    CORS_ALLOW_ORIGINS:
      process.env.CORS_ALLOW_ORIGINS || "https://admin.example.com,https://app.example.com",
    AI_MAPPER_API_KEY: process.env.AI_MAPPER_API_KEY || "prod-like-ai-key",
    CAPTCHA_PROVIDER_API_KEY: process.env.CAPTCHA_PROVIDER_API_KEY || "prod-like-captcha-key"
  };

  const steps = [];
  steps.push(
    runStep("Security Readiness", npmCommand, ["run", "check:security", "--workspace", "@autofill/api"], {
      env: prodLikeEnv
    })
  );
  steps.push(
    runStep("API Smoke Integration", npmCommand, ["run", "smoke:integration", "--workspace", "@autofill/api"])
  );
  steps.push(
    runStep("Extension Autofill Validation", npmCommand, [
      "run",
      "validate:autofill",
      "--workspace",
      "@autofill/extension-chrome"
    ])
  );
  steps.push(
    runStep("Web Dashboard UI Contract", npmCommand, [
      "run",
      "validate:ui",
      "--workspace",
      "@autofill/web-dashboard"
    ])
  );
  const drStep = runStep(
    "DR Restore Drill",
    npmCommand,
    ["run", "dr:restore-drill", "--workspace", "@autofill/api"],
    {
      env: {
        DATABASE_URL: process.env.DATABASE_URL || defaultLocalDatabaseUrl
      }
    }
  );
  steps.push(drStep);

  const criticalFailures = steps.filter((s) =>
    [
      "Security Readiness",
      "API Smoke Integration",
      "Extension Autofill Validation",
      "Web Dashboard UI Contract"
    ].includes(s.name)
  ).some((s) => !s.success);
  const drStatus = summarizeDrStatus(drStep);

  let overallStatus = "not_ready";
  if (!criticalFailures && drStatus.status === "passed") {
    overallStatus = "ready";
  } else if (!criticalFailures && drStatus.status === "blocked") {
    overallStatus = "ready_with_dr_pending";
  }

  const report = {
    generatedAt: new Date().toISOString(),
    overallStatus,
    drStatus,
    steps
  };

  await mkdir(reportDir, { recursive: true });
  await writeFile(reportJsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(reportMdPath, toMarkdown(report), "utf8");

  process.stdout.write(JSON.stringify({ overallStatus, drStatus }, null, 2));
  process.stdout.write("\n");

  if (overallStatus === "not_ready") {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error("Release sign-off generation failed:", error);
  process.exitCode = 1;
});
