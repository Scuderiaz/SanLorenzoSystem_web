-- ============================================================
-- Supabase Seed Data for SLR Water Billing System
-- Run this AFTER creating the schema tables
-- NOTE: Roles, Zones (1-5), Classifications, Waterrates, and Admin 
--       are already inserted by supabase_schema.sql
-- ============================================================

-- ============================================================
-- CLEAR EXISTING DATA FIRST (to avoid duplicates)
-- Delete in reverse dependency order (deepest dependencies first)
-- ============================================================

-- Level 6: Ledger (most dependencies)
DELETE FROM ledger;

-- Level 5: Payments
DELETE FROM payments;

-- Level 4: Bills and Meter Readings
DELETE FROM bills;
DELETE FROM meterreadings;
DELETE FROM reading_schedules;

-- Level 3: Routes and Meters
DELETE FROM routes;
DELETE FROM meters;

-- Level 2: Meter Readers and Consumers
DELETE FROM meterreaders;
DELETE FROM consumer;

-- Level 1: Accounts (keep admin)
DELETE FROM accounts WHERE "Username" != 'admin';

-- ============================================================
-- INSERT DATA IN DEPENDENCY ORDER
-- Follow foreign key dependencies: base tables first, dependent tables last
-- ============================================================

-- ============================================================
-- LEVEL 1: ACCOUNTS (depends on: roles)
-- Insert 9 accounts - admin already exists from schema
-- ============================================================
INSERT INTO accounts ("Username", "Password", "Full_Name", "Role_ID") VALUES
('juan.delacruz', 'reader123', 'Juan Dela Cruz', 2),
('maria.santos', 'reader123', 'Maria Santos', 2),
('pedro.reyes', 'billing123', 'Pedro Reyes', 3),
('ana.gonzales', 'billing123', 'Ana Gonzales', 3),
('carlos.bautista', 'treasurer123', 'Carlos Bautista', 4),
('natividad.paran', 'consumer123', 'Natividad Venta Paran', 5),
('ricardo.mendoza', 'consumer123', 'Ricardo Mendoza', 5),
('elena.cruz', 'consumer123', 'Elena Cruz', 5),
('jose.reyes', 'consumer123', 'Jose Reyes Jr.', 5)
ON CONFLICT ("Username") DO NOTHING;

-- ============================================================
-- LEVEL 2: CONSUMERS (depends on: zones, classifications, accounts)
-- Insert 10 consumers - uses zones 1-5
-- ============================================================
INSERT INTO consumer ("First_Name", "Last_Name", "Address", "Zone_ID", "Classification_ID", "Account_Number", "Meter_Number", "Status", "Contact_Number", "Connection_Date") VALUES
('Natividad', 'Paran', 'Purok 3, Dagotongan', 2, 1, '03-N-149-5', 'MTR-001', 'Active', '09171234567', '2020-01-15'),
('Ricardo', 'Mendoza', 'Purok 1, Poblacion', 1, 2, '01-R-201-3', 'MTR-002', 'Active', '09181234568', '2019-06-20'),
('Elena', 'Cruz', 'Purok 5, San Isidro', 3, 1, '03-E-055-2', 'MTR-003', 'Active', '09191234569', '2021-03-10'),
('Jose', 'Reyes Jr.', 'Purok 2, Mabini', 4, 2, '04-J-112-8', 'MTR-004', 'Active', '09201234570', '2018-11-05'),
('Maria', 'Santos', 'Purok 4, Rizal', 5, 1, '05-M-078-1', 'MTR-005', 'Active', '09211234571', '2020-08-22'),
('Pedro', 'Garcia', 'Purok 1, Poblacion', 1, 3, '01-P-033-9', 'MTR-006', 'Active', '09221234572', '2017-04-18'),
('Ana', 'Fernandez', 'Purok 3, Dagotongan', 2, 1, '02-A-156-4', 'MTR-007', 'Active', '09231234573', '2022-01-30'),
('Carlos', 'Bautista', 'Purok 2, San Isidro', 3, 2, '03-C-089-7', 'MTR-008', 'Active', '09241234574', '2019-09-12'),
('Sofia', 'Mendoza', 'Purok 5, Mabini', 4, 1, '04-S-234-6', 'MTR-009', 'Active', '09251234575', '2021-07-08'),
('Miguel', 'Torres', 'Purok 1, Rizal', 5, 4, '05-M-567-0', 'MTR-010', 'Active', '09261234576', '2016-12-01')
ON CONFLICT ("Account_Number") DO NOTHING;

