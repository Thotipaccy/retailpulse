-- Manual migration: align PostgreSQL with refined ERD
-- Run once if legacy columns remain after JPA entity update (ddl-auto may not drop columns)
ALTER TABLE IF EXISTS transactions DROP COLUMN IF EXISTS store_id;
ALTER TABLE IF EXISTS demand_forecasts DROP COLUMN IF EXISTS category_id;
