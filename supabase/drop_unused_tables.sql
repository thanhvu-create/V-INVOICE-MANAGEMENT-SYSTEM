-- =============================================================
-- DROP: Store Markup + Pricing Rules tables
-- Chạy file này trên Supabase SQL Editor
-- Thứ tự quan trọng: drop FK trước, drop table sau
-- =============================================================

-- 1. Bỏ FK + column pricing_rule_id trên invoices (nếu tồn tại)
--    (pricing_rules được reference từ đây)
ALTER TABLE invoices DROP COLUMN IF EXISTS pricing_rule_id;

-- 2. Drop pricing_rules
DROP TABLE IF EXISTS pricing_rules;

-- 3. Drop store markup tiers
DROP TABLE IF EXISTS mk_store_markup;

-- 4. Drop price list types (channels)
DROP TABLE IF EXISTS mk_price_list_type;

-- 5. Bỏ column price_list_type trên invoice_products (orphaned không còn dùng)
ALTER TABLE invoice_products DROP COLUMN IF EXISTS price_list_type;
