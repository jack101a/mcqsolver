CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  trusted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  ai_quota_remaining INTEGER NOT NULL,
  captcha_quota_remaining INTEGER NOT NULL,
  features JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  locale TEXT NOT NULL,
  fields JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  site_pattern TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  steps JSONB NOT NULL,
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  input_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  confidence NUMERIC(4, 2) NOT NULL,
  log JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  checkpoint TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{"profiles":[],"workflows":[],"settings":{}}'::jsonb,
  device_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE sync_state
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{"profiles":[],"workflows":[],"settings":{}}'::jsonb;
ALTER TABLE sync_state
  ADD COLUMN IF NOT EXISTS device_id TEXT;

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id BIGSERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_events (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  counter_key TEXT NOT NULL,
  window_start_ms BIGINT NOT NULL,
  hit_count INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (counter_key, window_start_ms)
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS incident_metrics_hourly (
  bucket_start TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  source TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (bucket_start, type, severity, source)
);
