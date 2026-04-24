import { Pool } from "pg";
import type { AlertQuery, AuditQuery, DataStore, StoreStats } from "./data-store.js";
import type {
  AuditEvent,
  AlertRecord,
  DeviceRecord,
  IncidentMetricRecord,
  ProfileRecord,
  RunRecord,
  SubscriptionRecord,
  SyncRecord,
  UserRecord,
  WorkflowRecord
} from "./types.js";

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value === "object" && value !== null) {
    return value as T;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

export class PostgresStore implements DataStore {
  constructor(private readonly pool: Pool) {}

  async connect(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    const result = await this.pool.query(
      "SELECT id, email, full_name, password_hash, created_at FROM users WHERE email = $1 LIMIT 1",
      [email]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      passwordHash: row.password_hash,
      createdAt: row.created_at.toISOString()
    };
  }

  async createUser(input: UserRecord): Promise<UserRecord> {
    await this.pool.query(
      "INSERT INTO users (id, email, full_name, password_hash, created_at) VALUES ($1,$2,$3,$4,$5)",
      [input.id, input.email, input.fullName, input.passwordHash, input.createdAt]
    );
    return input;
  }

  async createDevice(input: DeviceRecord): Promise<DeviceRecord> {
    await this.pool.query(
      "INSERT INTO devices (id, user_id, device_name, trusted, created_at, revoked_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [input.id, input.userId, input.deviceName, input.trusted, input.createdAt, input.revokedAt ?? null]
    );
    return input;
  }

  async getSubscription(userId: string): Promise<SubscriptionRecord | undefined> {
    const result = await this.pool.query(
      "SELECT user_id, plan, ai_quota_remaining, captcha_quota_remaining, features FROM subscriptions WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      userId: row.user_id,
      plan: row.plan,
      aiQuotaRemaining: row.ai_quota_remaining,
      captchaQuotaRemaining: row.captcha_quota_remaining,
      features: parseJson<string[]>(row.features, [])
    };
  }

  async upsertSubscription(input: SubscriptionRecord): Promise<SubscriptionRecord> {
    await this.pool.query(
      `INSERT INTO subscriptions (user_id, plan, ai_quota_remaining, captcha_quota_remaining, features)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT (user_id)
       DO UPDATE SET plan = excluded.plan, ai_quota_remaining = excluded.ai_quota_remaining,
         captcha_quota_remaining = excluded.captcha_quota_remaining, features = excluded.features`,
      [
        input.userId,
        input.plan,
        input.aiQuotaRemaining,
        input.captchaQuotaRemaining,
        JSON.stringify(input.features)
      ]
    );
    return input;
  }

  async decrementAiQuota(userId: string, by: number): Promise<number> {
    const result = await this.pool.query(
      `UPDATE subscriptions
       SET ai_quota_remaining = GREATEST(ai_quota_remaining - $2, 0)
       WHERE user_id = $1
       RETURNING ai_quota_remaining`,
      [userId, by]
    );
    return result.rows[0]?.ai_quota_remaining ?? 0;
  }

  async decrementCaptchaQuota(userId: string, by: number): Promise<number> {
    const result = await this.pool.query(
      `UPDATE subscriptions
       SET captcha_quota_remaining = GREATEST(captcha_quota_remaining - $2, 0)
       WHERE user_id = $1
       RETURNING captcha_quota_remaining`,
      [userId, by]
    );
    return result.rows[0]?.captcha_quota_remaining ?? 0;
  }

  async listProfilesByUser(userId: string): Promise<ProfileRecord[]> {
    const result = await this.pool.query(
      "SELECT id, user_id, name, locale, fields, created_at FROM profiles WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      locale: row.locale,
      fields: parseJson<Array<{ key: string; value: string; sensitivity: string }>>(row.fields, []),
      createdAt: row.created_at.toISOString()
    }));
  }

  async findProfileById(profileId: string): Promise<ProfileRecord | undefined> {
    const result = await this.pool.query(
      "SELECT id, user_id, name, locale, fields, created_at FROM profiles WHERE id = $1 LIMIT 1",
      [profileId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      locale: row.locale,
      fields: parseJson<Array<{ key: string; value: string; sensitivity: string }>>(row.fields, []),
      createdAt: row.created_at.toISOString()
    };
  }

  async createProfile(input: ProfileRecord): Promise<ProfileRecord> {
    await this.pool.query(
      "INSERT INTO profiles (id, user_id, name, locale, fields, created_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6)",
      [input.id, input.userId, input.name, input.locale, JSON.stringify(input.fields), input.createdAt]
    );
    return input;
  }

  async listWorkflowsByUser(userId: string): Promise<WorkflowRecord[]> {
    const result = await this.pool.query(
      "SELECT id, user_id, name, description, site_pattern, execution_mode, steps, version, created_at FROM workflows WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description ?? undefined,
      sitePattern: row.site_pattern,
      executionMode: row.execution_mode,
      steps: parseJson<Array<Record<string, unknown>>>(row.steps, []),
      version: row.version,
      createdAt: row.created_at.toISOString()
    }));
  }

  async findWorkflowById(workflowId: string): Promise<WorkflowRecord | undefined> {
    const result = await this.pool.query(
      "SELECT id, user_id, name, description, site_pattern, execution_mode, steps, version, created_at FROM workflows WHERE id = $1 LIMIT 1",
      [workflowId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description ?? undefined,
      sitePattern: row.site_pattern,
      executionMode: row.execution_mode,
      steps: parseJson<Array<Record<string, unknown>>>(row.steps, []),
      version: row.version,
      createdAt: row.created_at.toISOString()
    };
  }

  async createWorkflow(input: WorkflowRecord): Promise<WorkflowRecord> {
    await this.pool.query(
      `INSERT INTO workflows (id, user_id, name, description, site_pattern, execution_mode, steps, version, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
      [
        input.id,
        input.userId,
        input.name,
        input.description ?? null,
        input.sitePattern,
        input.executionMode,
        JSON.stringify(input.steps),
        input.version,
        input.createdAt
      ]
    );
    return input;
  }

  async listRunsByUser(userId: string): Promise<RunRecord[]> {
    const result = await this.pool.query(
      "SELECT id, user_id, workflow_id, input_profile_id, status, mode, confidence, log, created_at, updated_at FROM workflow_runs WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      workflowId: row.workflow_id,
      inputProfileId: row.input_profile_id,
      status: row.status,
      mode: row.mode,
      confidence: Number(row.confidence),
      log: parseJson<string[]>(row.log, []),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    }));
  }

  async listQueuedRuns(limit: number): Promise<RunRecord[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, workflow_id, input_profile_id, status, mode, confidence, log, created_at, updated_at
       FROM workflow_runs
       WHERE status = 'queued'
       ORDER BY created_at ASC
       LIMIT $1`,
      [Math.max(1, limit)]
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      workflowId: row.workflow_id,
      inputProfileId: row.input_profile_id,
      status: row.status,
      mode: row.mode,
      confidence: Number(row.confidence),
      log: parseJson<string[]>(row.log, []),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    }));
  }

  async findRunById(runId: string): Promise<RunRecord | undefined> {
    const result = await this.pool.query(
      "SELECT id, user_id, workflow_id, input_profile_id, status, mode, confidence, log, created_at, updated_at FROM workflow_runs WHERE id = $1 LIMIT 1",
      [runId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.user_id,
      workflowId: row.workflow_id,
      inputProfileId: row.input_profile_id,
      status: row.status,
      mode: row.mode,
      confidence: Number(row.confidence),
      log: parseJson<string[]>(row.log, []),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  async createRun(input: RunRecord): Promise<RunRecord> {
    await this.pool.query(
      `INSERT INTO workflow_runs
       (id, user_id, workflow_id, input_profile_id, status, mode, confidence, log, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
      [
        input.id,
        input.userId,
        input.workflowId,
        input.inputProfileId,
        input.status,
        input.mode,
        input.confidence,
        JSON.stringify(input.log),
        input.createdAt,
        input.updatedAt
      ]
    );
    return input;
  }

  async claimQueuedRun(runId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE workflow_runs
       SET status = 'running', updated_at = $2
       WHERE id = $1 AND status = 'queued'
       RETURNING id`,
      [runId, new Date().toISOString()]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async updateRun(
    runId: string,
    patch: Partial<Pick<RunRecord, "status" | "log" | "updatedAt" | "confidence">>
  ): Promise<RunRecord | undefined> {
    const existing = await this.findRunById(runId);
    if (!existing) return undefined;
    const status = patch.status ?? existing.status;
    const log = patch.log ?? existing.log;
    const updatedAt = patch.updatedAt ?? existing.updatedAt;
    const confidence = typeof patch.confidence === "number" ? patch.confidence : existing.confidence;
    await this.pool.query(
      "UPDATE workflow_runs SET status = $2, log = $3::jsonb, updated_at = $4, confidence = $5 WHERE id = $1",
      [runId, status, JSON.stringify(log), updatedAt, confidence]
    );
    return { ...existing, status, log, updatedAt, confidence };
  }

  async getSyncByUser(userId: string): Promise<SyncRecord | undefined> {
    const result = await this.pool.query(
      "SELECT user_id, checkpoint, payload, device_id, updated_at FROM sync_state WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      userId: row.user_id,
      checkpoint: row.checkpoint,
      payload: parseJson<SyncRecord["payload"]>(row.payload, {
        profiles: [],
        workflows: [],
        settings: {}
      }),
      deviceId: row.device_id ?? undefined,
      updatedAt: row.updated_at.toISOString()
    };
  }

  async upsertSync(input: SyncRecord): Promise<SyncRecord> {
    await this.pool.query(
      `INSERT INTO sync_state (user_id, checkpoint, payload, device_id, updated_at)
       VALUES ($1,$2,$3::jsonb,$4,$5)
       ON CONFLICT (user_id) DO UPDATE
       SET checkpoint = excluded.checkpoint,
           payload = excluded.payload,
           device_id = excluded.device_id,
           updated_at = excluded.updated_at`,
      [
        input.userId,
        input.checkpoint,
        JSON.stringify(input.payload ?? { profiles: [], workflows: [], settings: {} }),
        input.deviceId ?? null,
        input.updatedAt
      ]
    );
    return input;
  }

  async appendAudit(input: AuditEvent): Promise<void> {
    await this.pool.query(
      "INSERT INTO audit_events (id, user_id, actor, action, metadata, created_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6)",
      [input.id, input.userId ?? null, input.actor, input.action, JSON.stringify(input.metadata), input.createdAt]
    );
  }

  async listAuditEvents(query?: AuditQuery): Promise<AuditEvent[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (query?.userId) {
      params.push(query.userId);
      clauses.push(`user_id = $${params.length}`);
    }
    if (query?.actor) {
      params.push(query.actor);
      clauses.push(`actor = $${params.length}`);
    }
    if (query?.action) {
      params.push(query.action);
      clauses.push(`action = $${params.length}`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(100_000, query?.limit ?? 100));
    params.push(limit);
    const result = await this.pool.query(
      `SELECT id, user_id, actor, action, metadata, created_at
       FROM audit_events ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id ?? undefined,
      actor: row.actor,
      action: row.action,
      metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
      createdAt: row.created_at.toISOString()
    }));
  }

  async appendTelemetry(input: Record<string, unknown>): Promise<void> {
    await this.pool.query("INSERT INTO telemetry_events (payload, created_at) VALUES ($1::jsonb, $2)", [
      JSON.stringify(input),
      new Date().toISOString()
    ]);
  }

  async createAlert(input: AlertRecord): Promise<AlertRecord> {
    await this.pool.query(
      `INSERT INTO alert_events
      (id, type, severity, status, user_id, source, message, metadata, created_at, acknowledged_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
      [
        input.id,
        input.type,
        input.severity,
        input.status,
        input.userId ?? null,
        input.source,
        input.message,
        JSON.stringify(input.metadata),
        input.createdAt,
        input.acknowledgedAt ?? null
      ]
    );
    return input;
  }

  async listAlerts(query?: AlertQuery): Promise<AlertRecord[]> {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (query?.status) {
      params.push(query.status);
      clauses.push(`status = $${params.length}`);
    }
    if (query?.type) {
      params.push(query.type);
      clauses.push(`type = $${params.length}`);
    }
    if (query?.severity) {
      params.push(query.severity);
      clauses.push(`severity = $${params.length}`);
    }
    if (query?.userId) {
      params.push(query.userId);
      clauses.push(`user_id = $${params.length}`);
    }
    if (query?.source) {
      params.push(query.source);
      clauses.push(`source = $${params.length}`);
    }
    if (query?.createdAfter) {
      params.push(query.createdAfter);
      clauses.push(`created_at >= $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(1000, query?.limit ?? 100));
    params.push(limit);
    const result = await this.pool.query(
      `SELECT id, type, severity, status, user_id, source, message, metadata, created_at, acknowledged_at
       FROM alert_events
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      status: row.status,
      userId: row.user_id ?? undefined,
      source: row.source,
      message: row.message,
      metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
      createdAt: row.created_at.toISOString(),
      acknowledgedAt: row.acknowledged_at ? row.acknowledged_at.toISOString() : undefined
    }));
  }

  async acknowledgeAlert(alertId: string): Promise<AlertRecord | undefined> {
    const acknowledgedAt = new Date().toISOString();
    const result = await this.pool.query(
      `UPDATE alert_events
       SET status = 'acknowledged', acknowledged_at = $2
       WHERE id = $1
       RETURNING id, type, severity, status, user_id, source, message, metadata, created_at, acknowledged_at`,
      [alertId, acknowledgedAt]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      type: row.type,
      severity: row.severity,
      status: row.status,
      userId: row.user_id ?? undefined,
      source: row.source,
      message: row.message,
      metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
      createdAt: row.created_at.toISOString(),
      acknowledgedAt: row.acknowledged_at ? row.acknowledged_at.toISOString() : undefined
    };
  }

  async incrementIncidentMetric(input: IncidentMetricRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO incident_metrics_hourly (bucket_start, type, severity, source, count)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (bucket_start, type, severity, source)
       DO UPDATE SET count = incident_metrics_hourly.count + excluded.count`,
      [input.bucketStart, input.type, input.severity, input.source, input.count]
    );
  }

  async listIncidentMetrics(sinceIso: string): Promise<IncidentMetricRecord[]> {
    const result = await this.pool.query(
      `SELECT bucket_start, type, severity, source, count
       FROM incident_metrics_hourly
       WHERE bucket_start >= $1
       ORDER BY bucket_start ASC`,
      [sinceIso]
    );
    return result.rows.map((row) => ({
      bucketStart: row.bucket_start.toISOString(),
      type: row.type,
      severity: row.severity,
      source: row.source,
      count: Number(row.count)
    }));
  }

  async resetIncidentMetrics(): Promise<void> {
    await this.pool.query("TRUNCATE TABLE incident_metrics_hourly");
  }

  async getStats(): Promise<StoreStats> {
    const [users, workflows, profiles, runs, audits] = await Promise.all([
      this.pool.query("SELECT COUNT(*)::int AS count FROM users"),
      this.pool.query("SELECT COUNT(*)::int AS count FROM workflows"),
      this.pool.query("SELECT COUNT(*)::int AS count FROM profiles"),
      this.pool.query("SELECT COUNT(*)::int AS count FROM workflow_runs"),
      this.pool.query("SELECT COUNT(*)::int AS count FROM audit_events")
    ]);
    return {
      users: users.rows[0].count,
      workflows: workflows.rows[0].count,
      profiles: profiles.rows[0].count,
      runs: runs.rows[0].count,
      audits: audits.rows[0].count
    };
  }
}
