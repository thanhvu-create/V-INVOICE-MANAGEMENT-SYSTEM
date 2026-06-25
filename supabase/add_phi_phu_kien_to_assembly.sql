-- Add phi_phu_kien column to assembly_pricing_rules
ALTER TABLE assembly_pricing_rules
  ADD COLUMN IF NOT EXISTS phi_phu_kien NUMERIC DEFAULT 30;

-- Set defaults: ACC = $10 (simple accessories), others = $30 (standard 14K/18K)
UPDATE assembly_pricing_rules SET phi_phu_kien = 10  WHERE sub_class = 'ACC';
UPDATE assembly_pricing_rules SET phi_phu_kien = 30  WHERE sub_class IN ('RI','PD','ER','BL','BG','CH','NL','SPPT');
