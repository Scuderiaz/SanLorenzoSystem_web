-- ============================================================
-- Clear All Data from Tables
-- Run this BEFORE inserting seed data to start fresh
-- ============================================================

-- Disable foreign key checks temporarily (PostgreSQL uses CASCADE)
-- Delete in reverse order of dependencies to avoid foreign key violations

-- ============================================================
-- STEP 1: Delete data in reverse dependency order
-- Start from tables that others depend on, work backwards to base tables
-- ============================================================

-- Level 6: Ledger (depends on: consumer, bills, payments, meterreadings, accounts)
DELETE FROM ledger;

-- Level 5: Payments (depends on: consumer, bills)
DELETE FROM payments;

-- Level 4: Bills (depends on: consumer, meterreadings, accounts)
DELETE FROM bills;

-- Level 4: Meter Readings (depends on: consumer, meters, routes, meterreaders)
DELETE FROM meterreadings;

-- Level 4: Reading Schedules (depends on: zones, accounts)
DELETE FROM reading_schedules;

-- Level 3: Routes (depends on: meterreaders, zones)
DELETE FROM routes;

-- Level 3: Meters (depends on: consumer)
DELETE FROM meters;

-- Level 2: Meter Readers (depends on: accounts)
DELETE FROM meterreaders;

-- Level 2: Consumer (depends on: zones, classifications, accounts)
DELETE FROM consumer;

-- Level 1: Accounts (depends on: roles) - Keep admin account
DELETE FROM accounts WHERE "Username" != 'admin';

-- Level 0: Reference tables (zones, classifications, roles, waterrates)
-- These are NOT deleted as they contain system configuration data

-- ============================================================
-- STEP 2: Optional - Clear reference data (zones, classifications, roles)
-- Uncomment these if you want to completely reset everything
-- ============================================================

-- DELETE FROM waterrates;
-- DELETE FROM system_settings;
-- DELETE FROM classifications;
-- DELETE FROM zones;
-- DELETE FROM roles;

-- ============================================================
-- DONE! All transactional data cleared.
-- Reference data (roles, zones, classifications) preserved.
-- ============================================================

-- Reset sequences (optional - makes IDs start from 1 again)
-- Uncomment if you want IDs to restart from 1

-- ALTER SEQUENCE ledger_Ledger_ID_seq RESTART WITH 1;
-- ALTER SEQUENCE payments_PaymentID_seq RESTART WITH 1;
-- ALTER SEQUENCE bills_Bill_ID_seq RESTART WITH 1;
-- ALTER SEQUENCE meterreadings_Reading_ID_seq RESTART WITH 1;
-- ALTER SEQUENCE reading_schedules_Schedule_ID_seq RESTART WITH 1;
-- ALTER SEQUENCE routes_Route_ID_seq RESTART WITH 1;
-- ALTER SEQUENCE meterreaders_Meter_Reader_ID_seq RESTART WITH 1;
-- ALTER SEQUENCE meters_Meter_ID_seq RESTART WITH 1;
-- ALTER SEQUENCE consumer_Consumer_ID_seq RESTART WITH 1;
-- ALTER SEQUENCE accounts_AccountID_seq RESTART WITH 2;  -- Start at 2 (admin is 1)
