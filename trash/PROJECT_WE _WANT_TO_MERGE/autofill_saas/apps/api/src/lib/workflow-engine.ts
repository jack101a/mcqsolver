import type { ProfileRecord, WorkflowRecord } from "./types.js";

type ExecutionStatus = "completed" | "waiting_confirmation" | "failed";

type ExecutionResult = {
  status: ExecutionStatus;
  confidence: number;
  log: string[];
  failedStepId?: string;
  needsConfirmation?: boolean;
};

type RuntimeState = {
  variables: Record<string, string>;
};

const clampConfidence = (value: number) => Math.max(0.3, Math.min(0.99, Number(value.toFixed(2))));

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const asStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const describeStep = (stepId: string, stepType: string, message: string) =>
  `[${stepId}] ${stepType}: ${message}`;

const executeStep = (
  step: Record<string, unknown>,
  profileMap: Map<string, string>,
  state: RuntimeState,
  mode: WorkflowRecord["executionMode"]
): {
  ok: boolean;
  logLine: string;
  confidenceDelta: number;
  needsConfirmation?: boolean;
} => {
  const id = asString(step.id) || "step";
  const type = asString(step.type) || "unknown";
  const config = (step.config as Record<string, unknown>) || {};

  if (type === "navigate") {
    const url = asString(config.url);
    if (!url) {
      return { ok: false, logLine: describeStep(id, type, "missing url"), confidenceDelta: -0.1 };
    }
    return { ok: true, logLine: describeStep(id, type, `navigated to ${url}`), confidenceDelta: -0.01 };
  }

  if (type === "wait_for_selector") {
    const selector = asString(config.selector);
    if (!selector) {
      return { ok: false, logLine: describeStep(id, type, "missing selector"), confidenceDelta: -0.09 };
    }
    return { ok: true, logLine: describeStep(id, type, `selector ready ${selector}`), confidenceDelta: -0.01 };
  }

  if (type === "autofill") {
    const requiredFields = asStringArray(config.requiredFields);
    const missing = requiredFields.filter((key) => !profileMap.has(key));
    if (missing.length) {
      return {
        ok: false,
        logLine: describeStep(id, type, `missing profile fields: ${missing.join(", ")}`),
        confidenceDelta: -0.12
      };
    }
    return { ok: true, logLine: describeStep(id, type, "fields prepared for extension execution"), confidenceDelta: -0.02 };
  }

  if (type === "click" || type === "select") {
    const selector = asString(config.selector);
    if (!selector) {
      return { ok: false, logLine: describeStep(id, type, "missing selector"), confidenceDelta: -0.08 };
    }
    return { ok: true, logLine: describeStep(id, type, `queued ui action for ${selector}`), confidenceDelta: -0.02 };
  }

  if (type === "upload_file") {
    const profileField = asString(config.profileField);
    if (!profileField) {
      return { ok: false, logLine: describeStep(id, type, "missing profileField"), confidenceDelta: -0.09 };
    }
    if (!profileMap.has(profileField)) {
      return {
        ok: false,
        logLine: describeStep(id, type, `profile field not found: ${profileField}`),
        confidenceDelta: -0.1
      };
    }
    return { ok: true, logLine: describeStep(id, type, `file source resolved from ${profileField}`), confidenceDelta: -0.03 };
  }

  if (type === "set_variable") {
    const key = asString(config.key);
    const value = asString(config.value);
    if (!key) {
      return { ok: false, logLine: describeStep(id, type, "missing variable key"), confidenceDelta: -0.06 };
    }
    state.variables[key] = value;
    return { ok: true, logLine: describeStep(id, type, `variable set ${key}`), confidenceDelta: -0.01 };
  }

  if (type === "if") {
    const variable = asString(config.variable);
    const equals = asString(config.equals);
    const runtimeValue = state.variables[variable] ?? profileMap.get(variable) ?? "";
    const matched = runtimeValue === equals;
    return {
      ok: true,
      logLine: describeStep(id, type, `condition ${variable} == ${equals} -> ${matched ? "true" : "false"}`),
      confidenceDelta: -0.01
    };
  }

  if (type === "captcha") {
    if (mode === "automated") {
      return { ok: true, logLine: describeStep(id, type, "captcha delegated to solver"), confidenceDelta: -0.07 };
    }
    return {
      ok: true,
      logLine: describeStep(id, type, "captcha requires user confirmation"),
      confidenceDelta: -0.08,
      needsConfirmation: true
    };
  }

  if (type === "confirm") {
    if (mode === "automated") {
      return { ok: true, logLine: describeStep(id, type, "auto-confirmed by execution mode"), confidenceDelta: -0.03 };
    }
    return {
      ok: true,
      logLine: describeStep(id, type, "awaiting manual confirmation"),
      confidenceDelta: -0.05,
      needsConfirmation: true
    };
  }

  if (type === "end") {
    return { ok: true, logLine: describeStep(id, type, "workflow finished"), confidenceDelta: 0 };
  }

  return { ok: false, logLine: describeStep(id, type, "unsupported step type"), confidenceDelta: -0.12 };
};

export const executeWorkflowEngine = (
  workflow: WorkflowRecord,
  profile: ProfileRecord,
  mode: WorkflowRecord["executionMode"]
): ExecutionResult => {
  const profileMap = new Map(profile.fields.map((field) => [field.key, field.value]));
  const state: RuntimeState = { variables: {} };
  const log: string[] = [];
  let confidence = 0.92;

  for (const rawStep of workflow.steps) {
    const step = rawStep as Record<string, unknown>;
    const stepId = asString(step.id) || "step";
    const stepType = asString(step.type) || "unknown";
    const retryPolicy = (step.retryPolicy as Record<string, unknown>) || {};
    const maxRetries = Number.isInteger(retryPolicy.maxRetries) ? Number(retryPolicy.maxRetries) : 0;
    const retries = Math.max(0, Math.min(5, maxRetries));

    let executed = false;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const result = executeStep(step, profileMap, state, mode);
      confidence += result.confidenceDelta;
      log.push(result.logLine + (attempt > 0 ? ` (retry ${attempt})` : ""));
      if (!result.ok) {
        continue;
      }
      executed = true;
      if (result.needsConfirmation) {
        return {
          status: "waiting_confirmation",
          confidence: clampConfidence(confidence),
          log: [...log, "Execution paused for user confirmation"],
          failedStepId: stepId,
          needsConfirmation: true
        };
      }
      break;
    }

    if (!executed) {
      return {
        status: "failed",
        confidence: clampConfidence(confidence),
        log: [...log, `Execution failed at step ${stepId} (${stepType})`],
        failedStepId: stepId
      };
    }
  }

  return {
    status: "completed",
    confidence: clampConfidence(confidence),
    log: [...log, "Execution completed successfully"]
  };
};
