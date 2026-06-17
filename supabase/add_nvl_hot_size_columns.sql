-- =============================================================
-- add_nvl_hot_size_columns.sql
-- Tách size_range (free-text) thành size_min/size_max/size_unit
-- cho phép query range trực tiếp: WHERE size_min <= X AND size_max >= X
-- Run AFTER fix_v2_logic.sql (nvl_hot table must exist)
-- =============================================================

-- Step 1: Add columns
ALTER TABLE nvl_hot
  ADD COLUMN IF NOT EXISTS size_min  NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS size_max  NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS size_unit TEXT NOT NULL DEFAULT 'mm';
-- size_unit: 'mm' (RD,RDL,PR), 'ct' (BG,MQ,PS,OV), 'pcs' (XC,PEARL,BQT)

-- Step 2: Backfill from existing data
-- RD (mm)
UPDATE nvl_hot SET size_min=0.7, size_max=2.0, size_unit='mm' WHERE id=1;
UPDATE nvl_hot SET size_min=2.1, size_max=2.4, size_unit='mm' WHERE id=2;
UPDATE nvl_hot SET size_min=2.5, size_max=2.6, size_unit='mm' WHERE id=3;
UPDATE nvl_hot SET size_min=2.7, size_max=2.8, size_unit='mm' WHERE id=4;
UPDATE nvl_hot SET size_min=2.9, size_max=3.2, size_unit='mm' WHERE id=5;
UPDATE nvl_hot SET size_min=3.3, size_max=3.4, size_unit='mm' WHERE id=6;
UPDATE nvl_hot SET size_min=3.5, size_max=3.6, size_unit='mm' WHERE id=7;
UPDATE nvl_hot SET size_min=3.7, size_max=3.9, size_unit='mm' WHERE id=8;
UPDATE nvl_hot SET size_min=4.0, size_max=4.4, size_unit='mm' WHERE id=9;
UPDATE nvl_hot SET size_min=4.5, size_max=5.0, size_unit='mm' WHERE id=10;

-- PR (mm)
UPDATE nvl_hot SET size_min=1.0, size_max=1.8, size_unit='mm' WHERE id=11;
UPDATE nvl_hot SET size_min=1.9, size_max=2.3, size_unit='mm' WHERE id=12;
UPDATE nvl_hot SET size_min=2.4, size_max=2.8, size_unit='mm' WHERE id=13;
UPDATE nvl_hot SET size_min=2.9, size_max=3.4, size_unit='mm' WHERE id=14;
UPDATE nvl_hot SET size_min=3.5, size_max=3.7, size_unit='mm' WHERE id=15;

-- BG (ct)
UPDATE nvl_hot SET size_min=0.005, size_max=0.025, size_unit='ct' WHERE id=16;
UPDATE nvl_hot SET size_min=0.03, size_max=0.05, size_unit='ct' WHERE id=17;
UPDATE nvl_hot SET size_min=0.06, size_max=0.07, size_unit='ct' WHERE id=18;
UPDATE nvl_hot SET size_min=0.08, size_max=0.09, size_unit='ct' WHERE id=19;
UPDATE nvl_hot SET size_min=0.10, size_max=0.16, size_unit='ct' WHERE id=20;
UPDATE nvl_hot SET size_min=0.17, size_max=0.20, size_unit='ct' WHERE id=21;
UPDATE nvl_hot SET size_min=0.21, size_max=0.25, size_unit='ct' WHERE id=22;
UPDATE nvl_hot SET size_min=0.26, size_max=0.28, size_unit='ct' WHERE id=23;
UPDATE nvl_hot SET size_min=0.29, size_max=0.35, size_unit='ct' WHERE id=24;

-- MQ (ct)
UPDATE nvl_hot SET size_min=0.005, size_max=0.10, size_unit='ct' WHERE id=25;
UPDATE nvl_hot SET size_min=0.11, size_max=0.12, size_unit='ct' WHERE id=26;
UPDATE nvl_hot SET size_min=0.13, size_max=0.17, size_unit='ct' WHERE id=27;
UPDATE nvl_hot SET size_min=0.18, size_max=0.24, size_unit='ct' WHERE id=28;
UPDATE nvl_hot SET size_min=0.25, size_max=0.29, size_unit='ct' WHERE id=29;
UPDATE nvl_hot SET size_min=0.30, size_max=0.36, size_unit='ct' WHERE id=30;
UPDATE nvl_hot SET size_min=0.37, size_max=0.39, size_unit='ct' WHERE id=31;

-- PS (ct)
UPDATE nvl_hot SET size_min=0.005, size_max=0.12, size_unit='ct' WHERE id=32;
UPDATE nvl_hot SET size_min=0.12, size_max=0.17, size_unit='ct' WHERE id=33;
UPDATE nvl_hot SET size_min=0.18, size_max=0.25, size_unit='ct' WHERE id=34;
UPDATE nvl_hot SET size_min=0.26, size_max=0.29, size_unit='ct' WHERE id=35;
UPDATE nvl_hot SET size_min=0.30, size_max=0.34, size_unit='ct' WHERE id=36;
UPDATE nvl_hot SET size_min=0.35, size_max=0.38, size_unit='ct' WHERE id=37;
UPDATE nvl_hot SET size_min=0.39, size_max=0.40, size_unit='ct' WHERE id=38;
UPDATE nvl_hot SET size_min=0.41, size_max=0.45, size_unit='ct' WHERE id=39;

