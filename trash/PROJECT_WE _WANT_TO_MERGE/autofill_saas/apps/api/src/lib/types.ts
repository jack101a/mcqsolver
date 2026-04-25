import type { ExecutionMode, PlanType } from "@autofill/schemas";

export type UserRecord = {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  createdAt: string;
};

export type DeviceRecord = {
  id: string;
  userId: string;
  deviceName: string;
  trusted: boolean;
  createdAt: string;
  revokedAt?: string;
};

export type ProfileRecord = {
  id: string;
  userId: string;
  name: string;
  locale: string;
  fields: Array<{ key: string; value: string; sensitivity: string }>;
  createdAt: string;
};

export type WorkflowRecord = {
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

export type RunRecord = {
  id: string;
  userId: string;
  workflowId: string;
  inputProfileId: string;
  status: "queued" | "running" | "waiting_confirmation" | "failed" | "completed";
  mode: ExecutionMode;
  confidence: number;
  log: string[];
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionRecord = {
  userId: string;
  plan: PlanType;
  aiQuotaRemaining: number;
  captchaQuotaRemaining: number;
  features: string[];
};

export type SyncRecord = {
  userId: string;
  checkpoint: string;
  payload: {
    profiles: Array<Record<string, unknown>>;
    workflows: Array<Record<string, unknown>>;
    settings: Record<string, unknown>;
  };
  deviceId?: string;
  updatedAt: string;
};

export type AuditEvent = {
  id: string;
  userId?: string;
  actor: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AlertRecord = {
  id: string;
  type: "rate_limit_spike" | "execution_failure" | "execution_degraded";
  severity: "low" | "medium" | "high";
  status: "open" | "acknowledged";
  userId?: string;
  source: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  acknowledgedAt?: string;
};

export type IncidentMetricRecord = {
  bucketStart: string;
  type: AlertRecord["type"];
  severity: AlertRecord["severity"];
  source: string;
  count: number;
};
