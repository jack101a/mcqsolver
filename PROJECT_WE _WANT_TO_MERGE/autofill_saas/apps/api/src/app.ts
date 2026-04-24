import Fastify from "fastify";
import { createContext } from "./lib/context.js";
import { ExecutionWorker } from "./lib/execution-worker.js";
import { IncidentProjector } from "./lib/incident-projector.js";
import { createRateLimiterBackend, rateLimitGuard } from "./lib/rate-limit.js";
import { registerAdminRoutes } from "./modules/admin/routes.js";
import { registerAiRoutes } from "./modules/ai/routes.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerCaptchaRoutes } from "./modules/captcha/routes.js";
import { registerExecutionRoutes } from "./modules/execution/routes.js";
import { registerProfileRoutes } from "./modules/profiles/routes.js";
import { registerSubscriptionRoutes } from "./modules/subscription/routes.js";
import { registerSyncRoutes } from "./modules/sync/routes.js";
import { registerTelemetryRoutes } from "./modules/telemetry/routes.js";
import { registerWorkflowRoutes } from "./modules/workflows/routes.js";

export const buildApp = () => {
  const app = Fastify({ logger: true });
  const contextPromise = createContext();
  const rateLimiterPromise = createRateLimiterBackend();
  const corsAllowOrigins = (process.env.CORS_ALLOW_ORIGINS ?? "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const resolveOrigin = (originHeader: string | undefined) => {
    if (!originHeader || corsAllowOrigins.includes("*")) {
      return "*";
    }
    if (corsAllowOrigins.includes(originHeader)) {
      return originHeader;
    }
    return "null";
  };

  app.addHook("onRequest", async (request, reply) => {
    const originHeader = request.headers.origin;
    const allowOrigin = resolveOrigin(originHeader);
    reply.header("Access-Control-Allow-Origin", allowOrigin);
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    reply.header(
      "Access-Control-Allow-Headers",
      "Authorization,Content-Type,Idempotency-Key,X-Device-Id,X-Billing-Signature"
    );
    reply.header("Access-Control-Max-Age", "86400");

    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health") {
      return;
    }
    const context = await contextPromise;
    const limiter = await rateLimiterPromise;
    await rateLimitGuard(request, reply, limiter, async (event) => {
      await context.createAlert({
        type: "rate_limit_spike",
        severity: "medium",
        status: "open",
        source: "api.rate_limit",
        message: "Rate limit threshold exceeded",
        metadata: {
          route: event.route,
          ip: event.ip,
          method: event.method,
          resetAt: event.resetAt
        },
        createdAt: new Date().toISOString()
      });
    });
  });

  app.get("/health", async () => ({ status: "ok", service: "autofill-api" }));

  app.register(async (instance) => {
    const context = await contextPromise;
    const projector = new IncidentProjector(context, instance.log);
    projector.register();
    await context.eventBus.start?.();
    const worker = new ExecutionWorker(context, instance.log);
    worker.start();

    registerAuthRoutes(instance, context);
    registerSubscriptionRoutes(instance, context);
    registerProfileRoutes(instance, context);
    registerWorkflowRoutes(instance, context);
    registerExecutionRoutes(instance, context);
    registerAiRoutes(instance, context);
    registerCaptchaRoutes(instance, context);
    registerSyncRoutes(instance, context);
    registerTelemetryRoutes(instance, context);
    registerAdminRoutes(instance, context);

    instance.addHook("onClose", async () => {
      await worker.stop();
      projector.stop();
      await context.eventBus.stop?.();
      const limiter = await rateLimiterPromise;
      await limiter.close?.();
      await context.store.close?.();
    });
  });

  return app;
};
