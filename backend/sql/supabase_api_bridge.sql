-- ============================================================
-- Supabase API Bridge Script (FINAL FIX)
-- Fixes: "permission denied for view roles"
-- ============================================================

-- 1. Grant schema access
GRANT USAGE ON SCHEMA water_billing TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA water_billing TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA water_billing TO anon, authenticated, service_role;

-- 2. Drop and recreate views with lowercase columns
DROP VIEW IF EXISTS public.roles CASCADE;
DROP VIEW IF EXISTS public.accounts CASCADE;
DROP VIEW IF EXISTS public.consumer CASCADE;
DROP VIEW IF EXISTS public.classification CASCADE;
DROP VIEW IF EXISTS public.zone CASCADE;
DROP VIEW IF EXISTS public.meter CASCADE;
DROP VIEW IF EXISTS public.route CASCADE;
DROP VIEW IF EXISTS public.meterreadings CASCADE;
DROP VIEW IF EXISTS public.bills CASCADE;
DROP VIEW IF EXISTS public.payment CASCADE;
DROP VIEW IF EXISTS public.ledger_entry CASCADE;
DROP VIEW IF EXISTS public.backuplogs CASCADE;
DROP VIEW IF EXISTS public.error_logs CASCADE;
DROP VIEW IF EXISTS public.system_logs CASCADE;

-- Roles
CREATE OR REPLACE VIEW public.roles AS
SELECT role_id, role_name FROM water_billing.roles;

-- Accounts
CREATE OR REPLACE VIEW public.accounts AS
SELECT account_id, username, password, full_name, role_id, account_status, created_at
FROM water_billing.accounts;

-- Classification
CREATE OR REPLACE VIEW public.classification AS
SELECT classification_id, classification_name FROM water_billing.classification;

-- Zone
CREATE OR REPLACE VIEW public.zone AS
SELECT zone_id, zone_name FROM water_billing.zone;

-- Consumer
CREATE OR REPLACE VIEW public.consumer AS
SELECT consumer_id, first_name, middle_name, last_name, address,
       zone_id, classification_id, login_id, account_number,
       status, contact_number, connection_date
FROM water_billing.consumer;

-- Meter
CREATE OR REPLACE VIEW public.meter AS
SELECT meter_id, consumer_id, meter_serial_number, meter_size, meter_status, installed_date
FROM water_billing.meter;

-- Route
CREATE OR REPLACE VIEW public.route AS
SELECT route_id, meter_reader_id, zone_id
FROM water_billing.route;

-- Meter Readings
CREATE OR REPLACE VIEW public.meterreadings AS
SELECT reading_id, route_id, consumer_id, meter_id, meter_reader_id,
       reading_date, previous_reading, current_reading, consumption,
       reading_status, status, created_date
FROM water_billing.meterreadings;

-- Bills
CREATE OR REPLACE VIEW public.bills AS
SELECT bill_id, consumer_id, reading_id, billing_officer_id, billing_month,
       bill_date, due_date, amount_due, total_amount, status,
       date_covered_from, date_covered_to
FROM water_billing.bills;

-- Payment
CREATE OR REPLACE VIEW public.payment AS
SELECT payment_id, consumer_id, bill_id, payment_date, amount_paid,
       or_number, payment_method, status, validated_by, validated_date
FROM water_billing.payment;

-- Ledger Entry
CREATE OR REPLACE VIEW public.ledger_entry AS
SELECT ledger_id, consumer_id, transaction_type, amount, balance, transaction_date
FROM water_billing.ledger_entry;

-- Backup Logs
CREATE OR REPLACE VIEW public.backuplogs AS
SELECT backup_id, backup_name, backup_time, backup_size, backup_type, created_by
FROM water_billing.backuplogs;

-- Error Logs
CREATE OR REPLACE VIEW public.error_logs AS
SELECT error_id, error_time, severity, module, error_message, user_id, status
FROM water_billing.error_logs;

-- System Logs
CREATE OR REPLACE VIEW public.system_logs AS
SELECT log_id, account_id, role, action, timestamp
FROM water_billing.system_logs;

-- 3. *** CRITICAL: Grant SELECT on every public view ***
GRANT SELECT ON public.roles TO anon, authenticated, service_role;
GRANT SELECT ON public.accounts TO anon, authenticated, service_role;
GRANT SELECT ON public.classification TO anon, authenticated, service_role;
GRANT SELECT ON public.zone TO anon, authenticated, service_role;
GRANT SELECT ON public.consumer TO anon, authenticated, service_role;
GRANT SELECT ON public.meter TO anon, authenticated, service_role;
GRANT SELECT ON public.route TO anon, authenticated, service_role;
GRANT SELECT ON public.meterreadings TO anon, authenticated, service_role;
GRANT SELECT ON public.bills TO anon, authenticated, service_role;
GRANT SELECT ON public.payment TO anon, authenticated, service_role;
GRANT SELECT ON public.ledger_entry TO anon, authenticated, service_role;
GRANT SELECT ON public.backuplogs TO anon, authenticated, service_role;
GRANT SELECT ON public.error_logs TO anon, authenticated, service_role;
GRANT SELECT ON public.system_logs TO anon, authenticated, service_role;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
