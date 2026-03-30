CREATE SCHEMA IF NOT EXISTS water_billing;
CREATE SCHEMA IF NOT EXISTS public;

ALTER TABLE water_billing.accounts
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

ALTER TABLE water_billing.consumer
  ADD COLUMN IF NOT EXISTS meter_number TEXT;

ALTER TABLE water_billing.consumer
  ALTER COLUMN zone_id DROP NOT NULL,
  ALTER COLUMN classification_id DROP NOT NULL,
  ALTER COLUMN account_number DROP NOT NULL;

ALTER TABLE water_billing.meterreadings
  ALTER COLUMN route_id DROP NOT NULL,
  ALTER COLUMN meter_id DROP NOT NULL,
  ALTER COLUMN meter_reader_id DROP NOT NULL;

ALTER TABLE water_billing.bills
  ALTER COLUMN billing_officer_id DROP NOT NULL,
  ALTER COLUMN billing_month DROP NOT NULL,
  ALTER COLUMN date_covered_from DROP NOT NULL,
  ALTER COLUMN date_covered_to DROP NOT NULL,
  ALTER COLUMN due_date DROP NOT NULL;

ALTER TABLE water_billing.consumer DROP CONSTRAINT IF EXISTS consumer_status_check;
ALTER TABLE water_billing.consumer
  ADD CONSTRAINT consumer_status_check
  CHECK (status IN ('Pending', 'Active', 'Inactive'));

ALTER TABLE water_billing.meterreadings DROP CONSTRAINT IF EXISTS meterreadings_reading_status_check;
ALTER TABLE water_billing.meterreadings
  ADD CONSTRAINT meterreadings_reading_status_check
  CHECK (reading_status IN ('Pending', 'Normal', 'Recorded', 'Verified', 'Rejected'));

CREATE TABLE IF NOT EXISTS water_billing.otp_verifications (
  "ID" SERIAL PRIMARY KEY,
  "AccountID" INTEGER,
  "Code" TEXT NOT NULL,
  "ExpiresAt" TIMESTAMP NOT NULL,
  "IsUsed" BOOLEAN DEFAULT FALSE,
  "Attempts" INTEGER DEFAULT 0,
  CONSTRAINT otp_account_fk
    FOREIGN KEY ("AccountID") REFERENCES water_billing.accounts(account_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS water_billing.registration_tickets (
  "ID" SERIAL PRIMARY KEY,
  "TicketNumber" TEXT UNIQUE NOT NULL,
  "AccountID" INTEGER,
  "CreatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "Status" TEXT DEFAULT 'Pending',
  CONSTRAINT registration_account_fk
    FOREIGN KEY ("AccountID") REFERENCES water_billing.accounts(account_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE OR REPLACE VIEW public.roles AS
SELECT
  role_id AS "Role_ID",
  role_name AS "Role_Name"
FROM water_billing.roles;

CREATE OR REPLACE VIEW public.accounts AS
SELECT
  account_id AS "AccountID",
  username AS "Username",
  password AS "Password",
  full_name AS "Full_Name",
  phone_number AS "Phone_Number",
  account_status AS "Status",
  role_id AS "Role_ID",
  created_at AS "Created_At"
FROM water_billing.accounts;

CREATE OR REPLACE VIEW public.classifications AS
SELECT
  classification_id AS "Classification_ID",
  classification_name AS "Classification_Name"
FROM water_billing.classification;

CREATE OR REPLACE VIEW public.zones AS
SELECT
  zone_id AS "Zone_ID",
  zone_name AS "Zone_Name"
FROM water_billing.zone;

CREATE OR REPLACE VIEW public.consumer AS
SELECT
  consumer_id AS "Consumer_ID",
  first_name AS "First_Name",
  middle_name AS "Middle_Name",
  last_name AS "Last_Name",
  address AS "Address",
  zone_id AS "Zone_ID",
  classification_id AS "Classification_ID",
  login_id AS "Login_ID",
  account_number AS "Account_Number",
  meter_number AS "Meter_Number",
  status AS "Status",
  contact_number AS "Contact_Number",
  connection_date AS "Connection_Date"
FROM water_billing.consumer;

CREATE OR REPLACE VIEW public.meters AS
SELECT
  meter_id AS "Meter_ID",
  consumer_id AS "Consumer_ID",
  meter_serial_number AS "Meter_Serial_Number",
  meter_size AS "Meter_Size",
  meter_status AS "Meter_Status",
  installed_date AS "Installed_Date"
FROM water_billing.meter;

CREATE OR REPLACE VIEW public.meterreadings AS
SELECT
  reading_id AS "Reading_ID",
  route_id AS "Route_ID",
  consumer_id AS "Consumer_ID",
  meter_id AS "Meter_ID",
  meter_reader_id AS "Meter_Reader_ID",
  created_date AS "Created_Date",
  reading_status AS "Reading_Status",
  previous_reading AS "Previous_Reading",
  current_reading AS "Current_Reading",
  consumption AS "Consumption",
  excess_consumption AS "Excess_Consumption",
  notes AS "Notes",
  status AS "Status",
  reading_date AS "Reading_Date"
FROM water_billing.meterreadings;

CREATE OR REPLACE VIEW public.bills AS
SELECT
  bill_id AS "Bill_ID",
  consumer_id AS "Consumer_ID",
  reading_id AS "Reading_ID",
  billing_officer_id AS "Billing_Officer_ID",
  billing_month AS "Billing_Month",
  date_covered_from AS "Date_Covered_From",
  date_covered_to AS "Date_Covered_To",
  bill_date AS "Bill_Date",
  due_date AS "Due_Date",
  disconnection_date AS "Disconnection_Date",
  class_cost AS "Class_Cost",
  water_charge AS "Water_Charge",
  meter_maintenance_fee AS "Meter_Maintenance_Fee",
  connection_fee AS "Connection_Fee",
  amount_due AS "Amount_Due",
  previous_balance AS "Previous_Balance",
  previous_penalty AS "Previous_Penalty",
  penalty AS "Penalty",
  total_amount AS "Total_Amount",
  total_after_due_date AS "Total_After_Due_Date",
  status AS "Status"
FROM water_billing.bills;

CREATE OR REPLACE VIEW public.payments AS
SELECT
  payment_id AS "Payment_ID",
  consumer_id AS "Consumer_ID",
  bill_id AS "Bill_ID",
  payment_date AS "Payment_Date",
  amount_paid AS "Amount_Paid",
  or_number AS "OR_Number",
  payment_method AS "Payment_Method",
  reference_number AS "Reference_Number",
  status AS "Status",
  validated_by AS "Validated_By",
  validated_date AS "Validated_Date"
FROM water_billing.payment;

CREATE OR REPLACE VIEW public.otp_verifications AS
SELECT
  "ID",
  "AccountID",
  "Code",
  "ExpiresAt",
  "IsUsed",
  "Attempts"
FROM water_billing.otp_verifications;

CREATE OR REPLACE VIEW public.registration_tickets AS
SELECT
  "ID",
  "TicketNumber",
  "AccountID",
  "CreatedAt",
  "Status"
FROM water_billing.registration_tickets;
