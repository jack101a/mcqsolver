import { captchaRequestSchema } from "@autofill/schemas";
import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { authGuard } from "../../lib/auth.js";
import { ExternalCaptchaProvider, solveCaptchaLocally } from "../../lib/captcha-provider.js";
import type { AppContext } from "../../lib/context.js";
import { withAudit } from "../../lib/context.js";

export const registerCaptchaRoutes = (app: FastifyInstance, context: AppContext) => {
  const externalProvider = new ExternalCaptchaProvider({
    baseUrl: process.env.CAPTCHA_PROVIDER_BASE_URL,
    apiKey: process.env.CAPTCHA_PROVIDER_API_KEY,
    timeoutMs: process.env.CAPTCHA_PROVIDER_TIMEOUT_MS
      ? Number(process.env.CAPTCHA_PROVIDER_TIMEOUT_MS)
      : undefined,
    maxRetries: process.env.CAPTCHA_PROVIDER_MAX_RETRIES
      ? Number(process.env.CAPTCHA_PROVIDER_MAX_RETRIES)
      : undefined
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/captcha")) {
      await authGuard(request, reply);
    }
  });

  app.post("/captcha/solve", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const parsed = captchaRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: "INVALID_BODY", message: parsed.error.message });
    }

    const subscription = await context.store.getSubscription(auth.userId);
    if (!subscription) {
      return reply.status(403).send({ code: "NO_SUBSCRIPTION", message: "No active subscription" });
    }

    if (!subscription.features.includes("captcha_solver")) {
      return reply.status(403).send({
        code: "FEATURE_DISABLED",
        message: "Captcha solving is not enabled for this plan"
      });
    }

    if (subscription.captchaQuotaRemaining <= 0) {
      return reply.status(402).send({
        code: "CAPTCHA_QUOTA_EXHAUSTED",
        message: "Captcha quota exhausted"
      });
    }

    await context.store.decrementCaptchaQuota(auth.userId, 1);

    const localResult = solveCaptchaLocally({
      runId: parsed.data.runId,
      captchaType: parsed.data.captchaType,
      imageBase64: parsed.data.imageBase64
    });

    let selected = localResult;
    let strategy: "local" | "external" | "manual" = "local";
    const attempts: string[] = [`local:${localResult.status}`];

    if (localResult.status !== "solved") {
      const externalResult = await externalProvider.solve({
        runId: parsed.data.runId,
        captchaType: parsed.data.captchaType,
        imageBase64: parsed.data.imageBase64
      });
      attempts.push(`external:${externalResult.status}`);
      if (externalResult.status === "solved" || externalResult.status === "manual_required") {
        selected = externalResult;
        strategy = "external";
      } else {
        strategy = "manual";
      }
    }

    const response = {
      jobId: selected.providerJobId ?? uuidv4(),
      status: strategy === "manual" ? "manual_required" : selected.status,
      answer: strategy === "manual" ? null : selected.answer,
      confidence: strategy === "manual" ? 0.2 : selected.confidence,
      strategy,
      attempts
    };

    withAudit(app, context, {
      userId: auth.userId,
      actor: "captcha_service",
      action: "captcha.solve",
      metadata: {
        runId: parsed.data.runId,
        status: response.status,
        strategy: response.strategy,
        attempts
      }
    });

    return reply.send(response);
  });
};
