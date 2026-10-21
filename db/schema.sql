-- SomaliNet Hotspot — Database Schema
-- Run: node db/migrate.js

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       VARCHAR(20) UNIQUE NOT NULL,
  email       VARCHAR(120) UNIQUE,
  name        VARCHAR(100) NOT NULL,
  password    VARCHAR(255) NOT NULL,
  role        VARCHAR(20) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'USER';
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_original_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'USER';
DO $$ BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
UPDATE users SET role = UPPER(role) WHERE role IN ('user', 'admin');
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('USER', 'ADMIN'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plans (seeded below)
CREATE TABLE IF NOT EXISTS plans (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,
  duration_h  INTEGER NOT NULL,
  price_usd   NUMERIC(8,2) NOT NULL,
  mikrotik_profile VARCHAR(50) NOT NULL
);

ALTER TABLE plans ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
DO $$ BEGIN
  ALTER TABLE plans ADD CONSTRAINT plans_price_positive CHECK (price_usd >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE plans ADD CONSTRAINT plans_duration_positive CHECK (duration_h > 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id),
  plan_id        INTEGER REFERENCES plans(id),
  amount_usd     NUMERIC(8,2) NOT NULL,
  provider       VARCHAR(20) NOT NULL,
  provider_ref   VARCHAR(100),
  phone          VARCHAR(20) NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at   TIMESTAMPTZ
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS plan_name_snapshot VARCHAR(50);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS plan_description_snapshot TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS duration_h_snapshot INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS mikrotik_profile_snapshot VARCHAR(50);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency_snapshot VARCHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS manual_override BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS manual_override_by UUID REFERENCES users(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS activation_status VARCHAR(20) NOT NULL DEFAULT 'not_started';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS activation_error TEXT;
DO $$ BEGIN
  ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('pending', 'success', 'failed', 'unknown')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE payments ADD CONSTRAINT payments_activation_status_check CHECK (activation_status IN ('not_started', 'pending', 'activated', 'failed')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
UPDATE payments p SET plan_name_snapshot = pl.name,
  plan_description_snapshot = pl.description, duration_h_snapshot = pl.duration_h,
  mikrotik_profile_snapshot = pl.mikrotik_profile, currency_snapshot = pl.currency
FROM plans pl WHERE p.plan_id = pl.id AND p.plan_name_snapshot IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref_unique_idx
  ON payments(provider, provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS customer_package_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  payment_id UUID REFERENCES payments(id),
  assigned_by UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'revoked')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS customer_package_assignments_user_idx ON customer_package_assignments(user_id);

CREATE TABLE IF NOT EXISTS admin_otp_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE users
SET name = 'Astarico Yoga', is_original_admin = TRUE, role = 'ADMIN'
WHERE LOWER(email) = 'astaricoyoga@gmail.com';

-- Sessions (mirrors MikroTik hotspot user)
CREATE TABLE IF NOT EXISTS sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id),
  payment_id     UUID REFERENCES payments(id),
  mac_address    VARCHAR(20),
  ip_address     VARCHAR(20),
  mikrotik_user  VARCHAR(60) NOT NULL,
  plan_id        INTEGER REFERENCES plans(id),
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  active         BOOLEAN DEFAULT TRUE,
  activation_status VARCHAR(20) NOT NULL DEFAULT 'active'
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS activation_status VARCHAR(20) NOT NULL DEFAULT 'active';
DO $$ BEGIN
  ALTER TABLE sessions ADD CONSTRAINT sessions_activation_status_check CHECK (activation_status IN ('pending', 'active', 'failed', 'expired')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS sessions_payment_unique_idx ON sessions(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sessions_activation_status_idx ON sessions(activation_status);

-- Vouchers
CREATE TABLE IF NOT EXISTS vouchers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) UNIQUE NOT NULL,
  plan_id     INTEGER REFERENCES plans(id),
  redeemed    BOOLEAN DEFAULT FALSE,
  redeemed_by UUID REFERENCES users(id),
  redeemed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Keep one canonical row per package and preserve references from existing data.
DO $$
DECLARE
  duplicate_plan RECORD;
  canonical_id INTEGER;
BEGIN
  FOR duplicate_plan IN
    SELECT name, duration_h, price_usd, mikrotik_profile
    FROM plans
    GROUP BY name, duration_h, price_usd, mikrotik_profile
    HAVING COUNT(*) > 1
  LOOP
    SELECT MIN(id) INTO canonical_id
    FROM plans
    WHERE name = duplicate_plan.name
      AND duration_h = duplicate_plan.duration_h
      AND price_usd = duplicate_plan.price_usd
      AND mikrotik_profile = duplicate_plan.mikrotik_profile;

    UPDATE payments
    SET plan_id = canonical_id
    WHERE plan_id IN (
      SELECT id FROM plans
      WHERE name = duplicate_plan.name
        AND duration_h = duplicate_plan.duration_h
        AND price_usd = duplicate_plan.price_usd
        AND mikrotik_profile = duplicate_plan.mikrotik_profile
        AND id <> canonical_id
    );

    UPDATE sessions
    SET plan_id = canonical_id
    WHERE plan_id IN (
      SELECT id FROM plans
      WHERE name = duplicate_plan.name
        AND duration_h = duplicate_plan.duration_h
        AND price_usd = duplicate_plan.price_usd
        AND mikrotik_profile = duplicate_plan.mikrotik_profile
        AND id <> canonical_id
    );

    UPDATE vouchers
    SET plan_id = canonical_id
    WHERE plan_id IN (
      SELECT id FROM plans
      WHERE name = duplicate_plan.name
        AND duration_h = duplicate_plan.duration_h
        AND price_usd = duplicate_plan.price_usd
        AND mikrotik_profile = duplicate_plan.mikrotik_profile
        AND id <> canonical_id
    );

    DELETE FROM plans
    WHERE name = duplicate_plan.name
      AND duration_h = duplicate_plan.duration_h
      AND price_usd = duplicate_plan.price_usd
      AND mikrotik_profile = duplicate_plan.mikrotik_profile
      AND id <> canonical_id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS plans_identity_idx
  ON plans(name, duration_h, price_usd, mikrotik_profile);

-- Seed plans
INSERT INTO plans (name, duration_h, price_usd, mikrotik_profile) VALUES
  ('Degdeg', 1, 0.50, '1hour'),
  ('Caadi', 3, 1.00, '3hour'),
  ('Maalinle', 24, 2.00, '1day'),
  ('Toddobaad', 168, 10.00, '7day')
ON CONFLICT (name, duration_h, price_usd, mikrotik_profile) DO NOTHING;
