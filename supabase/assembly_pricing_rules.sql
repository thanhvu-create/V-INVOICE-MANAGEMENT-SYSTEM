-- Assembly Pricing Rules
-- Fabrication cost lookup by sub_class (SP có xoàn defaults)

CREATE TABLE IF NOT EXISTS assembly_pricing_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_class   TEXT UNIQUE NOT NULL,
  gia_cong    NUMERIC(10,2) NOT NULL DEFAULT 0,
  duc         NUMERIC(10,2) NOT NULL DEFAULT 0,
  thiet_ke    NUMERIC(10,2) NOT NULL DEFAULT 0,
  resin       NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed from GIÁ CÔNG TRONG INVOICE.xlsx → "Assembly Price(SP có xoàn)"
INSERT INTO assembly_pricing_rules (sub_class, gia_cong, duc, thiet_ke, resin) VALUES
  ('RI',   67,  25, 29,  29),
  ('PD',   67,  25, 29,  29),
  ('ER',   76,  33, 36,  36),
  ('BL',   95,  58, 57,  43),
  ('BG',   95,  58, 57,  43),
  ('CH',   95,  58, 57,  43),
  ('NL',  100,  83, 71, 100),
  ('ACC',  10,   5,  0,   5),
  ('SPPT',286,  95, 85, 171)
ON CONFLICT (sub_class) DO NOTHING;
