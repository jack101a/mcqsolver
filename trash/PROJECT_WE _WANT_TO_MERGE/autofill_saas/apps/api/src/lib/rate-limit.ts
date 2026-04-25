import type { FastifyReply, FastifyRequest } from "fastify";
import { Pool } from "pg";

type ConsumeResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export type RateLimitEvent = {
  route: string;
  ip: string;
  method: string;
  resetAt: number;
};

export interface RateLimiterBackend {
  consume(key: string, windowMs: number, maxRequests: number): Promise<ConsumeResult>;
  close?(): Promise<void>;
}

class InMemoryRateLimiterBackend implements RateLimiterBackend {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  async consume(key: string, windowMs: number, maxRequests: number): Promise<ConsumeResult> {
    const now = Date.now();
    const composite = `${key}:${windowMs}:${maxRequests}`;
    const existing = this.buckets.get(composite);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      this.buckets.set(composite, { count: 1, resetAt });
      return { allowed: true, remaining: maxRequests - 1, resetAt };
    }

    existing.count += 1;
    if (existing.count > maxRequests) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }
    return {
      allowed: true,
      remaining: maxRequests - existing.count,
      resetAt: existing.resetAt
    };
  }
}

class PostgresRateLimiterBackend implements RateLimiterBackend {
  constructor(private readonly pool: Pool) {}

  async consume(key: string, windowMs: number, maxRequests: number): Promise<ConsumeResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    const result = await this.pool.query(
      `INSERT INTO rate_limit_counters (counter_key, window_start_ms, hit_count, updated_at)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (counter_key, window_start_ms)
       DO UPDATE SET hit_count = rate_limit_counters.hit_count + 1, updated_at = excluded.updated_at
       RETURNING hit_count`,
      [key, windowStart, new Date(now).toISOString()]
    );

    const count = Number(result.rows[0]?.hit_count ?? 1);
    return {
      allowed: count <= maxRequests,
      remaining: Math.max(0, maxRequests - count),
      resetAt
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export const createRateLimiterBackend = async (): Promise<RateLimiterBackend> => {
  const backend = process.env.RATE_LIMIT_BACKEND ?? "memory";
  if (backend !== "postgres") {
    return new InMemoryRateLimiterBackend();
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  await pool.query("SELECT 1");
  return new PostgresRateLimiterBackend(pool);
};

export const rateLimitGuard = async (
  request: FastifyRequest,
  reply: FastifyReply,
  limiter: RateLimiterBackend,
  onLimited?: (event: RateLimitEvent) => Promise<void> | void
) => {
  const route = request.routeOptions.url ?? request.url;
  const ip = request.ip ?? "unknown";
  const method = request.method.toUpperCase();
  const key = `${ip}:${method}:${route}`;
  const policy = route.startsWith("/auth")
    ? { windowMs: 60_000, maxRequests: 25 }
    : { windowMs: 60_000, maxRequests: 120 };
  const result = await limiter.consume(key, policy.windowMs, policy.maxRequests);
  reply.header("X-RateLimit-Remaining", String(result.remaining));
  reply.header("X-RateLimit-Reset", String(result.resetAt));

  if (!result.allowed) {
    await onLimited?.({
      route,
      ip,
      method,
      resetAt: result.resetAt
    });
    reply.header("Retry-After", String(Math.ceil((result.resetAt - Date.now()) / 1000)));
    return reply.status(429).send({
      code: "RATE_LIMITED",
      message: "Too many requests, retry later"
    });
  }
};