-- OV (ct)
UPDATE nvl_hot SET size_min=0.005, size_max=0.095, size_unit='ct' WHERE id=40;
UPDATE nvl_hot SET size_min=0.10, size_max=0.14, size_unit='ct' WHERE id=41;
UPDATE nvl_hot SET size_min=0.15, size_max=0.25, size_unit='ct' WHERE id=42;
UPDATE nvl_hot SET size_min=0.30, size_max=0.35, size_unit='ct' WHERE id=43;
UPDATE nvl_hot SET size_min=0.40, size_max=0.45, size_unit='ct' WHERE id=44;
UPDATE nvl_hot SET size_min=0.50, size_max=0.55, size_unit='ct' WHERE id=45;

-- BQT (pcs, no range)
UPDATE nvl_hot SET size_min=NULL, size_max=NULL, size_unit='pcs' WHERE id=46;

-- RD-LG (mm)
UPDATE nvl_hot SET size_min=0.6, size_max=0.9, size_unit='mm' WHERE id=47;
UPDATE nvl_hot SET size_min=1.0, size_max=1.1, size_unit='mm' WHERE id=48;
UPDATE nvl_hot SET size_min=1.2, size_max=1.4, size_unit='mm' WHERE id=49;
UPDATE nvl_hot SET size_min=1.5, size_max=1.6, size_unit='mm' WHERE id=50;
UPDATE nvl_hot SET size_min=1.7, size_max=2.0, size_unit='mm' WHERE id=51;
UPDATE nvl_hot SET size_min=2.1, size_max=2.3, size_unit='mm' WHERE id=52;
UPDATE nvl_hot SET size_min=2.4, size_max=2.7, size_unit='mm' WHERE id=53;
UPDATE nvl_hot SET size_min=2.8, size_max=3.0, size_unit='mm' WHERE id=54;
UPDATE nvl_hot SET size_min=2.9, size_max=3.4, size_unit='mm' WHERE id=55;
UPDATE nvl_hot SET size_min=3.5, size_max=3.6, size_unit='mm' WHERE id=56;
UPDATE nvl_hot SET size_min=3.7, size_max=4.0, size_unit='mm' WHERE id=57;

-- XC (pcs, fixed size)
UPDATE nvl_hot SET size_min=9.5, size_max=9.5, size_unit='pcs' WHERE id=58;
UPDATE nvl_hot SET size_min=11, size_max=11, size_unit='pcs' WHERE id=59;
UPDATE nvl_hot SET size_min=13, size_max=13, size_unit='pcs' WHERE id=60;
UPDATE nvl_hot SET size_min=15, size_max=15, size_unit='pcs' WHERE id=61;
UPDATE nvl_hot SET size_min=16, size_max=16, size_unit='pcs' WHERE id=62;
UPDATE nvl_hot SET size_min=20, size_max=20, size_unit='pcs' WHERE id=63;
UPDATE nvl_hot SET size_min=26, size_max=26, size_unit='pcs' WHERE id=64;

-- PEARL (pcs, fixed size)
UPDATE nvl_hot SET size_min=9.0, size_max=9.0, size_unit='pcs' WHERE id=65;
UPDATE nvl_hot SET size_min=8.0, size_max=8.0, size_unit='pcs' WHERE id=66;
UPDATE nvl_hot SET size_min=7.0, size_max=7.0, size_unit='pcs' WHERE id=67;
UPDATE nvl_hot SET size_min=6.0, size_max=6.0, size_unit='pcs' WHERE id=68;
UPDATE nvl_hot SET size_min=3.0, size_max=3.0, size_unit='pcs' WHERE id=69;

-- LG-MQ (ct)
UPDATE nvl_hot SET size_min=0.005, size_max=0.095, size_unit='ct' WHERE id=70;
-- LG-PS (ct)
UPDATE nvl_hot SET size_min=0.2, size_max=0.295, size_unit='ct' WHERE id=71;
-- LG-TD (ct)
UPDATE nvl_hot SET size_min=0.2, size_max=0.295, size_unit='ct' WHERE id=72;
-- RRB-N (ct)
UPDATE nvl_hot SET size_min=0.005, size_max=0.095, size_unit='ct' WHERE id=73;

-- Step 3: Constraint + Index
ALTER TABLE nvl_hot ADD CONSTRAINT chk_nvl_hot_size_range
  CHECK (size_min IS NULL OR size_max IS NULL OR size_min <= size_max);

CREATE INDEX IF NOT EXISTS idx_nvl_hot_size_lookup
  ON nvl_hot (stone_type, size_min, size_max)
  WHERE is_active = true;
