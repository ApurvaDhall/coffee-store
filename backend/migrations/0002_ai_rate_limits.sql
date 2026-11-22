CREATE TABLE IF NOT EXISTS ai_rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_window_start
ON ai_rate_limits(window_start);
