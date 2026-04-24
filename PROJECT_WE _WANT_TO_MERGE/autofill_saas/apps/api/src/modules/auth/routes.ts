import { registerRequestSchema, loginRequestSchema } from "@autofill/schemas";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { createTokens } from "../../lib/auth.js";
import type { AppContext } from "../../lib/context.js";
import { withAudit } from "../../lib/context.js";

export const registerAuthRoutes = (app: FastifyInstance, context: AppContext) => {
  app.post("/auth/register", async (request, reply) => {
    const parsed = registerRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: "INVALID_BODY", message: parsed.error.message });
    }

    const { email, password, fullName, deviceName } = parsed.data;
    const existingUser = await context.store.findUserByEmail(email);
    if (existingUser) {
      return reply.status(409).send({ code: "EMAIL_EXISTS", message: "Email already registered" });
    }

    const userId = uuidv4();
    const user = {
      id: userId,
      email,
      fullName,
      passwordHash: await bcrypt.hash(password, 12),
      createdAt: new Date().toISOString()
    };
    await context.store.createUser(user);

    const deviceId = uuidv4();
    await context.store.createDevice({
      id: deviceId,
      userId,
      deviceName,
      trusted: true,
      createdAt: new Date().toISOString()
    });

    await context.store.upsertSubscription({
      userId,
      plan: "free",
      aiQuotaRemaining: 200,
      captchaQuotaRemaining: 0,
      features: ["manual_mode", "assisted_mode", "rule_autofill"]
    });

    withAudit(app, context, {
      userId,
      actor: "user",
      action: "auth.register",
      metadata: { deviceId }
    });

    return reply.status(201).send({
      user: { id: userId, email, fullName },
      tokens: createTokens({ userId, email })
    });
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: "INVALID_BODY", message: parsed.error.message });
    }

    const { email, password, deviceName } = parsed.data;
    const user = await context.store.findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.status(401).send({ code: "INVALID_CREDENTIALS", message: "Invalid credentials" });
    }

    const deviceId = uuidv4();
    await context.store.createDevice({
      id: deviceId,
      userId: user.id,
      deviceName,
      trusted: true,
      createdAt: new Date().toISOString()
    });

    withAudit(app, context, {
      userId: user.id,
      actor: "user",
      action: "auth.login",
      metadata: { deviceId }
    });

    return reply.send({
      user: { id: user.id, email: user.email, fullName: user.fullName },
      tokens: createTokens({ userId: user.id, email })
    });
  });
};
