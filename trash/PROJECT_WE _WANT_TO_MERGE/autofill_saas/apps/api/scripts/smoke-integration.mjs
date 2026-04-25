import { createHmac } from "node:crypto";
import { buildApp } from "../dist/app.js";

const assertOk = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const parseJson = async (response) => {
  const payload = await response.json();
  return payload;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  process.env.BILLING_WEBHOOK_SECRET = process.env.BILLING_WEBHOOK_SECRET || "smoke-secret";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "smoke-jwt-secret";

  const app = buildApp();
  await app.ready();

  const unique = Date.now().toString(36);
  const email = `smoke_${unique}@example.test`;
  const password = "SmokePass123!";

  try {
    const registerResponse = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email,
        password,
        fullName: "Smoke Runner",
        deviceName: "smoke-device"
      }
    });
    assertOk(registerResponse.statusCode === 201, "register failed");
    const registerPayload = await parseJson(registerResponse);
    const accessToken = registerPayload.tokens.accessToken;
    const userId = registerPayload.user.id;

    const authHeaders = { authorization: `Bearer ${accessToken}` };

    const upgradeResponse = await app.inject({
      method: "POST",
      url: "/subscription/upgrade/pro",
      headers: authHeaders
    });
    assertOk(upgradeResponse.statusCode === 200, "subscription upgrade failed");

    const profileResponse = await app.inject({
      method: "POST",
      url: "/profiles",
      headers: authHeaders,
      payload: {
        name: "Smoke Profile",
        locale: "en-US",
        fields: [
          { key: "full_name", value: "Smoke User", sensitivity: "standard" },
          { key: "email", value: "smoke.user@example.test", sensitivity: "standard" },
          { key: "phone", value: "5551001000", sensitivity: "standard" }
        ]
      }
    });
    assertOk(profileResponse.statusCode === 201, "profile create failed");
    const profile = await parseJson(profileResponse);

    const workflowResponse = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders,
      payload: {
        name: "Smoke Workflow",
        description: "smoke",
        sitePattern: "example.test/form",
        executionMode: "assisted",
        steps: [
          { id: "s1", type: "navigate", config: { url: "https://example.test/form" } },
          { id: "s2", type: "autofill", config: { requiredFields: ["full_name", "email"] } },
          { id: "s3", type: "confirm", config: {} },
          { id: "s4", type: "end", config: {} }
        ]
      }
    });
    assertOk(workflowResponse.statusCode === 201, "workflow create failed");
    const workflow = await parseJson(workflowResponse);

    const runResponse = await app.inject({
      method: "POST",
      url: "/execution/runs",
      headers: authHeaders,
      payload: {
        workflowId: workflow.id,
        inputProfileId: profile.id
      }
    });
    assertOk(runResponse.statusCode === 201, "run create failed");
    const runCreated = await parseJson(runResponse);

    await sleep(2200);

    const runsResponse = await app.inject({
      method: "GET",
      url: "/execution/runs",
      headers: authHeaders
    });
    assertOk(runsResponse.statusCode === 200, "list runs failed");
    const runsPayload = await parseJson(runsResponse);
    const currentRun = runsPayload.runs.find((item) => item.id === runCreated.id);
    assertOk(Boolean(currentRun), "run not found after worker tick");

    if (currentRun.status === "waiting_confirmation") {
      const decisionResponse = await app.inject({
        method: "POST",
        url: `/execution/runs/${currentRun.id}/decision`,
        headers: authHeaders,
        payload: { approved: true, note: "smoke approval" }
      });
      assertOk(decisionResponse.statusCode === 200, "run decision failed");
    }

    const syncPushResponse = await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: { ...authHeaders, "x-device-id": "smoke-device-1" },
      payload: {
        checkpoint: "cp_001",
        payload: {
          profiles: [{ id: "local_profile_a", name: "Local Profile A", updatedAt: new Date().toISOString() }],
          workflows: [{ id: "local_workflow_a", name: "Local Workflow A", updatedAt: new Date().toISOString() }],
          settings: { defaultMode: "assisted", theme: "light" }
        }
      }
    });
    assertOk(syncPushResponse.statusCode === 200, "sync push failed");

    const syncPullResponse = await app.inject({
      method: "GET",
      url: "/sync/pull",
      headers: authHeaders
    });
    assertOk(syncPullResponse.statusCode === 200, "sync pull failed");
    const syncPullPayload = await parseJson(syncPullResponse);
    assertOk(Array.isArray(syncPullPayload.profiles), "sync pull profiles invalid");

    const webhookPayload = {
      eventId: `evt_${unique}`,
      eventType: "subscription.activated",
      userId,
      plan: "enterprise",
      occurredAt: new Date().toISOString(),
      metadata: { source: "smoke" }
    };
    const webhookBody = JSON.stringify(webhookPayload);
    const webhookSig = createHmac("sha256", process.env.BILLING_WEBHOOK_SECRET)
      .update(webhookBody)
      .digest("hex");
    const webhookResponse = await app.inject({
      method: "POST",
      url: "/subscription/billing/webhook",
      headers: {
        "content-type": "application/json",
        "x-billing-signature": webhookSig
      },
      payload: webhookPayload
    });
    assertOk(webhookResponse.statusCode === 200, "billing webhook failed");

    const subResponse = await app.inject({
      method: "GET",
      url: "/subscription",
      headers: authHeaders
    });
    const subPayload = await parseJson(subResponse);
    assertOk(subPayload.plan === "enterprise", "subscription webhook did not apply");

    const captchaResponse = await app.inject({
      method: "POST",
      url: "/captcha/solve",
      headers: authHeaders,
      payload: {
        runId: runCreated.id,
        captchaType: "image_grid"
      }
    });
    assertOk(captchaResponse.statusCode === 200, "captcha solve failed");

    console.log("SMOKE INTEGRATION PASSED");
  } finally {
    await app.close();
  }
};

run().catch((error) => {
  console.error("SMOKE INTEGRATION FAILED", error);
  process.exitCode = 1;
});
