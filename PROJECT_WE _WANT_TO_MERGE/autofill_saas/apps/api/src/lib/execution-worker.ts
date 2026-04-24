import type { FastifyBaseLogger } from "fastify";
import type { AppContext } from "./context.js";
import { executeWorkflowEngine } from "./workflow-engine.js";

export class ExecutionWorker {
  private intervalRef: ReturnType<typeof setInterval> | undefined;
  private active = false;

  constructor(private readonly context: AppContext, private readonly logger: FastifyBaseLogger) {}

  start(): void {
    if (this.intervalRef) {
      return;
    }
    this.intervalRef = setInterval(() => {
      void this.tick();
    }, 1500);
  }

  async stop(): Promise<void> {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = undefined;
    }
    while (this.active) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private async tick(): Promise<void> {
    if (this.active) {
      return;
    }
    this.active = true;
    try {
      const queuedRuns = await this.context.store.listQueuedRuns(20);
      for (const run of queuedRuns) {
        const claimed = await this.context.store.claimQueuedRun(run.id);
        if (!claimed) {
          continue;
        }
        await this.processRun(run.id);
      }
    } catch (error) {
      this.logger.error({ err: error }, "execution_worker_tick_failed");
    } finally {
      this.active = false;
    }
  }

  private async processRun(runId: string): Promise<void> {
    const run = await this.context.store.findRunById(runId);
    if (!run) {
      return;
    }

    const workflow = await this.context.store.findWorkflowById(run.workflowId);
    const profile = await this.context.store.findProfileById(run.inputProfileId);
    const now = new Date().toISOString();

    if (!workflow || !profile) {
      const failedLog = [...run.log, "Execution failed: workflow/profile missing"];
      await this.context.store.updateRun(run.id, {
        status: "failed",
        log: failedLog,
        updatedAt: now
      });
      await this.context.createAlert({
        type: "execution_failure",
        severity: "high",
        status: "open",
        userId: run.userId,
        source: "execution_worker",
        message: "Workflow run failed due to missing dependency",
        metadata: { runId: run.id, workflowId: run.workflowId, reason: "missing_dependency" },
        createdAt: new Date().toISOString()
      });
      await this.context.store.appendAudit({
        id: crypto.randomUUID(),
        userId: run.userId,
        actor: "execution_worker",
        action: "execution.failed",
        metadata: { runId: run.id, reason: "missing_dependency" },
        createdAt: new Date().toISOString()
      });
      this.logger.warn({ runId: run.id }, "execution_failed_missing_dependency");
      return;
    }

    const execution = executeWorkflowEngine(workflow, profile, run.mode);
    const nextStatus = execution.status;
    const nextLog = [...run.log, "Worker claimed run", ...execution.log];

    await this.context.store.updateRun(run.id, {
      status: nextStatus,
      log: nextLog,
      updatedAt: now,
      confidence: execution.confidence
    });

    if (nextStatus === "waiting_confirmation") {
      await this.context.createAlert({
        type: "execution_degraded",
        severity: "low",
        status: "open",
        userId: run.userId,
        source: "execution_worker",
        message: "Workflow requires user confirmation due to confidence policy",
        metadata: {
          runId: run.id,
          workflowId: run.workflowId,
          confidence: execution.confidence,
          stepId: execution.failedStepId
        },
        createdAt: new Date().toISOString()
      });
    }

    if (nextStatus === "failed") {
      await this.context.createAlert({
        type: "execution_failure",
        severity: "high",
        status: "open",
        userId: run.userId,
        source: "execution_worker",
        message: "Workflow run failed during step execution",
        metadata: {
          runId: run.id,
          workflowId: run.workflowId,
          confidence: execution.confidence,
          stepId: execution.failedStepId
        },
        createdAt: new Date().toISOString()
      });
    }

    await this.context.store.appendAudit({
      id: crypto.randomUUID(),
      userId: run.userId,
      actor: "execution_worker",
      action: "execution.processed",
      metadata: {
        runId: run.id,
        status: nextStatus,
        confidence: execution.confidence,
        stepId: execution.failedStepId
      },
      createdAt: new Date().toISOString()
    });
    this.logger.info({ runId: run.id, status: nextStatus }, "execution_processed");
  }
}