-- ============================================================
-- METERS (10 meters - one per consumer)
-- Using Account_Number to match consumers since Consumer_ID is auto-generated
-- ============================================================
INSERT INTO meters ("Consumer_ID", "Meter_Serial_Number", "Meter_Size")
SELECT "Consumer_ID", 'SN-2020-001', '1/2 inch' FROM consumer WHERE "Account_Number" = '03-N-149-5'
UNION ALL SELECT "Consumer_ID", 'SN-2019-002', '1/2 inch' FROM consumer WHERE "Account_Number" = '01-R-201-3'
UNION ALL SELECT "Consumer_ID", 'SN-2021-003', '1/2 inch' FROM consumer WHERE "Account_Number" = '03-E-055-2'
UNION ALL SELECT "Consumer_ID", 'SN-2018-004', '3/4 inch' FROM consumer WHERE "Account_Number" = '04-J-112-8'
UNION ALL SELECT "Consumer_ID", 'SN-2020-005', '1/2 inch' FROM consumer WHERE "Account_Number" = '05-M-078-1'
UNION ALL SELECT "Consumer_ID", 'SN-2017-006', '1 inch' FROM consumer WHERE "Account_Number" = '01-P-033-9'
UNION ALL SELECT "Consumer_ID", 'SN-2022-007', '1/2 inch' FROM consumer WHERE "Account_Number" = '02-A-156-4'
UNION ALL SELECT "Consumer_ID", 'SN-2019-008', '3/4 inch' FROM consumer WHERE "Account_Number" = '03-C-089-7'
UNION ALL SELECT "Consumer_ID", 'SN-2021-009', '1/2 inch' FROM consumer WHERE "Account_Number" = '04-S-234-6'
UNION ALL SELECT "Consumer_ID", 'SN-2016-010', '2 inch' FROM consumer WHERE "Account_Number" = '05-M-567-0'
ON CONFLICT ("Consumer_ID") DO NOTHING;

-- ============================================================
-- METER READERS (2 meter readers)
-- Using Username to get actual Account_ID since AccountID is auto-generated
-- ============================================================
INSERT INTO meterreaders ("Account_ID", "First_Name", "Last_Name", "Contact_Number", "Email")
SELECT "AccountID", 'Juan', 'Dela Cruz', '09171111111', 'juan.delacruz@slr.gov.ph' FROM accounts WHERE "Username" = 'juan.delacruz'
UNION ALL SELECT "AccountID", 'Maria', 'Santos', '09182222222', 'maria.santos@slr.gov.ph' FROM accounts WHERE "Username" = 'maria.santos'
ON CONFLICT DO NOTHING;

-- ============================================================
-- STEP 4: ROUTES (assign zones to meter readers) - Uses Zone 1-5 only
-- Using subquery to get actual Meter_Reader_ID
-- ============================================================
INSERT INTO routes ("Meter_Reader_ID", "Zone_ID")
SELECT mr."Meter_Reader_ID", 1 FROM meterreaders mr JOIN accounts a ON mr."Account_ID" = a."AccountID" WHERE a."Username" = 'juan.delacruz'
UNION ALL SELECT mr."Meter_Reader_ID", 2 FROM meterreaders mr JOIN accounts a ON mr."Account_ID" = a."AccountID" WHERE a."Username" = 'juan.delacruz'
UNION ALL SELECT mr."Meter_Reader_ID", 3 FROM meterreaders mr JOIN accounts a ON mr."Account_ID" = a."AccountID" WHERE a."Username" = 'juan.delacruz'
UNION ALL SELECT mr."Meter_Reader_ID", 4 FROM meterreaders mr JOIN accounts a ON mr."Account_ID" = a."AccountID" WHERE a."Username" = 'maria.santos'
UNION ALL SELECT mr."Meter_Reader_ID", 5 FROM meterreaders mr JOIN accounts a ON mr."Account_ID" = a."AccountID" WHERE a."Username" = 'maria.santos'
ON CONFLICT DO NOTHING;

