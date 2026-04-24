import { aiMapFieldRequestSchema } from "@autofill/schemas";
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../lib/auth.js";
import { AiFieldMapper } from "../../lib/ai-mapper.js";
import type { AppContext } from "../../lib/context.js";
import { withAudit } from "../../lib/context.js";

export const registerAiRoutes = (app: FastifyInstance, context: AppContext) => {
  const mapper = new AiFieldMapper({
    baseUrl: process.env.AI_MAPPER_BASE_URL,
    apiKey: process.env.AI_MAPPER_API_KEY,
    timeoutMs: process.env.AI_MAPPER_TIMEOUT_MS ? Number(process.env.AI_MAPPER_TIMEOUT_MS) : undefined,
    maxRetries: process.env.AI_MAPPER_MAX_RETRIES ? Number(process.env.AI_MAPPER_MAX_RETRIES) : undefined
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/ai")) {
      await authGuard(request, reply);
    }
  });

  app.post("/ai/map-fields", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const parsed = aiMapFieldRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: "INVALID_BODY", message: parsed.error.message });
    }

    const subscription = await context.store.getSubscription(auth.userId);
    if (!subscription || subscription.aiQuotaRemaining <= 0) {
      return reply.status(402).send({ code: "AI_QUOTA_EXHAUSTED", message: "AI quota exhausted" });
    }

    const quotaRemaining = await context.store.decrementAiQuota(auth.userId, 1);
    const mapped = await mapper.map({
      domain: parsed.data.domain,
      fields: parsed.data.fields
    });

    withAudit(app, context, {
      userId: auth.userId,
      actor: "ai_service",
      action: "ai.map_fields",
      metadata: {
        domain: parsed.data.domain,
        suggestionCount: mapped.suggestions.length,
        modelVersion: mapped.modelVersion,
        source: mapped.source
      }
    });

    return reply.send({
      suggestions: mapped.suggestions,
      quotaRemaining,
      modelVersion: mapped.modelVersion,
      source: mapped.source
    });
  });
};
