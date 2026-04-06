-- ============================================================
-- Seed Data for San Lorenzo Water System
-- ALIGNED VERSION: Matches React App Role IDs (Role 4: Treasurer, Role 5: Consumer)
-- ============================================================

SET search_path TO water_billing;

-- 0. SELF-HEALING: Add missing columns if they don't exist
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE consumer ADD COLUMN IF NOT EXISTS meter_number TEXT;

-- 1. Initialize Roles with App-Aligned IDs
-- This ensures ID 4 works for Treasurer and ID 5 for Consumer as per React code
INSERT INTO roles (role_id, role_name) VALUES
(1, 'Admin'),
(2, 'Billing Officer'),
(3, 'Meter Reader'),
(4, 'Treasurer'),
(5, 'Consumer')
ON CONFLICT (role_id) DO UPDATE SET role_name = EXCLUDED.role_name;

-- 2. Ensure Classifications exist
INSERT INTO classification (classification_id, classification_name) VALUES
(1, 'Residential'),
(2, 'Commercial'),
(3, 'Institutional')
ON CONFLICT (classification_id) DO UPDATE SET classification_name = EXCLUDED.classification_name;

-- 3. Ensure Zones exist
INSERT INTO zone (zone_id, zone_name) VALUES
(1, 'Purok 1, Poblacion'),
(2, 'Purok 3, Dagotongan'),
(3, 'Purok 5, San Isidro'),
(4, 'Purok 2, Mabini'),
(5, 'Purok 4, Rizal')
ON CONFLICT (zone_id) DO UPDATE SET zone_name = EXCLUDED.zone_name;

-- 4. Insert Accounts 
-- Administrative Accounts
INSERT INTO accounts (username, password, full_name, role_id, account_status) VALUES
('admin', 'admin123', 'System Administrator', 1, 'Active'),
('juan.delacruz', 'reader123', 'Juan Dela Cruz', 3, 'Active'),
('pedro.reyes', 'billing123', 'Pedro Reyes', 2, 'Active'),
('carlos.bautista', 'treasurer123', 'Carlos Bautista', 4, 'Active')
ON CONFLICT (username) DO NOTHING;

-- Consumer Accounts (ID 5 to match React App redirect)
INSERT INTO accounts (username, password, full_name, role_id, account_status) VALUES
('natividad.paran', 'consumer123', 'Natividad Venta Paran', 5, 'Active'),
('ricardo.mendoza', 'consumer123', 'Ricardo Mendoza', 5, 'Active'),
('elena.cruz', 'consumer123', 'Elena Cruz', 5, 'Active')
ON CONFLICT (username) DO NOTHING;

-- 5. Insert Consumers 
-- Link to accounts inserted above
INSERT INTO consumer (first_name, last_name, address, zone_id, classification_id, login_id, account_number, status, contact_number, connection_date) 
SELECT 'Natividad', 'Paran', 'Purok 3, Dagotongan', 2, 1, a.account_id, '03-N-149-5', 'Active', '09171234567', '2020-01-15' FROM accounts a WHERE a.username = 'natividad.paran'
ON CONFLICT (account_number) DO NOTHING;

INSERT INTO consumer (first_name, last_name, address, zone_id, classification_id, login_id, account_number, status, contact_number, connection_date) 
SELECT 'Ricardo', 'Mendoza', 'Purok 1, Poblacion', 1, 2, a.account_id, '01-R-201-3', 'Active', '09181234568', '2019-06-20' FROM accounts a WHERE a.username = 'ricardo.mendoza'
ON CONFLICT (account_number) DO NOTHING;

-- 6. Insert Meters
INSERT INTO meter (consumer_id, meter_serial_number, meter_size, meter_status, installed_date)
SELECT consumer_id, 'SN-2020-001', '1/2 inch', 'Active', '2020-01-15' FROM consumer WHERE account_number = '03-N-149-5'
ON CONFLICT (meter_serial_number) DO NOTHING;

-- 7. Insert Routes
INSERT INTO route (meter_reader_id, zone_id)
SELECT account_id, 1 FROM accounts WHERE username = 'juan.delacruz'
UNION ALL SELECT account_id, 2 FROM accounts WHERE username = 'juan.delacruz'
ON CONFLICT DO NOTHING;

-- 8. Water Rates
INSERT INTO waterrates (minimum_cubic, minimum_rate, excess_rate_per_cubic, effective_date)
VALUES (10, 75.00, 7.50, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- 9. Sample Reading & Bill for Natividad (To test Reports)
INSERT INTO meterreadings (route_id, consumer_id, meter_id, meter_reader_id, reading_date, previous_reading, current_reading, consumption, reading_status)
SELECT r.route_id, c.consumer_id, m.meter_id, a.account_id, CURRENT_DATE - INTERVAL '30 days', 4415, 4419, 4, 'Verified'
FROM route r, consumer c, meter m, accounts a 
WHERE r.zone_id = c.zone_id AND c.consumer_id = m.consumer_id AND a.username = 'juan.delacruz' AND c.account_number = '03-N-149-5'
ON CONFLICT DO NOTHING;

INSERT INTO bills (consumer_id, reading_id, billing_officer_id, billing_month, date_covered_from, date_covered_to, bill_date, due_date, amount_due, total_amount, status)
SELECT c.consumer_id, mr.reading_id, a.account_id, 'November 2025', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '25 days', CURRENT_DATE + INTERVAL '5 days', 160.00, 160.00, 'Paid'
FROM consumer c, meterreadings mr, accounts a 
WHERE c.consumer_id = mr.consumer_id AND a.username = 'pedro.reyes' AND c.account_number = '03-N-149-5'
ON CONFLICT DO NOTHING;

-- 10. Sample Payment
INSERT INTO payment (consumer_id, bill_id, payment_date, amount_paid, or_number, payment_method, status, validated_by, validated_date)
SELECT c.consumer_id, b.bill_id, CURRENT_DATE - INTERVAL '20 days', 160.00, 'OR-2025-001', 'Cash', 'Validated', a.account_id, CURRENT_DATE - INTERVAL '15 days'
FROM consumer c, bills b, accounts a 
WHERE c.consumer_id = b.consumer_id AND a.username = 'pedro.reyes' AND c.account_number = '03-N-149-5'
ON CONFLICT DO NOTHING;