-- ============================================================
-- STEP 5: READING SCHEDULES (5 schedules) - Uses Zone 1-5 only
-- Using subquery to get actual Meter_Reader_ID from accounts
-- ============================================================
INSERT INTO reading_schedules ("Zone_ID", "Meter_Reader_ID", "Schedule_Date", "Status")
SELECT 1, a."AccountID", CURRENT_DATE, 'Scheduled' FROM accounts a WHERE a."Username" = 'juan.delacruz'
UNION ALL SELECT 2, a."AccountID", CURRENT_DATE, 'Scheduled' FROM accounts a WHERE a."Username" = 'juan.delacruz'
UNION ALL SELECT 3, a."AccountID", CURRENT_DATE + INTERVAL '1 day', 'Scheduled' FROM accounts a WHERE a."Username" = 'juan.delacruz'
UNION ALL SELECT 4, a."AccountID", CURRENT_DATE, 'Scheduled' FROM accounts a WHERE a."Username" = 'maria.santos'
UNION ALL SELECT 5, a."AccountID", CURRENT_DATE + INTERVAL '1 day', 'Scheduled' FROM accounts a WHERE a."Username" = 'maria.santos'
ON CONFLICT DO NOTHING;

-- ============================================================
-- WATER RATES - Already inserted by supabase_schema.sql
-- Schema uses: MinimumRate, Rate11to20, Rate21to30, Rate31to40, Rate41Plus
-- ============================================================

-- ============================================================
-- METER READINGS (10 sample readings)
-- Using Account_Number to get Consumer_ID and Username to get Meter_Reader_ID
-- ============================================================
INSERT INTO meterreadings ("Consumer_ID", "Meter_Reader_ID", "Reading_Date", "Previous_Reading", "Current_Reading", "Consumption", "Status", "Reading_Status")
SELECT c."Consumer_ID", a."AccountID", CURRENT_DATE - INTERVAL '30 days', 4415, 4419, 4, 'Validated', 'Normal'::reading_status_enum FROM consumer c, accounts a WHERE c."Account_Number" = '03-N-149-5' AND a."Username" = 'juan.delacruz'
UNION ALL SELECT c."Consumer_ID", a."AccountID", CURRENT_DATE - INTERVAL '30 days', 2100, 2115, 15, 'Validated', 'Normal'::reading_status_enum FROM consumer c, accounts a WHERE c."Account_Number" = '01-R-201-3' AND a."Username" = 'juan.delacruz'
UNION ALL SELECT c."Consumer_ID", a."AccountID", CURRENT_DATE - INTERVAL '30 days', 1050, 1058, 8, 'Validated', 'Normal'::reading_status_enum FROM consumer c, accounts a WHERE c."Account_Number" = '03-E-055-2' AND a."Username" = 'juan.delacruz'
UNION ALL SELECT c."Consumer_ID", a."AccountID", CURRENT_DATE - INTERVAL '30 days', 3200, 3225, 25, 'Validated', 'Normal'::reading_status_enum FROM consumer c, accounts a WHERE c."Account_Number" = '04-J-112-8' AND a."Username" = 'juan.delacruz'
UNION ALL SELECT c."Consumer_ID", a."AccountID", CURRENT_DATE - INTERVAL '30 days', 890, 896, 6, 'Validated', 'Normal'::reading_status_enum FROM consumer c, accounts a WHERE c."Account_Number" = '05-M-078-1' AND a."Username" = 'juan.delacruz'
UNION ALL SELECT c."Consumer_ID", a."AccountID", CURRENT_DATE - INTERVAL '30 days', 5500, 5580, 80, 'Validated', 'Normal'::reading_status_enum FROM consumer c, accounts a WHERE c."Account_Number" = '01-P-033-9' AND a."Username" = 'maria.santos'
UNION ALL SELECT c."Consumer_ID", a."AccountID", CURRENT_DATE - INTERVAL '30 days', 450, 455, 5, 'Validated', 'Normal'::reading_status_enum FROM consumer c, accounts a WHERE c."Account_Number" = '02-A-156-4' AND a."Username" = 'maria.santos'
UNION ALL SELECT c."Consumer_ID", a."AccountID", CURRENT_DATE - INTERVAL '30 days', 1800, 1820, 20, 'Validated', 'Normal'::reading_status_enum FROM consumer c, accounts a WHERE c."Account_Number" = '03-C-089-7' AND a."Username" = 'maria.santos'
UNION ALL SELECT c."Consumer_ID", a."AccountID", CURRENT_DATE - INTERVAL '30 days', 620, 627, 7, 'Validated', 'Normal'::reading_status_enum FROM consumer c, accounts a WHERE c."Account_Number" = '04-S-234-6' AND a."Username" = 'maria.santos'
UNION ALL SELECT c."Consumer_ID", a."AccountID", CURRENT_DATE - INTERVAL '30 days', 12000, 12150, 150, 'Validated', 'Normal'::reading_status_enum FROM consumer c, accounts a WHERE c."Account_Number" = '05-M-567-0' AND a."Username" = 'maria.santos'
ON CONFLICT DO NOTHING;

