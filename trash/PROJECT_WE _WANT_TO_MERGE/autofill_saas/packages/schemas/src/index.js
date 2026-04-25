import { z } from "zod";
export const executionModeSchema = z.enum(["manual", "assisted", "automated"]);
export const planSchema = z.enum(["free", "pro", "enterprise"]);
export const loginRequestSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    deviceName: z.string().min(2).max(120)
});
export const registerRequestSchema = loginRequestSchema.extend({
    fullName: z.string().min(2).max(120)
});
export const authTokenSchema = z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresInSeconds: z.number().int().positive()
});
export const profileFieldValueSchema = z.object({
    key: z.string().min(1).max(100),
    value: z.string().max(5000),
    sensitivity: z.enum(["standard", "sensitive", "high"]).default("standard")
});
export const createProfileRequestSchema = z.object({
    name: z.string().min(1).max(120),
    locale: z.string().min(2).max(20),
    fields: z.array(profileFieldValueSchema).min(1)
});
export const workflowStepSchema = z.object({
    id: z.string().min(1),
    type: z.enum([
        "navigate",
        "wait_for_selector",
        "autofill",
        "click",
        "select",
        "upload_file",
        "if",
        "set_variable",
        "captcha",
        "confirm",
        "end"
    ]),
    config: z.record(z.string(), z.unknown()),
    retryPolicy: z
        .object({
        maxRetries: z.number().int().min(0).max(5),
        backoffMs: z.number().int().min(0).max(120000)
    })
        .optional()
});
export const createWorkflowRequestSchema = z.object({
    name: z.string().min(2).max(150),
    description: z.string().max(1000).optional(),
    sitePattern: z.string().min(3),
    executionMode: executionModeSchema,
    steps: z.array(workflowStepSchema).min(1)
});
export const runWorkflowRequestSchema = z.object({
    workflowId: z.string().min(1),
    inputProfileId: z.string().min(1),
    modeOverride: executionModeSchema.optional()
});
export const aiMapFieldRequestSchema = z.object({
    domain: z.string().min(3),
    fields: z.array(z.object({
        selector: z.string().min(1),
        label: z.string().optional(),
        name: z.string().optional(),
        placeholder: z.string().optional(),
        type: z.string().optional()
    }))
});
export const captchaRequestSchema = z.object({
    runId: z.string().min(1),
    captchaType: z.enum(["image_text", "checkbox", "image_grid", "unknown"]),
    imageBase64: z.string().optional()
});
export const syncPushRequestSchema = z.object({
    checkpoint: z.string().min(1),
    payload: z.object({
        profiles: z.array(z.record(z.string(), z.unknown())).default([]),
        workflows: z.array(z.record(z.string(), z.unknown())).default([]),
        settings: z.record(z.string(), z.unknown()).default({})
    })
});
export const subscriptionStateSchema = z.object({
    plan: planSchema,
    aiQuotaRemaining: z.number().int().min(0),
    captchaQuotaRemaining: z.number().int().min(0),
    features: z.array(z.string())
});
export const apiErrorSchema = z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
});
//# sourceMappingURL=index.js.map