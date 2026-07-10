-- Supplier and purchase price tracking for RetailPulse
ALTER TABLE inventory_records
    ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS supplier_contact VARCHAR(50),
    ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS unit_purchase_cost DECIMAL(15, 2),
    ADD COLUMN IF NOT EXISTS last_purchase_date TIMESTAMP;

CREATE TABLE IF NOT EXISTS inventory_purchases (
    purchase_id VARCHAR(36) PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL REFERENCES products(product_id),
    store_id VARCHAR(50) NOT NULL REFERENCES stores(store_id),
    user_id VARCHAR(36) NOT NULL REFERENCES users(user_id),
    quantity INTEGER NOT NULL,
    unit_purchase_cost DECIMAL(15, 2) NOT NULL,
    total_cost DECIMAL(15, 2) NOT NULL,
    supplier_name VARCHAR(200) NOT NULL,
    supplier_contact VARCHAR(50),
    invoice_number VARCHAR(100),
    purchase_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_purchases_product ON inventory_purchases(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_purchases_supplier ON inventory_purchases(supplier_name);
