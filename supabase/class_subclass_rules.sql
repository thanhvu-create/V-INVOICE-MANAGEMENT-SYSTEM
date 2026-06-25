-- =============================================================
-- Class / Sub-Class Rules — Auto-detect from Description prefix
-- Run in Supabase SQL Editor
-- =============================================================

CREATE TABLE IF NOT EXISTS class_subclass_rules (
  id                 UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  description_prefix TEXT  UNIQUE NOT NULL,   -- e.g. "DPDMT", "18KRI"
  class              TEXT  NOT NULL,           -- e.g. "DIAMT", "18KJE"
  sub_class          TEXT  NOT NULL,           -- e.g. "PD", "RI"
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csr_prefix ON class_subclass_rules(description_prefix);

-- Seed data from "Copy of GIÁ CÔNG TRONG INVOICE.xlsx" — sheet Class_SubClass
INSERT INTO class_subclass_rules (description_prefix, class, sub_class) VALUES
  ('DRIMT',   'DIAMT', 'RI'),
  ('DERMT',   'DIAMT', 'ER'),
  ('DBLMT',   'DIAMT', 'BL'),
  ('DBGMT',   'DIAMT', 'BG'),
  ('DPDMT',   'DIAMT', 'PD'),
  ('DNLMT',   'DIAMT', 'NL'),
  ('DIARI',   'DIAJE', 'RI'),
  ('DIAER',   'DIAJE', 'ER'),
  ('DIABL',   'DIAJE', 'BL'),
  ('DIABG',   'DIAJE', 'BG'),
  ('DIAPD',   'DIAJE', 'PD'),
  ('DIANL',   'DIAJE', 'NL'),
  ('RIMTG',   '18MTG', 'RI'),
  ('ERMTG',   '18MTG', 'ER'),
  ('BLMTG',   '18MTG', 'BL'),
  ('BGMTG',   '18MTG', 'BG'),
  ('PDMTG',   '18MTG', 'PD'),
  ('NLMTG',   '18MTG', 'NL'),
  ('14KRI',   '14KJE', 'RI'),
  ('14KER',   '14KJE', 'ER'),
  ('14KBL',   '14KJE', 'BL'),
  ('14KBG',   '14KJE', 'BG'),
  ('14KPD',   '14KJE', 'PD'),
  ('14KNL',   '14KJE', 'NL'),
  ('14KCH',   '14KJE', 'CH'),
  ('14KACC',  'ACC',   'ACC'),
  ('18KRI',   '18KJE', 'RI'),
  ('18KER',   '18KJE', 'ER'),
  ('18KBL',   '18KJE', 'BL'),
  ('18KBG',   '18KJE', 'BG'),
  ('18KPD',   '18KJE', 'PD'),
  ('18KNL',   '18KJE', 'NL'),
  ('18KCH',   '18KJE', 'CH'),
  ('18KACC',  'ACC',   'ACC'),
  ('24KRI',   '24KJE', 'RI'),
  ('24KER',   '24KJE', 'ER'),
  ('24KBL',   '24KJE', 'BL'),
  ('24KBG',   '24KJE', 'BG'),
  ('24KPD',   '24KJE', 'PD'),
  ('24KCH',   '24KJE', 'CH'),
  ('24KACC',  'ACC',   'ACC'),
  ('PT900RI', 'PTJE',  'RI'),
  ('PT900ER', 'PTJE',  'ER'),
  ('PT900BL', 'PTJE',  'BL'),
  ('PT900BG', 'PTJE',  'BG'),
  ('PT900PD', 'PTJE',  'PD'),
  ('PT900NL', 'PTJE',  'NL'),
  ('PT900CH', 'PTJE',  'CH'),
  ('PT900ACC','PTACC', 'ACC'),
  ('LGRIMT',  'LGRI',  'RI'),
  ('LGERMT',  'LGRI',  'ER'),
  ('LGBLMT',  'LGRI',  'BL'),
  ('LGBGMT',  'LGRI',  'BG'),
  ('LGPDMT',  'LGRI',  'PD'),
  ('LGNLMT',  'LGRI',  'NL')
ON CONFLICT (description_prefix) DO NOTHING;
