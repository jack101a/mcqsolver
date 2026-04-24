import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import type { DataStore } from "./data-store.js";
import { createEventBus, type EventBus } from "./event-bus.js";
import { MemoryStore } from "./memory-store.js";
import { PostgresStore } from "./postgres-store.js";
import type { AlertRecord } from "./types.js";

export type AppContext = {
  store: DataStore;
  eventBus: EventBus;
  createAlert: (
    input: Omit<AlertRecord, "id"> & {
      id?: string;
    }
  ) => Promise<AlertRecord>;
};

export const createContext = async (): Promise<AppContext> => {
  const eventBus = await createEventBus();
  const backend = process.env.DATA_STORE_BACKEND ?? "memory";
  if (backend === "postgres") {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    const store = new PostgresStore(pool);
    await store.connect?.();
    return {
      store,
      eventBus,
      createAlert: async (input) => {
        const alert = await store.createAlert({
          ...input,
          id: input.id ?? crypto.randomUUID()
        });
        await eventBus.publish({
          id: crypto.randomUUID(),
          type: "alert.created",
          occurredAt: new Date().toISOString(),
          payload: alert as unknown as Record<string, unknown>
        });
        return alert;
      }
    };
  }

  const store = new MemoryStore();
  return {
    store,
    eventBus,
    createAlert: async (input) => {
      const alert = await store.createAlert({
        ...input,
        id: input.id ?? crypto.randomUUID()
      });
      await eventBus.publish({
        id: crypto.randomUUID(),
        type: "alert.created",
        occurredAt: new Date().toISOString(),
        payload: alert as unknown as Record<string, unknown>
      });
      return alert;
    }
  };
};

export const withAudit = (
  app: FastifyInstance,
  context: AppContext,
  event: { userId?: string; actor: string; action: string; metadata?: Record<string, unknown> }
) => {
  void context.store.appendAudit({
    id: crypto.randomUUID(),
    userId: event.userId,
    actor: event.actor,
    action: event.action,
    metadata: event.metadata ?? {},
    createdAt: new Date().toISOString()
  });

  app.log.info({
    msg: "audit_event",
    actor: event.actor,
    action: event.action,
    userId: event.userId
  });
};
