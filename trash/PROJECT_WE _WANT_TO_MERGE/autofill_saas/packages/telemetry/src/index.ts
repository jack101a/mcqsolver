export type TelemetryEvent = {
  event: string;
  level: "info" | "warn" | "error";
  timestamp: string;
  context: Record<string, unknown>;
};

export const buildEvent = (
  event: string,
  level: TelemetryEvent["level"],
  context: Record<string, unknown>
): TelemetryEvent => ({
  event,
  level,
  timestamp: new Date().toISOString(),
  context
});
