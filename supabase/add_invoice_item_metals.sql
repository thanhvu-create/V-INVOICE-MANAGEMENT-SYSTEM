-- Multi-metal per item: an item can have several gold types, each with its own weight.
-- Mirror of invoice_diamonds (FK product_id). When an item has ≥1 row here, its gold
-- weight and tien_vang are computed from these rows (Σ), not from loai_vang + (t_pham − gems).
-- Items with no rows keep the existing single-metal calculation. No backfill needed.

CREATE TABLE IF NOT EXISTS invoice_item_metals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES invoice_products(id) ON DELETE CASCADE,
  loai_vang   TEXT NOT NULL,               -- "18KW", "14KY", "PT", ...
  weight_gr   NUMERIC NOT NULL DEFAULT 0,  -- net gold weight (stones already excluded)
  tien_vang   NUMERIC,                     -- = weight_gr × giá/gram (server-side, per NVL snapshot)
  seq         INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_metals_product ON invoice_item_metals(product_id);
