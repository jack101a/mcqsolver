import type { FastifyInstance } from "fastify";
import { authGuard } from "../../lib/auth.js";
import type { AppContext } from "../../lib/context.js";

const ensureAdmin = async (userId: string, context: AppContext): Promise<boolean> => {
  const subscription = await context.store.getSubscription(userId);
  return subscription?.plan === "enterprise";
};

export const registerAdminRoutes = (app: FastifyInstance, context: AppContext) => {
  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/admin")) {
      await authGuard(request, reply);
      const auth = (request as typeof request & { auth: { userId: string } }).auth;
      if (!(await ensureAdmin(auth.userId, context))) {
        return reply.status(403).send({ code: "ADMIN_ONLY", message: "Enterprise admin required" });
      }
    }
  });

  app.get("/admin/stats", async (_request, reply) => reply.send(await context.store.getStats()));

  app.get("/admin/audit", async (request, reply) => {
    const query = request.query as {
      userId?: string;
      actor?: string;
      action?: string;
      limit?: string;
    };
    const limit = query.limit ? Number(query.limit) : undefined;
    const events = await context.store.listAuditEvents({
      userId: query.userId,
      actor: query.actor,
      action: query.action,
      limit: Number.isFinite(limit) ? limit : undefined
    });
    return reply.send({ events });
  });

  app.get("/admin/alerts", async (request, reply) => {
    const query = request.query as {
      status?: "open" | "acknowledged";
      type?: "rate_limit_spike" | "execution_failure" | "execution_degraded";
      severity?: "low" | "medium" | "high";
      source?: string;
      userId?: string;
      limit?: string;
    };
    const limit = query.limit ? Number(query.limit) : undefined;
    const alerts = await context.store.listAlerts({
      status: query.status,
      type: query.type,
      severity: query.severity,
      source: query.source,
      userId: query.userId,
      limit: Number.isFinite(limit) ? limit : undefined
    });
    return reply.send({ alerts });
  });

  app.post("/admin/alerts/:id/ack", async (request, reply) => {
    const params = request.params as { id: string };
    const alert = await context.store.acknowledgeAlert(params.id);
    if (!alert) {
      return reply.status(404).send({ code: "ALERT_NOT_FOUND", message: "Alert not found" });
    }
    return reply.send(alert);
  });

  app.get("/admin/insights/incidents", async (request, reply) => {
    const query = request.query as { windowMinutes?: string };
    const windowMinutes = query.windowMinutes ? Number(query.windowMinutes) : 60;
    const safeWindow = Number.isFinite(windowMinutes) ? Math.max(5, Math.min(24 * 60, windowMinutes)) : 60;
    const createdAfter = new Date(Date.now() - safeWindow * 60 * 1000).toISOString();
    const alerts = await context.store.listAlerts({
      createdAfter,
      limit: 1000
    });

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let openCount = 0;
    let acknowledgedCount = 0;

    for (const alert of alerts) {
      byType[alert.type] = (byType[alert.type] ?? 0) + 1;
      bySeverity[alert.severity] = (bySeverity[alert.severity] ?? 0) + 1;
      bySource[alert.source] = (bySource[alert.source] ?? 0) + 1;
      if (alert.status === "open") {
        openCount += 1;
      } else {
        acknowledgedCount += 1;
      }
    }

    return reply.send({
      windowMinutes: safeWindow,
      totalAlerts: alerts.length,
      openCount,
      acknowledgedCount,
      byType,
      bySeverity,
      bySource
    });
  });

  app.get("/admin/insights/incidents/trends", async (request, reply) => {
    const query = request.query as { windowHours?: string };
    const windowHours = query.windowHours ? Number(query.windowHours) : 24;
    const safeWindow = Number.isFinite(windowHours) ? Math.max(1, Math.min(24 * 14, windowHours)) : 24;
    const since = new Date(Date.now() - safeWindow * 60 * 60 * 1000);
    since.setUTCMinutes(0, 0, 0);
    const metrics = await context.store.listIncidentMetrics(since.toISOString());
    return reply.send({
      windowHours: safeWindow,
      points: metrics
    });
  });

  app.post("/admin/insights/incidents/rebuild", async (_request, reply) => {
    const alerts = await context.store.listAlerts({
      limit: 100_000
    });
    await context.store.resetIncidentMetrics();
    for (const alert of alerts) {
      const bucketDate = new Date(alert.createdAt);
      bucketDate.setUTCMinutes(0, 0, 0);
      await context.store.incrementIncidentMetric({
        bucketStart: bucketDate.toISOString(),
        type: alert.type,
        severity: alert.severity,
        source: alert.source,
        count: 1
      });
    }
    return reply.send({
      rebuilt: true,
      processedAlerts: alerts.length
    });
  });
};
