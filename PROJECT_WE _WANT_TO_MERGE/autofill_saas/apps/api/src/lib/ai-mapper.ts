type FieldInput = {
  selector: string;
  label?: string;
  name?: string;
  placeholder?: string;
  type?: string;
};

type MappingSuggestion = {
  selector: string;
  suggestedKey: string;
  confidence: number;
  reasoning: string;
};

type AiMapRequest = {
  domain: string;
  fields: FieldInput[];
};

type AiMapResult = {
  suggestions: MappingSuggestion[];
  modelVersion: string;
  source: "external" | "local";
};

type ExternalMapperConfig = {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number(value.toFixed(2))));
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeBaseUrl = (url: string | undefined) => {
  if (!url) return undefined;
  const trimmed = url.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
};

const inferKey = (text: string): string => {
  const normalized = text.toLowerCase();
  if (normalized.includes("email")) return "email";
  if (normalized.includes("phone")) return "phone";
  if (normalized.includes("name")) return "full_name";
  if (normalized.includes("address")) return "address_line_1";
  if (normalized.includes("zip") || normalized.includes("postal")) return "postal_code";
  return "custom_field";
};

const localMap = (request: AiMapRequest): AiMapResult => {
  const suggestions: MappingSuggestion[] = request.fields.map((field) => {
    const mergedHint = [field.label, field.name, field.placeholder, field.type].filter(Boolean).join(" ");
    const suggestedKey = inferKey(mergedHint);
    const confidence = suggestedKey === "custom_field" ? 0.58 : 0.84;
    return {
      selector: field.selector,
      suggestedKey,
      confidence,
      reasoning:
        suggestedKey === "custom_field"
          ? "Low-confidence semantic mapping. User confirmation required."
          : `Matched semantic token for ${suggestedKey}.`
    };
  });
  return {
    suggestions,
    modelVersion: "local-heuristic-v1",
    source: "local"
  };
};

const parseExternalSuggestions = (payload: unknown): MappingSuggestion[] | null => {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  if (!Array.isArray(data.suggestions)) return null;
  const parsed: MappingSuggestion[] = [];
  for (const item of data.suggestions) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (typeof row.selector !== "string" || typeof row.suggestedKey !== "string") return null;
    const confidenceRaw = typeof row.confidence === "number" ? row.confidence : 0.5;
    parsed.push({
      selector: row.selector,
      suggestedKey: row.suggestedKey,
      confidence: clamp(confidenceRaw, 0, 1),
      reasoning: typeof row.reasoning === "string" ? row.reasoning : "Model-generated mapping"
    });
  }
  return parsed;
};

export class AiFieldMapper {
  private readonly baseUrl?: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: ExternalMapperConfig = {}) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.apiKey = config.apiKey?.trim();
    this.timeoutMs = clamp(Number(config.timeoutMs ?? 4500), 500, 30000);
    this.maxRetries = clamp(Number(config.maxRetries ?? 2), 0, 5);
  }

  async map(request: AiMapRequest): Promise<AiMapResult> {
    if (!this.baseUrl || !this.apiKey) {
      return localMap(request);
    }

    const retryDelays = [200, 500, 1000, 1800, 2800];

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeoutRef = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(`${this.baseUrl}/map-fields`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey
          },
          body: JSON.stringify(request),
          signal: controller.signal
        });
        clearTimeout(timeoutRef);
        if (!response.ok) {
          if (attempt < this.maxRetries) {
            await delay(retryDelays[Math.min(attempt, retryDelays.length - 1)]);
            continue;
          }
          return localMap(request);
        }
        const payload = (await response.json()) as unknown;
        const suggestions = parseExternalSuggestions(payload);
        if (!suggestions) {
          if (attempt < this.maxRetries) {
            await delay(retryDelays[Math.min(attempt, retryDelays.length - 1)]);
            continue;
          }
          return localMap(request);
        }
        const parsedPayload = payload as Record<string, unknown>;
        return {
          suggestions,
          modelVersion:
            typeof parsedPayload.modelVersion === "string" ? parsedPayload.modelVersion : "external-onnx-v1",
          source: "external"
        };
      } catch (_error) {
        clearTimeout(timeoutRef);
        if (attempt < this.maxRetries) {
          await delay(retryDelays[Math.min(attempt, retryDelays.length - 1)]);
          continue;
        }
      }
    }

    return localMap(request);
  }
}
