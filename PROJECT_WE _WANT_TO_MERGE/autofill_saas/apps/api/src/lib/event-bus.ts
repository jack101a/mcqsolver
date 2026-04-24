import { Pool } from "pg";

export type EventEnvelope<T = Record<string, unknown>> = {
  id: string;
  type: string;
  occurredAt: string;
  payload: T;
};

type EventHandler = (event: EventEnvelope) => Promise<void> | void;

export interface EventBus {
  publish(event: EventEnvelope): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): () => void;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}

class MemoryEventBus implements EventBus {
  private readonly subscribers = new Map<string, Set<EventHandler>>();

  async publish(event: EventEnvelope): Promise<void> {
    const handlers = this.subscribers.get(event.type);
    if (!handlers) return;
    for (const handler of handlers) {
      await handler(event);
    }
  }

  subscribe(eventType: string, handler: EventHandler): () => void {
    const existing = this.subscribers.get(eventType) ?? new Set<EventHandler>();
    existing.add(handler);
    this.subscribers.set(eventType, existing);
    return () => {
      const set = this.subscribers.get(eventType);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) this.subscribers.delete(eventType);
    };
  }
}

class PostgresOutboxEventBus implements EventBus {
  private readonly subscribers = new Map<string, Set<EventHandler>>();
  private intervalRef: ReturnType<typeof setInterval> | undefined;
  private active = false;

  constructor(private readonly pool: Pool) {}

  async publish(event: EventEnvelope): Promise<void> {
    await this.pool.query(
      `INSERT INTO outbox_events (id, event_type, occurred_at, payload, processed_at)
       VALUES ($1, $2, $3, $4::jsonb, NULL)`,
      [event.id, event.type, event.occurredAt, JSON.stringify(event.payload)]
    );
  }

  subscribe(eventType: string, handler: EventHandler): () => void {
    const existing = this.subscribers.get(eventType) ?? new Set<EventHandler>();
    existing.add(handler);
    this.subscribers.set(eventType, existing);
    return () => {
      const set = this.subscribers.get(eventType);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) this.subscribers.delete(eventType);
    };
  }

  async start(): Promise<void> {
    if (this.intervalRef) return;
    this.intervalRef = setInterval(() => {
      void this.tick();
    }, 1000);
  }

  async stop(): Promise<void> {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = undefined;
    }
    while (this.active) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await this.pool.end();
  }

  private async tick(): Promise<void> {
    if (this.active) return;
    this.active = true;
    try {
      const result = await this.pool.query(
        `WITH picked AS (
          SELECT id
          FROM outbox_events
          WHERE processed_at IS NULL
          ORDER BY occurred_at ASC
          LIMIT 100
          FOR UPDATE SKIP LOCKED
        )
        UPDATE outbox_events o
        SET processed_at = NOW()
        FROM picked
        WHERE o.id = picked.id
        RETURNING o.id, o.event_type, o.occurred_at, o.payload`
      );

      for (const row of result.rows) {
        const handlers = this.subscribers.get(row.event_type);
        if (!handlers || handlers.size === 0) continue;
        const event: EventEnvelope = {
          id: row.id,
          type: row.event_type,
          occurredAt: row.occurred_at.toISOString(),
          payload:
            typeof row.payload === "string"
              ? (JSON.parse(row.payload) as Record<string, unknown>)
              : (row.payload as Record<string, unknown>)
        };
        for (const handler of handlers) {
          await handler(event);
        }
      }
    } catch {
      // Keep loop alive; errors surface via app logging around projections.
    } finally {
      this.active = false;
    }
  }
}

class KafkaEventBus implements EventBus {
  private readonly subscribers = new Map<string, Set<EventHandler>>();
  private readonly topic: string;
  private kafka: any;
  private producer: any;
  private consumer: any;
  private started = false;

  constructor(topic: string) {
    this.topic = topic;
  }

  private async ensureClients(): Promise<void> {
    if (this.kafka) return;
    const brokerList = (process.env.KAFKA_BROKERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (brokerList.length === 0) {
      throw new Error("KAFKA_BROKERS is required when EVENT_BUS_BACKEND=kafka");
    }

    const mod = await import("kafkajs");
    const { Kafka } = mod as unknown as { Kafka: new (config: Record<string, unknown>) => any };
    this.kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID ?? "autofill-api",
      brokers: brokerList
    });
    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({
      groupId: process.env.KAFKA_GROUP_ID ?? "autofill-events-group"
    });
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: this.topic,
      fromBeginning: false
    });
  }

  async publish(event: EventEnvelope): Promise<void> {
    await this.ensureClients();
    await this.producer.send({
      topic: this.topic,
      messages: [
        {
          key: event.type,
          value: JSON.stringify(event)
        }
      ]
    });
  }

  subscribe(eventType: string, handler: EventHandler): () => void {
    const existing = this.subscribers.get(eventType) ?? new Set<EventHandler>();
    existing.add(handler);
    this.subscribers.set(eventType, existing);
    return () => {
      const set = this.subscribers.get(eventType);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) this.subscribers.delete(eventType);
    };
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.ensureClients();
    await this.consumer.run({
      eachMessage: async ({ message }: { message: { value: Buffer | null } }) => {
        if (!message.value) return;
        const decoded = JSON.parse(message.value.toString()) as EventEnvelope;
        const handlers = this.subscribers.get(decoded.type);
        if (!handlers) return;
        for (const handler of handlers) {
          await handler(decoded);
        }
      }
    });
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.kafka) return;
    await this.consumer.disconnect();
    await this.producer.disconnect();
    this.started = false;
  }
}

export const createEventBus = async (): Promise<EventBus> => {
  const backend = process.env.EVENT_BUS_BACKEND ?? "memory";
  if (backend === "kafka") {
    const topic = process.env.KAFKA_TOPIC ?? "autofill.events";
    return new KafkaEventBus(topic);
  }
  if (backend !== "postgres") {
    return new MemoryEventBus();
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  await pool.query("SELECT 1");
  return new PostgresOutboxEventBus(pool);
};