-- ============================================================
-- BILLS (10 sample bills based on readings)
-- Schema columns: Consumer_ID, Reading_ID, Billing_Month, Amount_Due, Penalty, Previous_Balance, 
--                 Previous_Penalty, Connection_Fee, Total_Amount, Due_Date, Payment_Status, Bill_Date
-- ============================================================
INSERT INTO bills ("Consumer_ID", "Reading_ID", "Bill_Date", "Due_Date", "Billing_Month", "Amount_Due", "Total_Amount", "Payment_Status") VALUES
(1, 1, CURRENT_DATE - INTERVAL '25 days', CURRENT_DATE + INTERVAL '5 days', 'November 2025', 160.00, 160.00, 'Paid'),
(2, 2, CURRENT_DATE - INTERVAL '25 days', CURRENT_DATE + INTERVAL '5 days', 'November 2025', 290.00, 290.00, 'Paid'),
(3, 3, CURRENT_DATE - INTERVAL '25 days', CURRENT_DATE + INTERVAL '5 days', 'November 2025', 160.00, 160.00, 'Unpaid'),
(4, 4, CURRENT_DATE - INTERVAL '25 days', CURRENT_DATE + INTERVAL '5 days', 'November 2025', 460.00, 460.00, 'Unpaid'),
(5, 5, CURRENT_DATE - INTERVAL '25 days', CURRENT_DATE + INTERVAL '5 days', 'November 2025', 160.00, 160.00, 'Paid'),
(6, 6, CURRENT_DATE - INTERVAL '25 days', CURRENT_DATE + INTERVAL '5 days', 'November 2025', 2650.00, 2650.00, 'Unpaid'),
(7, 7, CURRENT_DATE - INTERVAL '25 days', CURRENT_DATE + INTERVAL '5 days', 'November 2025', 160.00, 160.00, 'Paid'),
(8, 8, CURRENT_DATE - INTERVAL '25 days', CURRENT_DATE + INTERVAL '5 days', 'November 2025', 380.00, 380.00, 'Unpaid'),
(9, 9, CURRENT_DATE - INTERVAL '25 days', CURRENT_DATE + INTERVAL '5 days', 'November 2025', 160.00, 160.00, 'Paid'),
(10, 10, CURRENT_DATE - INTERVAL '25 days', CURRENT_DATE + INTERVAL '5 days', 'November 2025', 4000.00, 4000.00, 'Unpaid')
ON CONFLICT DO NOTHING;

