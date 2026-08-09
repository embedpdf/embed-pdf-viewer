-- Tenant suspension (Postgres): the operator's circuit breaker. A
-- stated decision the engine enforces mechanically — every tenant JWT,
-- doc JWT, and share exchange for a suspended tenant fails 403 until
-- resume; the API token is exempt so a suspended tenant can still be
-- inspected, exported, resumed, or deleted. The engine never knows WHY
-- (billing, abuse, customer request) — that judgment lives with the
-- operator.

ALTER TABLE tenants ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'suspended'));
ALTER TABLE tenants ADD COLUMN suspended_at BIGINT;
