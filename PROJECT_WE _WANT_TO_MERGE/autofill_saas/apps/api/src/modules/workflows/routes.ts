import { createWorkflowRequestSchema } from "@autofill/schemas";
import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { authGuard } from "../../lib/auth.js";
import type { AppContext } from "../../lib/context.js";
import { withAudit } from "../../lib/context.js";

export const registerWorkflowRoutes = (app: FastifyInstance, context: AppContext) => {
  const modeFeatureMap: Record<"manual" | "assisted" | "automated", string> = {
    manual: "manual_mode",
    assisted: "assisted_mode",
    automated: "automated_mode"
  };

  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/workflows")) {
      await authGuard(request, reply);
    }
  });

  app.get("/workflows", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const workflows = await context.store.listWorkflowsByUser(auth.userId);
    return reply.send({ workflows });
  });

  app.post("/workflows", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const parsed = createWorkflowRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: "INVALID_BODY", message: parsed.error.message });
    }

    const subscription = await context.store.getSubscription(auth.userId);
    if (!subscription) {
      return reply.status(403).send({ code: "NO_SUBSCRIPTION", message: "No active subscription" });
    }
    const requiredFeature = modeFeatureMap[parsed.data.executionMode];
    if (!subscription.features.includes(requiredFeature)) {
      return reply.status(403).send({
        code: "MODE_NOT_ALLOWED",
        message: `Workflow mode ${parsed.data.executionMode} is not allowed on current plan`
      });
    }

    const id = uuidv4();
    const workflow = {
      id,
      userId: auth.userId,
      name: parsed.data.name,
      description: parsed.data.description,
      sitePattern: parsed.data.sitePattern,
      executionMode: parsed.data.executionMode,
      steps: parsed.data.steps,
      version: 1,
      createdAt: new Date().toISOString()
    };

    await context.store.createWorkflow(workflow);
    withAudit(app, context, {
      userId: auth.userId,
      actor: "user",
      action: "workflow.create",
      metadata: { workflowId: id, stepCount: workflow.steps.length }
    });

    return reply.status(201).send(workflow);
  });
};
