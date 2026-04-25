import { createProfileRequestSchema } from "@autofill/schemas";
import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { authGuard } from "../../lib/auth.js";
import type { AppContext } from "../../lib/context.js";
import { withAudit } from "../../lib/context.js";

export const registerProfileRoutes = (app: FastifyInstance, context: AppContext) => {
  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/profiles")) {
      await authGuard(request, reply);
    }
  });

  app.get("/profiles", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const profiles = await context.store.listProfilesByUser(auth.userId);
    return reply.send({ profiles });
  });

  app.post("/profiles", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const parsed = createProfileRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: "INVALID_BODY", message: parsed.error.message });
    }

    const id = uuidv4();
    const profile = {
      id,
      userId: auth.userId,
      name: parsed.data.name,
      locale: parsed.data.locale,
      fields: parsed.data.fields,
      createdAt: new Date().toISOString()
    };
    await context.store.createProfile(profile);

    withAudit(app, context, {
      userId: auth.userId,
      actor: "user",
      action: "profile.create",
      metadata: { profileId: id }
    });

    return reply.status(201).send(profile);
  });
};
