import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { authGuard } from "../../lib/auth.js";
import type { AppContext } from "../../lib/context.js";
import { withAudit } from "../../lib/context.js";

const planFeatures: Record<string, { ai: number; captcha: number; features: string[] }> = {
  free: {
    ai: 200,
    captcha: 0,
    features: ["manual_mode", "assisted_mode", "rule_autofill"]
  },
  pro: {
    ai: 5000,
    captcha: 200,
    features: ["manual_mode", "assisted_mode", "automated_mode", "captcha_solver", "sync"]
  },
  enterprise: {
    ai: 50000,
    captcha: 5000,
    features: [
      "manual_mode",
      "assisted_mode",
      "automated_mode",
      "captcha_solver",
      "sync",
      "admin_controls",
      "enterprise_policy"
    ]
  }
};

export const registerSubscriptionRoutes = (app: FastifyInstance, context: AppContext) => {
  const checkoutSchema = z.object({
    plan: z.enum(["pro", "enterprise"]),
    billingCycle: z.enum(["monthly", "yearly"]).default("monthly")
  });

  const billingEventSchema = z.object({
    eventId: z.string().min(1),
    eventType: z.enum(["subscription.activated", "subscription.renewed", "subscription.canceled"]),
    userId: z.string().uuid(),
    plan: z.enum(["free", "pro", "enterprise"]),
    occurredAt: z.string().datetime(),
    metadata: z.record(z.string(), z.unknown()).optional()
  });

  const verifyWebhookSignature = (payload: string, signatureHeader: string | undefined): boolean => {
    if (!signatureHeader) return false;
    const secret = process.env.BILLING_WEBHOOK_SECRET;
    if (!secret) return false;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const provided = signatureHeader.trim();
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  };

  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/subscription") && !request.url.startsWith("/subscription/billing/webhook")) {
      await authGuard(request, reply);
    }
  });

  app.get("/subscription", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const subscription = await context.store.getSubscription(auth.userId);
    if (!subscription) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "Subscription not found" });
    }
    return reply.send(subscription);
  });

  app.post("/subscription/upgrade/:plan", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const plan = (request.params as { plan: "free" | "pro" | "enterprise" }).plan;
    const config = planFeatures[plan];
    if (!config) {
      return reply.status(400).send({ code: "INVALID_PLAN", message: "Unsupported plan" });
    }

    const updated = await context.store.upsertSubscription({
      userId: auth.userId,
      plan,
      aiQuotaRemaining: config.ai,
      captchaQuotaRemaining: config.captcha,
      features: config.features
    });

    withAudit(app, context, {
      userId: auth.userId,
      actor: "user",
      action: "subscription.upgrade",
      metadata: { plan }
    });

    return reply.send(updated);
  });

  app.post("/subscription/billing/checkout", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const parsed = checkoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: "INVALID_BODY", message: parsed.error.message });
    }

    const sessionId = `bill_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
    const checkoutUrl = `https://billing.example.local/checkout/${sessionId}`;

    withAudit(app, context, {
      userId: auth.userId,
      actor: "billing_service",
      action: "billing.checkout_created",
      metadata: {
        sessionId,
        plan: parsed.data.plan,
        billingCycle: parsed.data.billingCycle
      }
    });

    return reply.send({
      sessionId,
      checkoutUrl,
      plan: parsed.data.plan,
      billingCycle: parsed.data.billingCycle
    });
  });

  app.post("/subscription/billing/webhook", async (request, reply) => {
    const rawBody = JSON.stringify(request.body ?? {});
    const signature = request.headers["x-billing-signature"];
    const signatureValue = Array.isArray(signature) ? signature[0] : signature;
    if (!verifyWebhookSignature(rawBody, signatureValue)) {
      return reply.status(401).send({ code: "INVALID_SIGNATURE", message: "Invalid webhook signature" });
    }

    const parsed = billingEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: "INVALID_BODY", message: parsed.error.message });
    }

    const event = parsed.data;
    const config = planFeatures[event.plan];
    if (!config) {
      return reply.status(400).send({ code: "INVALID_PLAN", message: "Unsupported plan in webhook" });
    }

    if (event.eventType === "subscription.canceled") {
      await context.store.upsertSubscription({
        userId: event.userId,
        plan: "free",
        aiQuotaRemaining: planFeatures.free.ai,
        captchaQuotaRemaining: planFeatures.free.captcha,
        features: planFeatures.free.features
      });
    } else {
      await context.store.upsertSubscription({
        userId: event.userId,
        plan: event.plan,
        aiQuotaRemaining: config.ai,
        captchaQuotaRemaining: config.captcha,
        features: config.features
      });
    }

    withAudit(app, context, {
      userId: event.userId,
      actor: "billing_webhook",
      action: "billing.webhook_applied",
      metadata: {
        eventId: event.eventId,
        eventType: event.eventType,
        plan: event.plan,
        occurredAt: event.occurredAt,
        metadata: event.metadata ?? {}
      }
    });

    return reply.send({ accepted: true });
  });
};
