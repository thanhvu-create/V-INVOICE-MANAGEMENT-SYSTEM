-- Metal Type Registry: override định giá theo mã chính xác (SV925, 18KW, ...).
-- An toàn chạy nhiều lần.
CREATE TABLE IF NOT EXISTS metal_types (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT NOT NULL UNIQUE,
  label               TEXT,
  price_mode          TEXT NOT NULL CHECK (price_mode IN ('dynamic','fixed')),
  base_kind           TEXT CHECK (base_kind IN ('karat','ag','pt','pd')),
  karat               INT,
  surcharge_per_gram  NUMERIC DEFAULT 0,
  fixed_per_gram      NUMERIC,
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