-- ============================================================
-- PAYMENTS (5 sample payments for paid bills)
-- ============================================================
INSERT INTO payments ("ConsumerID", "BillID", "PaymentDate", "AmountPaid", "ORNumber", "Status", "Payment_Method") VALUES
(1, 1, CURRENT_DATE - INTERVAL '20 days', 160.00, 'OR-2025-001', 'Verified', 'Cash'),
(2, 2, CURRENT_DATE - INTERVAL '18 days', 290.00, 'OR-2025-002', 'Verified', 'Cash'),
(5, 5, CURRENT_DATE - INTERVAL '15 days', 160.00, 'OR-2025-003', 'Verified', 'Cash'),
(7, 7, CURRENT_DATE - INTERVAL '12 days', 160.00, 'OR-2025-004', 'Verified', 'GCash'),
(9, 9, CURRENT_DATE - INTERVAL '10 days', 160.00, 'OR-2025-005', 'Verified', 'Cash')
ON CONFLICT DO NOTHING;

-- ============================================================
-- LEDGER ENTRIES (10 sample ledger entries)
-- ============================================================
INSERT INTO ledger ("Consumer_ID", "Ledger_Date", "Billing_Month", "Meter_Reading", "Consumption", "Water_Billing", "Penalty", "Meter_Charges", "Payment", "Receipt_Number", "Balance", "Bill_ID", "Payment_ID", "Reading_ID") VALUES
(1, CURRENT_DATE - INTERVAL '25 days', 'November 2025', 4419, 4, 160.00, 0.00, 0.00, 160.00, 'OR-2025-001', 0.00, 1, 1, 1),
(2, CURRENT_DATE - INTERVAL '25 days', 'November 2025', 2115, 15, 290.00, 0.00, 0.00, 290.00, 'OR-2025-002', 0.00, 2, 2, 2),
(3, CURRENT_DATE - INTERVAL '25 days', 'November 2025', 1058, 8, 160.00, 0.00, 0.00, 0.00, NULL, 160.00, 3, NULL, 3),
(4, CURRENT_DATE - INTERVAL '25 days', 'November 2025', 3225, 25, 460.00, 0.00, 0.00, 0.00, NULL, 460.00, 4, NULL, 4),
(5, CURRENT_DATE - INTERVAL '25 days', 'November 2025', 896, 6, 160.00, 0.00, 0.00, 160.00, 'OR-2025-003', 0.00, 5, 3, 5),
(6, CURRENT_DATE - INTERVAL '25 days', 'November 2025', 5580, 80, 2650.00, 0.00, 0.00, 0.00, NULL, 2650.00, 6, NULL, 6),
(7, CURRENT_DATE - INTERVAL '25 days', 'November 2025', 455, 5, 160.00, 0.00, 0.00, 160.00, 'OR-2025-004', 0.00, 7, 4, 7),
(8, CURRENT_DATE - INTERVAL '25 days', 'November 2025', 1820, 20, 380.00, 0.00, 0.00, 0.00, NULL, 380.00, 8, NULL, 8),
(9, CURRENT_DATE - INTERVAL '25 days', 'November 2025', 627, 7, 160.00, 0.00, 0.00, 160.00, 'OR-2025-005', 0.00, 9, 5, 9),
(10, CURRENT_DATE - INTERVAL '25 days', 'November 2025', 12150, 150, 4000.00, 0.00, 0.00, 0.00, NULL, 4000.00, 10, NULL, 10)
ON CONFLICT DO NOTHING;

-- ============================================================
-- DONE! Seed data inserted successfully.
-- ============================================================
