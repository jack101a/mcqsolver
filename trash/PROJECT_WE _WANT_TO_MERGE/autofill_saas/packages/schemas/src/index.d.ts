import { z } from "zod";
export declare const executionModeSchema: z.ZodEnum<["manual", "assisted", "automated"]>;
export type ExecutionMode = z.infer<typeof executionModeSchema>;
export declare const planSchema: z.ZodEnum<["free", "pro", "enterprise"]>;
export type PlanType = z.infer<typeof planSchema>;
export declare const loginRequestSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    deviceName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    deviceName: string;
}, {
    email: string;
    password: string;
    deviceName: string;
}>;
export declare const registerRequestSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    deviceName: z.ZodString;
} & {
    fullName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    deviceName: string;
    fullName: string;
}, {
    email: string;
    password: string;
    deviceName: string;
    fullName: string;
}>;
export declare const authTokenSchema: z.ZodObject<{
    accessToken: z.ZodString;
    refreshToken: z.ZodString;
    expiresInSeconds: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    accessToken: string;
    refreshToken: string;
    expiresInSeconds: number;
}, {
    accessToken: string;
    refreshToken: string;
    expiresInSeconds: number;
}>;
export declare const profileFieldValueSchema: z.ZodObject<{
    key: z.ZodString;
    value: z.ZodString;
    sensitivity: z.ZodDefault<z.ZodEnum<["standard", "sensitive", "high"]>>;
}, "strip", z.ZodTypeAny, {
    value: string;
    key: string;
    sensitivity: "standard" | "sensitive" | "high";
}, {
    value: string;
    key: string;
    sensitivity?: "standard" | "sensitive" | "high" | undefined;
}>;
export declare const createProfileRequestSchema: z.ZodObject<{
    name: z.ZodString;
    locale: z.ZodString;
    fields: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        value: z.ZodString;
        sensitivity: z.ZodDefault<z.ZodEnum<["standard", "sensitive", "high"]>>;
    }, "strip", z.ZodTypeAny, {
        value: string;
        key: string;
        sensitivity: "standard" | "sensitive" | "high";
    }, {
        value: string;
        key: string;
        sensitivity?: "standard" | "sensitive" | "high" | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    locale: string;
    fields: {
        value: string;
        key: string;
        sensitivity: "standard" | "sensitive" | "high";
    }[];
}, {
    name: string;
    locale: string;
    fields: {
        value: string;
        key: string;
        sensitivity?: "standard" | "sensitive" | "high" | undefined;
    }[];
}>;
export declare const workflowStepSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["navigate", "wait_for_selector", "autofill", "click", "select", "upload_file", "if", "set_variable", "captcha", "confirm", "end"]>;
    config: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    retryPolicy: z.ZodOptional<z.ZodObject<{
        maxRetries: z.ZodNumber;
        backoffMs: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        maxRetries: number;
        backoffMs: number;
    }, {
        maxRetries: number;
        backoffMs: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    type: "navigate" | "wait_for_selector" | "autofill" | "click" | "select" | "upload_file" | "if" | "set_variable" | "captcha" | "confirm" | "end";
    id: string;
    config: Record<string, unknown>;
    retryPolicy?: {
        maxRetries: number;
        backoffMs: number;
    } | undefined;
}, {
    type: "navigate" | "wait_for_selector" | "autofill" | "click" | "select" | "upload_file" | "if" | "set_variable" | "captcha" | "confirm" | "end";
    id: string;
    config: Record<string, unknown>;
    retryPolicy?: {
        maxRetries: number;
        backoffMs: number;
    } | undefined;
}>;
export declare const createWorkflowRequestSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    sitePattern: z.ZodString;
    executionMode: z.ZodEnum<["manual", "assisted", "automated"]>;
    steps: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["navigate", "wait_for_selector", "autofill", "click", "select", "upload_file", "if", "set_variable", "captcha", "confirm", "end"]>;
        config: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        retryPolicy: z.ZodOptional<z.ZodObject<{
            maxRetries: z.ZodNumber;
            backoffMs: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            maxRetries: number;
            backoffMs: number;
        }, {
            maxRetries: number;
            backoffMs: number;
        }>>;
    }, "strip", z.ZodTypeAny, {
        type: "navigate" | "wait_for_selector" | "autofill" | "click" | "select" | "upload_file" | "if" | "set_variable" | "captcha" | "confirm" | "end";
        id: string;
        config: Record<string, unknown>;
        retryPolicy?: {
            maxRetries: number;
            backoffMs: number;
        } | undefined;
    }, {
        type: "navigate" | "wait_for_selector" | "autofill" | "click" | "select" | "upload_file" | "if" | "set_variable" | "captcha" | "confirm" | "end";
        id: string;
        config: Record<string, unknown>;
        retryPolicy?: {
            maxRetries: number;
            backoffMs: number;
        } | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    sitePattern: string;
    executionMode: "manual" | "assisted" | "automated";
    steps: {
        type: "navigate" | "wait_for_selector" | "autofill" | "click" | "select" | "upload_file" | "if" | "set_variable" | "captcha" | "confirm" | "end";
        id: string;
        config: Record<string, unknown>;
        retryPolicy?: {
            maxRetries: number;
            backoffMs: number;
        } | undefined;
    }[];
    description?: string | undefined;
}, {
    name: string;
    sitePattern: string;
    executionMode: "manual" | "assisted" | "automated";
    steps: {
        type: "navigate" | "wait_for_selector" | "autofill" | "click" | "select" | "upload_file" | "if" | "set_variable" | "captcha" | "confirm" | "end";
        id: string;
        config: Record<string, unknown>;
        retryPolicy?: {
            maxRetries: number;
            backoffMs: number;
        } | undefined;
    }[];
    description?: string | undefined;
}>;
export declare const runWorkflowRequestSchema: z.ZodObject<{
    workflowId: z.ZodString;
    inputProfileId: z.ZodString;
    modeOverride: z.ZodOptional<z.ZodEnum<["manual", "assisted", "automated"]>>;
}, "strip", z.ZodTypeAny, {
    workflowId: string;
    inputProfileId: string;
    modeOverride?: "manual" | "assisted" | "automated" | undefined;
}, {
    workflowId: string;
    inputProfileId: string;
    modeOverride?: "manual" | "assisted" | "automated" | undefined;
}>;
export declare const aiMapFieldRequestSchema: z.ZodObject<{
    domain: z.ZodString;
    fields: z.ZodArray<z.ZodObject<{
        selector: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        placeholder: z.ZodOptional<z.ZodString>;
        type: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        selector: string;
        type?: string | undefined;
        name?: string | undefined;
        label?: string | undefined;
        placeholder?: string | undefined;
    }, {
        selector: string;
        type?: string | undefined;
        name?: string | undefined;
        label?: string | undefined;
        placeholder?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    fields: {
        selector: string;
        type?: string | undefined;
        name?: string | undefined;
        label?: string | undefined;
        placeholder?: string | undefined;
    }[];
    domain: string;
}, {
    fields: {
        selector: string;
        type?: string | undefined;
        name?: string | undefined;
        label?: string | undefined;
        placeholder?: string | undefined;
    }[];
    domain: string;
}>;
export declare const captchaRequestSchema: z.ZodObject<{
    runId: z.ZodString;
    captchaType: z.ZodEnum<["image_text", "checkbox", "image_grid", "unknown"]>;
    imageBase64: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    runId: string;
    captchaType: "unknown" | "image_text" | "checkbox" | "image_grid";
    imageBase64?: string | undefined;
}, {
    runId: string;
    captchaType: "unknown" | "image_text" | "checkbox" | "image_grid";
    imageBase64?: string | undefined;
}>;
export declare const syncPushRequestSchema: z.ZodObject<{
    checkpoint: z.ZodString;
    payload: z.ZodObject<{
        profiles: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
        workflows: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
        settings: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        profiles: Record<string, unknown>[];
        workflows: Record<string, unknown>[];
        settings: Record<string, unknown>;
    }, {
        profiles?: Record<string, unknown>[] | undefined;
        workflows?: Record<string, unknown>[] | undefined;
        settings?: Record<string, unknown> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    checkpoint: string;
    payload: {
        profiles: Record<string, unknown>[];
        workflows: Record<string, unknown>[];
        settings: Record<string, unknown>;
    };
}, {
    checkpoint: string;
    payload: {
        profiles?: Record<string, unknown>[] | undefined;
        workflows?: Record<string, unknown>[] | undefined;
        settings?: Record<string, unknown> | undefined;
    };
}>;
export declare const subscriptionStateSchema: z.ZodObject<{
    plan: z.ZodEnum<["free", "pro", "enterprise"]>;
    aiQuotaRemaining: z.ZodNumber;
    captchaQuotaRemaining: z.ZodNumber;
    features: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    plan: "free" | "pro" | "enterprise";
    aiQuotaRemaining: number;
    captchaQuotaRemaining: number;
    features: string[];
}, {
    plan: "free" | "pro" | "enterprise";
    aiQuotaRemaining: number;
    captchaQuotaRemaining: number;
    features: string[];
}>;
export declare const apiErrorSchema: z.ZodObject<{
    code: z.ZodString;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    code: string;
    message: string;
    details?: unknown;
}, {
    code: string;
    message: string;
    details?: unknown;
}>;
