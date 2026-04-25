import { syncPushRequestSchema } from "@autofill/schemas";
import type { FastifyInstance } from "fastify";
import { authGuard } from "../../lib/auth.js";
import type { AppContext } from "../../lib/context.js";
import { withAudit } from "../../lib/context.js";

type SyncPayload = {
  profiles: Array<Record<string, unknown>>;
  workflows: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
};

type MergeCandidate = {
  key: string;
  timestamp: number;
  sourceRank: number;
  fingerprint: string;
  value: Record<string, unknown>;
};

const normalizePayload = (payload: unknown): SyncPayload => {
  const raw = (payload as Partial<SyncPayload>) || {};
  return {
    profiles: Array.isArray(raw.profiles) ? raw.profiles : [],
    workflows: Array.isArray(raw.workflows) ? raw.workflows : [],
    settings:
      raw.settings && typeof raw.settings === "object" && !Array.isArray(raw.settings)
        ? raw.settings
        : {}
  };
};

const parseTimestamp = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
};

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
};

const getRecordKey = (record: Record<string, unknown>, index: number, namespace: string): string => {
  const idLike = [record.id, record.profileId, record.workflowId, record.name]
    .find((value) => typeof value === "string" && String(value).trim().length > 0);
  if (typeof idLike === "string") return `${namespace}:${idLike.trim()}`;
  return `${namespace}:anon:${index}:${stableStringify(record)}`;
};

const getRecordTimestamp = (record: Record<string, unknown>): number =>
  Math.max(
    parseTimestamp(record.updatedAt),
    parseTimestamp(record.createdAt),
    parseTimestamp(record.timestamp),
    parseTimestamp(record.modifiedAt)
  );

const mergeRecordSet = (
  namespace: string,
  sources: Array<{ records: Array<Record<string, unknown>>; sourceRank: number }>
): Array<Record<string, unknown>> => {
  const merged = new Map<string, MergeCandidate>();
  sources.forEach((source) => {
    source.records.forEach((record, index) => {
      const key = getRecordKey(record, index, namespace);
      const timestamp = getRecordTimestamp(record);
      const fingerprint = stableStringify(record);
      const current = merged.get(key);
      if (!current) {
        merged.set(key, { key, timestamp, sourceRank: source.sourceRank, fingerprint, value: record });
        return;
      }
      const shouldReplace =
        timestamp > current.timestamp ||
        (timestamp === current.timestamp && source.sourceRank > current.sourceRank) ||
        (timestamp === current.timestamp &&
          source.sourceRank === current.sourceRank &&
          fingerprint > current.fingerprint);
      if (shouldReplace) {
        merged.set(key, { key, timestamp, sourceRank: source.sourceRank, fingerprint, value: record });
      }
    });
  });

  return [...merged.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((item) => item.value);
};

const mergeSettings = (settings: Array<Record<string, unknown>>): Record<string, unknown> => {
  const merged: Record<string, unknown> = {};
  settings.forEach((entry) => {
    Object.keys(entry)
      .sort()
      .forEach((key) => {
        merged[key] = entry[key];
      });
  });
  return merged;
};

const mergePayload = (
  serverCanonical: SyncPayload,
  storedPayload: SyncPayload,
  incomingPayload: SyncPayload
): SyncPayload => ({
  profiles: mergeRecordSet("profile", [
    { records: serverCanonical.profiles, sourceRank: 1 },
    { records: storedPayload.profiles, sourceRank: 2 },
    { records: incomingPayload.profiles, sourceRank: 3 }
  ]),
  workflows: mergeRecordSet("workflow", [
    { records: serverCanonical.workflows, sourceRank: 1 },
    { records: storedPayload.workflows, sourceRank: 2 },
    { records: incomingPayload.workflows, sourceRank: 3 }
  ]),
  settings: mergeSettings([serverCanonical.settings, storedPayload.settings, incomingPayload.settings])
});

export const registerSyncRoutes = (app: FastifyInstance, context: AppContext) => {
  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/sync")) {
      await authGuard(request, reply);
    }
  });

  app.post("/sync/push", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const parsed = syncPushRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: "INVALID_BODY", message: parsed.error.message });
    }

    const existingSync = await context.store.getSyncByUser(auth.userId);
    const existingPayload = normalizePayload(existingSync?.payload);
    const incomingPayload = normalizePayload(parsed.data.payload);

    const canonicalProfiles = (await context.store.listProfilesByUser(auth.userId)).map((profile) => ({
      ...profile,
      entityType: "profile"
    }));
    const canonicalWorkflows = (await context.store.listWorkflowsByUser(auth.userId)).map((workflow) => ({
      ...workflow,
      entityType: "workflow"
    }));
    const canonicalPayload: SyncPayload = {
      profiles: canonicalProfiles,
      workflows: canonicalWorkflows,
      settings: { defaultMode: "assisted" }
    };

    const mergedPayload = mergePayload(canonicalPayload, existingPayload, incomingPayload);
    const checkpoint = existingSync
      ? [existingSync.checkpoint, parsed.data.checkpoint].sort().at(-1) ?? parsed.data.checkpoint
      : parsed.data.checkpoint;
    const deviceHeader = request.headers["x-device-id"];
    const deviceId = Array.isArray(deviceHeader) ? deviceHeader[0] : deviceHeader;

    const updatedSync = await context.store.upsertSync({
      userId: auth.userId,
      checkpoint,
      payload: mergedPayload,
      deviceId: typeof deviceId === "string" ? deviceId : existingSync?.deviceId,
      updatedAt: new Date().toISOString()
    });

    withAudit(app, context, {
      userId: auth.userId,
      actor: "sync_service",
      action: "sync.push",
      metadata: {
        checkpoint: parsed.data.checkpoint,
        mergedCheckpoint: updatedSync.checkpoint,
        profileCount: mergedPayload.profiles.length,
        workflowCount: mergedPayload.workflows.length
      }
    });

    return reply.send({
      status: "ok",
      checkpoint: updatedSync.checkpoint,
      mergedAt: updatedSync.updatedAt,
      payload: mergedPayload
    });
  });

  app.get("/sync/pull", async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const sync = await context.store.getSyncByUser(auth.userId);
    const storedPayload = normalizePayload(sync?.payload);
    const profiles = await context.store.listProfilesByUser(auth.userId);
    const workflows = await context.store.listWorkflowsByUser(auth.userId);
    const mergedPayload = mergePayload(
      {
        profiles: profiles.map((profile) => ({ ...profile, entityType: "profile" })),
        workflows: workflows.map((workflow) => ({ ...workflow, entityType: "workflow" })),
        settings: { defaultMode: "assisted" }
      },
      storedPayload,
      { profiles: [], workflows: [], settings: {} }
    );

    return reply.send({
      checkpoint: sync?.checkpoint ?? "initial",
      profiles: mergedPayload.profiles,
      workflows: mergedPayload.workflows,
      settings: mergedPayload.settings
    });
  });
};
