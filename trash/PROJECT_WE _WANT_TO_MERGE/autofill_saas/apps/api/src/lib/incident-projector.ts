import type { FastifyBaseLogger } from "fastify";
import type { AppContext } from "./context.js";
import type { AlertRecord } from "./types.js";

export class IncidentProjector {
  private unsubscribe: (() => void) | undefined;

  constructor(private readonly context: AppContext, private readonly logger: FastifyBaseLogger) {}

  register(): void {
    this.unsubscribe = this.context.eventBus.subscribe("alert.created", async (event) => {
      try {
        const payload = event.payload as AlertRecord;
        const bucketDate = new Date(payload.createdAt);
        bucketDate.setUTCMinutes(0, 0, 0);
        await this.context.store.incrementIncidentMetric({
          bucketStart: bucketDate.toISOString(),
          type: payload.type,
          severity: payload.severity,
          source: payload.source,
          count: 1
        });
      } catch (error) {
        this.logger.error({ err: error }, "incident_projection_failed");
      }
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
