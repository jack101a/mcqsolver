const checks = [];

const addCheck = (name, passed, details, severity = "error") => {
  checks.push({ name, passed, details, severity });
};

const isNonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

const jwtSecret = process.env.JWT_SECRET;
addCheck(
  "JWT secret configured",
  isNonEmpty(jwtSecret) && jwtSecret !== "replace-this-secret-in-production",
  isNonEmpty(jwtSecret)
    ? jwtSecret === "replace-this-secret-in-production"
      ? "JWT_SECRET is default value and must be rotated for production."
      : "JWT_SECRET appears configured."
    : "JWT_SECRET is missing.",
  "error"
);

const billingSecret = process.env.BILLING_WEBHOOK_SECRET;
addCheck(
  "Billing webhook secret configured",
  isNonEmpty(billingSecret),
  isNonEmpty(billingSecret)
    ? "BILLING_WEBHOOK_SECRET appears configured."
    : "BILLING_WEBHOOK_SECRET missing. Billing webhook signature verification will reject all webhooks.",
  "error"
);

const dataStoreBackend = process.env.DATA_STORE_BACKEND ?? "memory";
addCheck(
  "Persistent datastore backend",
  dataStoreBackend === "postgres",
  dataStoreBackend === "postgres"
    ? "Using postgres datastore backend."
    : `Using "${dataStoreBackend}" backend. In-memory backend is not production-safe.`,
  "error"
);

const databaseUrl = process.env.DATABASE_URL;
addCheck(
  "Database URL configured for postgres backend",
  dataStoreBackend !== "postgres" || isNonEmpty(databaseUrl),
  dataStoreBackend !== "postgres"
    ? "Not required when postgres backend is disabled."
    : isNonEmpty(databaseUrl)
      ? "DATABASE_URL present."
      : "DATABASE_URL missing for postgres backend.",
  "error"
);

const corsOrigins = process.env.CORS_ALLOW_ORIGINS ?? "*";
const corsIsWildcard = corsOrigins.split(",").map((v) => v.trim()).includes("*");
addCheck(
  "CORS allowlist hardened",
  !corsIsWildcard,
  corsIsWildcard
    ? "CORS_ALLOW_ORIGINS includes wildcard '*'. Restrict allowed origins for production."
    : `CORS_ALLOW_ORIGINS=${corsOrigins}`,
  "warning"
);

const aiApiKey = process.env.AI_MAPPER_API_KEY;
addCheck(
  "AI mapper API key configured",
  isNonEmpty(aiApiKey),
  isNonEmpty(aiApiKey)
    ? "AI mapper key configured."
    : "AI mapper key not configured. Service will fallback to local heuristic mapper.",
  "warning"
);

const captchaApiKey = process.env.CAPTCHA_PROVIDER_API_KEY;
addCheck(
  "CAPTCHA provider API key configured",
  isNonEmpty(captchaApiKey),
  isNonEmpty(captchaApiKey)
    ? "CAPTCHA provider key configured."
    : "CAPTCHA provider key not configured. Service will fallback to manual flow when local solve fails.",
  "warning"
);

const errorCount = checks.filter((c) => !c.passed && c.severity === "error").length;
const warningCount = checks.filter((c) => !c.passed && c.severity === "warning").length;

for (const check of checks) {
  const mark = check.passed ? "PASS" : check.severity === "warning" ? "WARN" : "FAIL";
  console.log(`[${mark}] ${check.name} - ${check.details}`);
}

console.log("");
console.log(
  JSON.stringify(
    {
      checks: checks.length,
      failed: errorCount,
      warnings: warningCount
    },
    null,
    2
  )
);

if (errorCount > 0) {
  process.exitCode = 1;
}
