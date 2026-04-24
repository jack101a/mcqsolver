import { createHash } from "node:crypto";

type StoredResponse = {
  statusCode: number;
  payload: unknown;
  bodyHash: string;
  createdAt: number;
};

export class IdempotencyStore {
  private readonly entries = new Map<string, StoredResponse>();
  private readonly ttlMs: number;

  constructor(ttlMs = 15 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  private cleanup(now: number): void {
    for (const [key, value] of this.entries.entries()) {
      if (value.createdAt + this.ttlMs < now) {
        this.entries.delete(key);
      }
    }
  }

  computeBodyHash(body: unknown): string {
    return createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
  }

  get(key: string, bodyHash: string): StoredResponse | undefined {
    const now = Date.now();
    this.cleanup(now);
    const value = this.entries.get(key);
    if (!value) return undefined;
    if (value.bodyHash !== bodyHash) return undefined;
    return value;
  }

  set(key: string, bodyHash: string, statusCode: number, payload: unknown): void {
    this.entries.set(key, {
      statusCode,
      payload,
      bodyHash,
      createdAt: Date.now()
    });
  }
}

export const idempotencyStore = new IdempotencyStore();
