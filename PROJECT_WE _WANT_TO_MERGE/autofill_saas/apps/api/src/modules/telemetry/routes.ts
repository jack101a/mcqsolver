import type { FastifyInstance } from "fastify";
import { authGuard } from "../../lib/auth.js";
import type { AppContext } from "../../lib/context.js";

export const registerTelemetryRoutes = (app: FastifyInstance, context: AppContext) => {
  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/telemetry")) {
      await authGuard(request, reply);
    }
  });

  app.post("/telemetry/events", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const body = (request.body ?? {}) as Record<string, unknown>;
    await context.store.appendTelemetry({
      userId: auth.userId,
      ...body,
      timestamp: new Date().toISOString()
    });
    return reply.status(202).send({ accepted: true });
  });
};
