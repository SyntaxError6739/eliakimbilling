-- SomaliNet Hotspot — Database Schema
-- Run: node db/migrate.js

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       VARCHAR(20) UNIQUE NOT NULL,
  email       VARCHAR(120) UNIQUE,
  name        VARCHAR(100) NOT NULL,
  password    VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Plans (seeded below)
CREATE TABLE IF NOT EXISTS plans (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,
  duration_h  INTEGER NOT NULL,
  price_usd   NUMERIC(8,2) NOT NULL,
  mikrotik_profile VARCHAR(50) NOT NULL
);

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
  active         BOOLEAN DEFAULT TRUE
);

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

-- Seed plans
INSERT INTO plans (name, duration_h, price_usd, mikrotik_profile) VALUES
  ('Degdeg', 1, 0.50, '1hour'),
  ('Caadi', 3, 1.00, '3hour'),
  ('Maalinle', 24, 2.00, '1day'),
  ('Toddobaad', 168, 10.00, '7day')
ON CONFLICT DO NOTHING;
