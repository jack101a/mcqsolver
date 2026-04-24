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

export class MemoryStore implements DataStore {
  private readonly users = new Map<string, UserRecord>();
  private readonly usersByEmail = new Map<string, UserRecord>();
  private readonly devices = new Map<string, DeviceRecord>();
  private readonly profiles = new Map<string, ProfileRecord>();
  private readonly workflows = new Map<string, WorkflowRecord>();
  private readonly runs = new Map<string, RunRecord>();
  private readonly subscriptions = new Map<string, SubscriptionRecord>();
  private readonly sync = new Map<string, SyncRecord>();
  private readonly auditEvents: AuditEvent[] = [];
  private readonly alerts: AlertRecord[] = [];
  private readonly incidentMetrics = new Map<string, IncidentMetricRecord>();
  private readonly telemetry: Array<Record<string, unknown>> = [];

  async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    return this.usersByEmail.get(email);
  }

  async createUser(input: UserRecord): Promise<UserRecord> {
    this.users.set(input.id, input);
    this.usersByEmail.set(input.email, input);
    return input;
  }

  async createDevice(input: DeviceRecord): Promise<DeviceRecord> {
    this.devices.set(input.id, input);
    return input;
  }

  async getSubscription(userId: string): Promise<SubscriptionRecord | undefined> {
    return this.subscriptions.get(userId);
  }

  async upsertSubscription(input: SubscriptionRecord): Promise<SubscriptionRecord> {
    this.subscriptions.set(input.userId, input);
    return input;
  }

  async decrementAiQuota(userId: string, by: number): Promise<number> {
    const subscription = this.subscriptions.get(userId);
    if (!subscription) return 0;
    subscription.aiQuotaRemaining = Math.max(0, subscription.aiQuotaRemaining - by);
    return subscription.aiQuotaRemaining;
  }

  async decrementCaptchaQuota(userId: string, by: number): Promise<number> {
    const subscription = this.subscriptions.get(userId);
    if (!subscription) return 0;
    subscription.captchaQuotaRemaining = Math.max(0, subscription.captchaQuotaRemaining - by);
    return subscription.captchaQuotaRemaining;
  }

  async listProfilesByUser(userId: string): Promise<ProfileRecord[]> {
    return [...this.profiles.values()].filter((p) => p.userId === userId);
  }

  async findProfileById(profileId: string): Promise<ProfileRecord | undefined> {
    return this.profiles.get(profileId);
  }

  async createProfile(input: ProfileRecord): Promise<ProfileRecord> {
    this.profiles.set(input.id, input);
    return input;
  }

  async listWorkflowsByUser(userId: string): Promise<WorkflowRecord[]> {
    return [...this.workflows.values()].filter((w) => w.userId === userId);
  }

  async findWorkflowById(workflowId: string): Promise<WorkflowRecord | undefined> {
    return this.workflows.get(workflowId);
  }

  async createWorkflow(input: WorkflowRecord): Promise<WorkflowRecord> {
    this.workflows.set(input.id, input);
    return input;
  }

  async listRunsByUser(userId: string): Promise<RunRecord[]> {
    return [...this.runs.values()].filter((r) => r.userId === userId);
  }

  async listQueuedRuns(limit: number): Promise<RunRecord[]> {
    return [...this.runs.values()]
      .filter((r) => r.status === "queued")
      .slice(0, Math.max(1, limit));
  }

  async findRunById(runId: string): Promise<RunRecord | undefined> {
    return this.runs.get(runId);
  }

  async createRun(input: RunRecord): Promise<RunRecord> {
    this.runs.set(input.id, input);
    return input;
  }

  async claimQueuedRun(runId: string): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run || run.status !== "queued") {
      return false;
    }
    run.status = "running";
    run.updatedAt = new Date().toISOString();
    return true;
  }

  async updateRun(
    runId: string,
    patch: Partial<Pick<RunRecord, "status" | "log" | "updatedAt" | "confidence">>
  ): Promise<RunRecord | undefined> {
    const run = this.runs.get(runId);
    if (!run) return undefined;
    if (patch.status) run.status = patch.status;
    if (patch.log) run.log = patch.log;
    if (patch.updatedAt) run.updatedAt = patch.updatedAt;
    if (typeof patch.confidence === "number") run.confidence = patch.confidence;
    return run;
  }

  async getSyncByUser(userId: string): Promise<SyncRecord | undefined> {
    return this.sync.get(userId);
  }

  async upsertSync(input: SyncRecord): Promise<SyncRecord> {
    const merged: SyncRecord = {
      ...input,
      payload: {
        profiles: Array.isArray(input.payload?.profiles) ? input.payload.profiles : [],
        workflows: Array.isArray(input.payload?.workflows) ? input.payload.workflows : [],
        settings:
          input.payload && typeof input.payload.settings === "object" && input.payload.settings !== null
            ? input.payload.settings
            : {}
      }
    };
    this.sync.set(input.userId, merged);
    return merged;
  }

  async appendAudit(input: AuditEvent): Promise<void> {
    this.auditEvents.push(input);
  }

  async listAuditEvents(query?: AuditQuery): Promise<AuditEvent[]> {
    const filtered = this.auditEvents.filter((event) => {
      if (query?.userId && event.userId !== query.userId) return false;
      if (query?.actor && event.actor !== query.actor) return false;
      if (query?.action && event.action !== query.action) return false;
      return true;
    });
    const limit = query?.limit ?? 100;
    return filtered.slice(0, Math.max(1, Math.min(1000, limit)));
  }

  async appendTelemetry(input: Record<string, unknown>): Promise<void> {
    this.telemetry.push(input);
  }

  async createAlert(input: AlertRecord): Promise<AlertRecord> {
    this.alerts.unshift(input);
    return input;
  }

  async listAlerts(query?: AlertQuery): Promise<AlertRecord[]> {
    const filtered = this.alerts.filter((a) => {
      if (query?.status && a.status !== query.status) return false;
      if (query?.type && a.type !== query.type) return false;
      if (query?.severity && a.severity !== query.severity) return false;
      if (query?.userId && a.userId !== query.userId) return false;
      if (query?.source && a.source !== query.source) return false;
      if (query?.createdAfter && a.createdAt < query.createdAfter) return false;
      return true;
    });
    const limit = Math.max(1, Math.min(100_000, query?.limit ?? 100));
    return filtered.slice(0, limit);
  }

  async acknowledgeAlert(alertId: string): Promise<AlertRecord | undefined> {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) return undefined;
    alert.status = "acknowledged";
    alert.acknowledgedAt = new Date().toISOString();
    return alert;
  }

  async incrementIncidentMetric(input: IncidentMetricRecord): Promise<void> {
    const key = `${input.bucketStart}|${input.type}|${input.severity}|${input.source}`;
    const existing = this.incidentMetrics.get(key);
    if (!existing) {
      this.incidentMetrics.set(key, { ...input });
      return;
    }
    existing.count += input.count;
  }

  async listIncidentMetrics(sinceIso: string): Promise<IncidentMetricRecord[]> {
    return [...this.incidentMetrics.values()].filter((m) => m.bucketStart >= sinceIso);
  }

  async resetIncidentMetrics(): Promise<void> {
    this.incidentMetrics.clear();
  }

  async getStats(): Promise<StoreStats> {
    return {
      users: this.users.size,
      workflows: this.workflows.size,
      profiles: this.profiles.size,
      runs: this.runs.size,
      audits: this.auditEvents.length
    };
  }
}
