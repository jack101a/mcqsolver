import { runWorkflowRequestSchema } from "@autofill/schemas";
import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { authGuard } from "../../lib/auth.js";
import type { AppContext } from "../../lib/context.js";
import { withAudit } from "../../lib/context.js";
import { idempotencyStore } from "../../lib/idempotency.js";
import type { RunRecord } from "../../lib/types.js";

export const registerExecutionRoutes = (app: FastifyInstance, context: AppContext) => {
  const modeFeatureMap: Record<RunRecord["mode"], string> = {
    manual: "manual_mode",
    assisted: "assisted_mode",
    automated: "automated_mode"
  };

  const runDecisionSchema = z.object({
    approved: z.boolean(),
    note: z.string().max(500).optional()
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/execution")) {
      await authGuard(request, reply);
    }
  });

  app.get("/execution/runs", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const runs = await context.store.listRunsByUser(auth.userId);
    return reply.send({ runs });
  });

  app.post("/execution/runs", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const idemKeyHeader = request.headers["idempotency-key"];
    const idempotencyKey = Array.isArray(idemKeyHeader) ? idemKeyHeader[0] : idemKeyHeader;
    const bodyHash = idempotencyStore.computeBodyHash(request.body);
    if (idempotencyKey) {
      const existing = idempotencyStore.get(
        `${auth.userId}:execution.runs:${idempotencyKey}`,
        bodyHash
      );
      if (existing) {
        const replayPayload =
          existing.payload && typeof existing.payload === "object"
            ? { ...(existing.payload as Record<string, unknown>), idempotentReplay: true }
            : { result: existing.payload, idempotentReplay: true };
        return reply.status(existing.statusCode).send({
          ...replayPayload
        });
      }
    }

    const parsed = runWorkflowRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: "INVALID_BODY", message: parsed.error.message });
    }

    const workflow = await context.store.findWorkflowById(parsed.data.workflowId);
    if (!workflow || workflow.userId !== auth.userId) {
      return reply.status(404).send({ code: "WORKFLOW_NOT_FOUND", message: "Workflow not found" });
    }

    const profile = await context.store.findProfileById(parsed.data.inputProfileId);
    if (!profile || profile.userId !== auth.userId) {
      return reply.status(404).send({ code: "PROFILE_NOT_FOUND", message: "Profile not found" });
    }

    const mode = parsed.data.modeOverride ?? workflow.executionMode;
    const subscription = await context.store.getSubscription(auth.userId);
    if (!subscription) {
      return reply.status(403).send({ code: "NO_SUBSCRIPTION", message: "No active subscription" });
    }
    const requiredFeature = modeFeatureMap[mode];
    if (!subscription.features.includes(requiredFeature)) {
      return reply.status(403).send({
        code: "MODE_NOT_ALLOWED",
        message: `Execution mode ${mode} is not allowed on current plan`
      });
    }

    const confidence = 0;
    const status: RunRecord["status"] = "queued";
    const now = new Date().toISOString();
    const runId = uuidv4();

    const run = {
      id: runId,
      userId: auth.userId,
      workflowId: workflow.id,
      inputProfileId: profile.id,
      status,
      mode,
      confidence,
      log: [
        `Run queued in ${mode} mode`,
        `Workflow version ${workflow.version}`,
        `Awaiting background worker`
      ],
      createdAt: now,
      updatedAt: now
    };

    await context.store.createRun({ ...run });

    withAudit(app, context, {
      userId: auth.userId,
      actor: "user",
      action: "execution.run",
      metadata: { runId, workflowId: workflow.id, mode, status: "queued" }
    });

    const result = await context.store.findRunById(runId);
    if (idempotencyKey) {
      idempotencyStore.set(`${auth.userId}:execution.runs:${idempotencyKey}`, bodyHash, 201, result);
    }
    return reply.status(201).send(result);
  });

  app.post("/execution/runs/:runId/decision", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const params = request.params as { runId?: string };
    const runId = params.runId ?? "";
    if (!runId) {
      return reply.status(400).send({ code: "INVALID_RUN_ID", message: "Run id is required" });
    }

    const parsed = runDecisionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: "INVALID_BODY", message: parsed.error.message });
    }

    const run = await context.store.findRunById(runId);
    if (!run || run.userId !== auth.userId) {
      return reply.status(404).send({ code: "RUN_NOT_FOUND", message: "Run not found" });
    }

    if (run.status !== "waiting_confirmation") {
      return reply.status(409).send({
        code: "RUN_NOT_WAITING_CONFIRMATION",
        message: "Run is not waiting confirmation"
      });
    }

    const decision = parsed.data.approved;
    const status: RunRecord["status"] = decision ? "completed" : "failed";
    const decisionNote = parsed.data.note ? ` (${parsed.data.note})` : "";
    const log = [
      ...run.log,
      decision ? `User approved run${decisionNote}` : `User rejected run${decisionNote}`
    ];

    const updated = await context.store.updateRun(run.id, {
      status,
      log,
      updatedAt: new Date().toISOString()
    });

    withAudit(app, context, {
      userId: auth.userId,
      actor: "user",
      action: "execution.decision",
      metadata: { runId: run.id, approved: decision, status }
    });

    return reply.send(updated);
  });
};
