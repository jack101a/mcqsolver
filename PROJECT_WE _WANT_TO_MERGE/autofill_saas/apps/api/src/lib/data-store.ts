import type { ExecutionMode, PlanType } from "@autofill/schemas";
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

export type CreateUserInput = {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  createdAt: string;
};

export type CreateDeviceInput = {
  id: string;
  userId: string;
  deviceName: string;
  trusted: boolean;
  createdAt: string;
  revokedAt?: string;
};

export type CreateProfileInput = {
  id: string;
  userId: string;
  name: string;
  locale: string;
  fields: Array<{ key: string; value: string; sensitivity: string }>;
  createdAt: string;
};

export type CreateWorkflowInput = {
  id: string;
  userId: string;
  name: string;
  description?: string;
  sitePattern: string;
  executionMode: ExecutionMode;
  steps: Array<Record<string, unknown>>;
  version: number;
  createdAt: string;
};

export type CreateRunInput = {
  id: string;
  userId: string;
  workflowId: string;
  inputProfileId: string;
  status: RunRecord["status"];
  mode: ExecutionMode;
  confidence: number;
  log: string[];
  createdAt: string;
  updatedAt: string;
};

export type StoreStats = {
  users: number;
  workflows: number;
  profiles: number;
  runs: number;
  audits: number;
};

export type AuditQuery = {
  userId?: string;
  actor?: string;
  action?: string;
  limit?: number;
};

export type AlertQuery = {
  status?: AlertRecord["status"];
  type?: AlertRecord["type"];
  severity?: AlertRecord["severity"];
  userId?: string;
  source?: string;
  createdAfter?: string;
  limit?: number;
};

export interface DataStore {
  connect?(): Promise<void>;
  close?(): Promise<void>;

  findUserByEmail(email: string): Promise<UserRecord | undefined>;
  createUser(input: CreateUserInput): Promise<UserRecord>;

  createDevice(input: CreateDeviceInput): Promise<DeviceRecord>;

  getSubscription(userId: string): Promise<SubscriptionRecord | undefined>;
  upsertSubscription(input: {
    userId: string;
    plan: PlanType;
    aiQuotaRemaining: number;
    captchaQuotaRemaining: number;
    features: string[];
  }): Promise<SubscriptionRecord>;
  decrementAiQuota(userId: string, by: number): Promise<number>;
  decrementCaptchaQuota(userId: string, by: number): Promise<number>;

  listProfilesByUser(userId: string): Promise<ProfileRecord[]>;
  findProfileById(profileId: string): Promise<ProfileRecord | undefined>;
  createProfile(input: CreateProfileInput): Promise<ProfileRecord>;

  listWorkflowsByUser(userId: string): Promise<WorkflowRecord[]>;
  findWorkflowById(workflowId: string): Promise<WorkflowRecord | undefined>;
  createWorkflow(input: CreateWorkflowInput): Promise<WorkflowRecord>;

  listRunsByUser(userId: string): Promise<RunRecord[]>;
  listQueuedRuns(limit: number): Promise<RunRecord[]>;
  findRunById(runId: string): Promise<RunRecord | undefined>;
  createRun(input: CreateRunInput): Promise<RunRecord>;
  claimQueuedRun(runId: string): Promise<boolean>;
  updateRun(
    runId: string,
    patch: Partial<Pick<RunRecord, "status" | "log" | "updatedAt" | "confidence">>
  ): Promise<RunRecord | undefined>;

  getSyncByUser(userId: string): Promise<SyncRecord | undefined>;
  upsertSync(input: SyncRecord): Promise<SyncRecord>;

  appendAudit(input: AuditEvent): Promise<void>;
  listAuditEvents(query?: AuditQuery): Promise<AuditEvent[]>;
  appendTelemetry(input: Record<string, unknown>): Promise<void>;
  createAlert(
    input: Omit<AlertRecord, "id"> & {
      id: string;
    }
  ): Promise<AlertRecord>;
  listAlerts(query?: AlertQuery): Promise<AlertRecord[]>;
  acknowledgeAlert(alertId: string): Promise<AlertRecord | undefined>;
  incrementIncidentMetric(input: IncidentMetricRecord): Promise<void>;
  listIncidentMetrics(sinceIso: string): Promise<IncidentMetricRecord[]>;
  resetIncidentMetrics(): Promise<void>;

  getStats(): Promise<StoreStats>;
}
