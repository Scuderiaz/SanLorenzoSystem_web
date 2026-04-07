--
-- PostgreSQL database dump
--

\restrict XtgyUPorphTjgpyMyD2gpc78kXhHeefWGVu9NxseOaAKwhtcD9KYPGfudhPtowp

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: water_billing; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA water_billing;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.accounts (
    account_id integer NOT NULL,
    username character varying(50) NOT NULL,
    password character varying(255) NOT NULL,
    auth_user_id uuid,
    role_id integer NOT NULL,
    account_status character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    full_name text,
    phone_number text,
    CONSTRAINT accounts_account_status_check CHECK (((account_status)::text = ANY ((ARRAY['Pending'::character varying, 'Approved'::character varying, 'Rejected'::character varying, 'Active'::character varying, 'Inactive'::character varying])::text[])))
);


--
-- Name: bills; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.bills (
    bill_id integer NOT NULL,
    consumer_id integer NOT NULL,
    reading_id integer NOT NULL,
    billing_officer_id integer,
    billing_month character varying(30),
    date_covered_from timestamp without time zone,
    date_covered_to timestamp without time zone,
    bill_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    due_date timestamp without time zone,
    disconnection_date timestamp without time zone,
    class_cost numeric(12,2) DEFAULT 0 NOT NULL,
    water_charge numeric(12,2) DEFAULT 0 NOT NULL,
    meter_maintenance_fee numeric(12,2) DEFAULT 0 NOT NULL,
    connection_fee numeric(12,2) DEFAULT 0 NOT NULL,
    amount_due numeric(12,2) DEFAULT 0 NOT NULL,
    previous_balance numeric(12,2) DEFAULT 0 NOT NULL,
    previous_penalty numeric(12,2) DEFAULT 0 NOT NULL,
    penalty numeric(12,2) DEFAULT 0 NOT NULL,
    total_amount numeric(12,2) DEFAULT 0 NOT NULL,
    total_after_due_date numeric(12,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'Unpaid'::character varying NOT NULL,
    setting_id integer,
    CONSTRAINT bills_status_check CHECK (((status)::text = ANY ((ARRAY['Unpaid'::character varying, 'Partially Paid'::character varying, 'Paid'::character varying, 'Overdue'::character varying, 'Cancelled'::character varying])::text[])))
);


--
-- Name: classification; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.classification (
    classification_id integer NOT NULL,
    classification_name character varying(50) NOT NULL
);


--
-- Name: consumer; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.consumer (
    consumer_id integer NOT NULL,
    first_name character varying(100) NOT NULL,
    middle_name character varying(100),
    last_name character varying(100) NOT NULL,
    address text NOT NULL,
    purok character varying(100),
    barangay character varying(100),
    municipality character varying(100) DEFAULT 'San Lorenzo Ruiz'::character varying,
    zip_code character varying(10) DEFAULT '4610'::character varying,
    zone_id integer,
    classification_id integer,
    login_id integer NOT NULL,
    account_number character varying(50),
    status character varying(20) DEFAULT 'Active'::character varying NOT NULL,
    contact_number character varying(20),
    connection_date timestamp without time zone,
    meter_number text,
    CONSTRAINT consumer_status_check CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'Active'::character varying, 'Inactive'::character varying])::text[])))
);


--
-- Name: meterreadings; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.meterreadings (
    reading_id integer NOT NULL,
    route_id integer,
    consumer_id integer NOT NULL,
    meter_id integer,
    meter_reader_id integer,
    created_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reading_status character varying(30) DEFAULT 'Pending'::character varying NOT NULL,
    previous_reading numeric(12,2) DEFAULT 0 NOT NULL,
    current_reading numeric(12,2) DEFAULT 0 NOT NULL,
    consumption numeric(12,2) DEFAULT 0 NOT NULL,
    excess_consumption numeric(12,2) DEFAULT 0 NOT NULL,
    notes text,
    status character varying(20) DEFAULT 'Active'::character varying NOT NULL,
    reading_date timestamp without time zone NOT NULL,
    CONSTRAINT chk_meterreadings_values CHECK (((current_reading >= previous_reading) AND (consumption >= (0)::numeric) AND (excess_consumption >= (0)::numeric))),
    CONSTRAINT meterreadings_reading_status_check CHECK (((reading_status)::text = ANY ((ARRAY['Pending'::character varying, 'Normal'::character varying, 'Recorded'::character varying, 'Verified'::character varying, 'Rejected'::character varying])::text[]))),
    CONSTRAINT meterreadings_status_check CHECK (((status)::text = ANY ((ARRAY['Active'::character varying, 'Inactive'::character varying])::text[])))
);


--
-- Name: meter; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.meter (
    meter_id integer NOT NULL,
    consumer_id integer NOT NULL,
    meter_serial_number character varying(100) NOT NULL,
    meter_size character varying(50),
    meter_status character varying(20) DEFAULT 'Active'::character varying NOT NULL,
    installed_date timestamp without time zone,
    CONSTRAINT meter_meter_status_check CHECK (((meter_status)::text = ANY ((ARRAY['Active'::character varying, 'Inactive'::character varying, 'Defective'::character varying, 'Disconnected'::character varying])::text[])))
);


--
-- Name: otp_verifications; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.otp_verifications (
    "ID" integer NOT NULL,
    "AccountID" integer,
    "Code" text NOT NULL,
    "ExpiresAt" timestamp without time zone NOT NULL,
    "IsUsed" boolean DEFAULT false,
    "Attempts" integer DEFAULT 0
);


--
-- Name: payment; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.payment (
    payment_id integer NOT NULL,
    consumer_id integer NOT NULL,
    bill_id integer NOT NULL,
    payment_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    amount_paid numeric(12,2) NOT NULL,
    or_number character varying(100),
    payment_method character varying(50) NOT NULL,
    reference_number character varying(100),
    status character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    validated_by integer,
    validated_date timestamp without time zone,
    CONSTRAINT chk_payment_amount CHECK ((amount_paid >= (0)::numeric)),
    CONSTRAINT payment_status_check CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'Validated'::character varying, 'Rejected'::character varying, 'Voided'::character varying])::text[])))
);


--
-- Name: registration_tickets; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.registration_tickets (
    "ID" integer NOT NULL,
    "TicketNumber" text NOT NULL,
    "AccountID" integer,
    "CreatedAt" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "Status" text DEFAULT 'Pending'::text
);


--
-- Name: roles; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.roles (
    role_id integer NOT NULL,
    role_name character varying(50) NOT NULL
);


--
-- Name: zone; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.zone (
    zone_id integer NOT NULL,
    zone_name character varying(100) NOT NULL
);


--
-- Name: account_approval; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.account_approval (
    approval_id integer NOT NULL,
    account_id integer NOT NULL,
    approved_by integer NOT NULL,
    approval_status character varying(20) NOT NULL,
    approval_date timestamp without time zone,
    remarks text,
    CONSTRAINT account_approval_approval_status_check CHECK (((approval_status)::text = ANY ((ARRAY['Pending'::character varying, 'Approved'::character varying, 'Rejected'::character varying])::text[])))
);


--
-- Name: account_approval_approval_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.account_approval_approval_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: account_approval_approval_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.account_approval_approval_id_seq OWNED BY water_billing.account_approval.approval_id;


--
-- Name: accounts_account_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.accounts_account_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accounts_account_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.accounts_account_id_seq OWNED BY water_billing.accounts.account_id;


--
-- Name: backuplogs; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.backuplogs (
    backup_id integer NOT NULL,
    backup_name character varying(255) NOT NULL,
    backup_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    backup_size character varying(100),
    backup_type character varying(50),
    created_by integer
);


--
-- Name: backuplogs_backup_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.backuplogs_backup_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: backuplogs_backup_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.backuplogs_backup_id_seq OWNED BY water_billing.backuplogs.backup_id;


--
-- Name: billing_settings; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.billing_settings (
    setting_id integer NOT NULL,
    penalty_percent numeric(5,2) DEFAULT 10.00 NOT NULL,
    due_days integer DEFAULT 15 NOT NULL,
    effective_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: billing_settings_setting_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.billing_settings_setting_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: billing_settings_setting_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.billing_settings_setting_id_seq OWNED BY water_billing.billing_settings.setting_id;


--
-- Name: bills_bill_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.bills_bill_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bills_bill_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.bills_bill_id_seq OWNED BY water_billing.bills.bill_id;


--
-- Name: classification_classification_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.classification_classification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: classification_classification_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.classification_classification_id_seq OWNED BY water_billing.classification.classification_id;


--
-- Name: connection_ticket; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.connection_ticket (
    ticket_id integer NOT NULL,
    consumer_id integer,
    account_id integer NOT NULL,
    ticket_number character varying(100) NOT NULL,
    application_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    connection_type character varying(50) NOT NULL,
    requirements_submitted text,
    status character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    inspection_date timestamp without time zone,
    approved_by integer,
    approved_date timestamp without time zone,
    remarks text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT connection_ticket_status_check CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'Approved'::character varying, 'Rejected'::character varying, 'Processing'::character varying, 'Completed'::character varying])::text[])))
);


--
-- Name: connection_ticket_ticket_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.connection_ticket_ticket_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: connection_ticket_ticket_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.connection_ticket_ticket_id_seq OWNED BY water_billing.connection_ticket.ticket_id;


--
-- Name: consumer_consumer_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.consumer_consumer_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: consumer_consumer_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.consumer_consumer_id_seq OWNED BY water_billing.consumer.consumer_id;


--
-- Name: error_logs; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.error_logs (
    error_id integer NOT NULL,
    error_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    severity character varying(20) NOT NULL,
    module character varying(100),
    error_message text NOT NULL,
    user_id integer,
    status character varying(20) DEFAULT 'Open'::character varying,
    CONSTRAINT error_logs_status_check CHECK (((status)::text = ANY ((ARRAY['Open'::character varying, 'Resolved'::character varying, 'Ignored'::character varying])::text[])))
);


--
-- Name: error_logs_error_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.error_logs_error_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: error_logs_error_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.error_logs_error_id_seq OWNED BY water_billing.error_logs.error_id;


--
-- Name: ledger_entry; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.ledger_entry (
    ledger_id integer NOT NULL,
    consumer_id integer NOT NULL,
    transaction_type character varying(50) NOT NULL,
    reference_id integer,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    balance numeric(12,2) DEFAULT 0 NOT NULL,
    transaction_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    notes text
);


--
-- Name: ledger_entry_ledger_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.ledger_entry_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ledger_entry_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.ledger_entry_ledger_id_seq OWNED BY water_billing.ledger_entry.ledger_id;


--
-- Name: meter_meter_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.meter_meter_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: meter_meter_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.meter_meter_id_seq OWNED BY water_billing.meter.meter_id;


--
-- Name: meterreadings_reading_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.meterreadings_reading_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: meterreadings_reading_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.meterreadings_reading_id_seq OWNED BY water_billing.meterreadings.reading_id;


--
-- Name: otp_verifications_ID_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing."otp_verifications_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: otp_verifications_ID_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing."otp_verifications_ID_seq" OWNED BY water_billing.otp_verifications."ID";


--
-- Name: password_reset; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.password_reset (
    reset_id integer NOT NULL,
    account_id integer NOT NULL,
    reset_token character varying(255) NOT NULL,
    expiration_time timestamp without time zone NOT NULL,
    status character varying(20) DEFAULT 'Active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT password_reset_status_check CHECK (((status)::text = ANY ((ARRAY['Active'::character varying, 'Used'::character varying, 'Expired'::character varying])::text[])))
);


--
-- Name: password_reset_reset_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.password_reset_reset_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_reset_reset_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.password_reset_reset_id_seq OWNED BY water_billing.password_reset.reset_id;


--
-- Name: payment_allocation_backup; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.payment_allocation_backup (
    payment_allocation_id integer,
    payment_id integer,
    bill_id integer,
    amount_applied numeric(12,2)
);


--
-- Name: payment_payment_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.payment_payment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_payment_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.payment_payment_id_seq OWNED BY water_billing.payment.payment_id;


--
-- Name: registration_tickets_ID_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing."registration_tickets_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: registration_tickets_ID_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing."registration_tickets_ID_seq" OWNED BY water_billing.registration_tickets."ID";


--
-- Name: roles_role_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.roles_role_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_role_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.roles_role_id_seq OWNED BY water_billing.roles.role_id;


--
-- Name: route; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.route (
    route_id integer NOT NULL,
    meter_reader_id integer NOT NULL,
    zone_id integer NOT NULL
);


--
-- Name: route_route_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.route_route_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: route_route_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.route_route_id_seq OWNED BY water_billing.route.route_id;


--
-- Name: system_logs; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.system_logs (
    log_id integer NOT NULL,
    account_id integer NOT NULL,
    role character varying(50),
    action text NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: system_logs_log_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.system_logs_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_logs_log_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.system_logs_log_id_seq OWNED BY water_billing.system_logs.log_id;


--
-- Name: waterrates; Type: TABLE; Schema: water_billing; Owner: -
--

CREATE TABLE water_billing.waterrates (
    rate_id integer NOT NULL,
    minimum_cubic integer DEFAULT 10 NOT NULL,
    minimum_rate numeric(12,2) DEFAULT 75.00 NOT NULL,
    excess_rate_per_cubic numeric(12,2) DEFAULT 7.50 NOT NULL,
    effective_date timestamp without time zone NOT NULL,
    modified_by integer,
    modified_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: waterrates_rate_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.waterrates_rate_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: waterrates_rate_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.waterrates_rate_id_seq OWNED BY water_billing.waterrates.rate_id;


--
-- Name: zone_zone_id_seq; Type: SEQUENCE; Schema: water_billing; Owner: -
--

CREATE SEQUENCE water_billing.zone_zone_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zone_zone_id_seq; Type: SEQUENCE OWNED BY; Schema: water_billing; Owner: -
--

ALTER SEQUENCE water_billing.zone_zone_id_seq OWNED BY water_billing.zone.zone_id;


--
-- Name: account_approval approval_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.account_approval ALTER COLUMN approval_id SET DEFAULT nextval('water_billing.account_approval_approval_id_seq'::regclass);


--
-- Name: accounts account_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.accounts ALTER COLUMN account_id SET DEFAULT nextval('water_billing.accounts_account_id_seq'::regclass);


--
-- Name: backuplogs backup_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.backuplogs ALTER COLUMN backup_id SET DEFAULT nextval('water_billing.backuplogs_backup_id_seq'::regclass);


--
-- Name: billing_settings setting_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.billing_settings ALTER COLUMN setting_id SET DEFAULT nextval('water_billing.billing_settings_setting_id_seq'::regclass);


--
-- Name: bills bill_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.bills ALTER COLUMN bill_id SET DEFAULT nextval('water_billing.bills_bill_id_seq'::regclass);


--
-- Name: classification classification_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.classification ALTER COLUMN classification_id SET DEFAULT nextval('water_billing.classification_classification_id_seq'::regclass);


--
-- Name: connection_ticket ticket_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.connection_ticket ALTER COLUMN ticket_id SET DEFAULT nextval('water_billing.connection_ticket_ticket_id_seq'::regclass);


--
-- Name: consumer consumer_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.consumer ALTER COLUMN consumer_id SET DEFAULT nextval('water_billing.consumer_consumer_id_seq'::regclass);


--
-- Name: error_logs error_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.error_logs ALTER COLUMN error_id SET DEFAULT nextval('water_billing.error_logs_error_id_seq'::regclass);


--
-- Name: ledger_entry ledger_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.ledger_entry ALTER COLUMN ledger_id SET DEFAULT nextval('water_billing.ledger_entry_ledger_id_seq'::regclass);


--
-- Name: meter meter_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.meter ALTER COLUMN meter_id SET DEFAULT nextval('water_billing.meter_meter_id_seq'::regclass);


--
-- Name: meterreadings reading_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.meterreadings ALTER COLUMN reading_id SET DEFAULT nextval('water_billing.meterreadings_reading_id_seq'::regclass);


--
-- Name: otp_verifications ID; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.otp_verifications ALTER COLUMN "ID" SET DEFAULT nextval('water_billing."otp_verifications_ID_seq"'::regclass);


--
-- Name: password_reset reset_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.password_reset ALTER COLUMN reset_id SET DEFAULT nextval('water_billing.password_reset_reset_id_seq'::regclass);


--
-- Name: payment payment_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.payment ALTER COLUMN payment_id SET DEFAULT nextval('water_billing.payment_payment_id_seq'::regclass);


--
-- Name: registration_tickets ID; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.registration_tickets ALTER COLUMN "ID" SET DEFAULT nextval('water_billing."registration_tickets_ID_seq"'::regclass);


--
-- Name: roles role_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.roles ALTER COLUMN role_id SET DEFAULT nextval('water_billing.roles_role_id_seq'::regclass);


--
-- Name: route route_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.route ALTER COLUMN route_id SET DEFAULT nextval('water_billing.route_route_id_seq'::regclass);


--
-- Name: system_logs log_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.system_logs ALTER COLUMN log_id SET DEFAULT nextval('water_billing.system_logs_log_id_seq'::regclass);


--
-- Name: waterrates rate_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.waterrates ALTER COLUMN rate_id SET DEFAULT nextval('water_billing.waterrates_rate_id_seq'::regclass);


--
-- Name: zone zone_id; Type: DEFAULT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.zone ALTER COLUMN zone_id SET DEFAULT nextval('water_billing.zone_zone_id_seq'::regclass);


--
-- Name: account_approval account_approval_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.account_approval
    ADD CONSTRAINT account_approval_pkey PRIMARY KEY (approval_id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (account_id);


--
-- Name: accounts accounts_username_key; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.accounts
    ADD CONSTRAINT accounts_username_key UNIQUE (username);


--
-- Name: accounts accounts_auth_user_id_key; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.accounts
    ADD CONSTRAINT accounts_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: backuplogs backuplogs_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.backuplogs
    ADD CONSTRAINT backuplogs_pkey PRIMARY KEY (backup_id);


--
-- Name: billing_settings billing_settings_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.billing_settings
    ADD CONSTRAINT billing_settings_pkey PRIMARY KEY (setting_id);


--
-- Name: bills bills_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.bills
    ADD CONSTRAINT bills_pkey PRIMARY KEY (bill_id);


--
-- Name: bills bills_reading_id_key; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.bills
    ADD CONSTRAINT bills_reading_id_key UNIQUE (reading_id);


--
-- Name: classification classification_classification_name_key; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.classification
    ADD CONSTRAINT classification_classification_name_key UNIQUE (classification_name);


--
-- Name: classification classification_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.classification
    ADD CONSTRAINT classification_pkey PRIMARY KEY (classification_id);


--
-- Name: connection_ticket connection_ticket_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.connection_ticket
    ADD CONSTRAINT connection_ticket_pkey PRIMARY KEY (ticket_id);


--
-- Name: connection_ticket connection_ticket_ticket_number_key; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.connection_ticket
    ADD CONSTRAINT connection_ticket_ticket_number_key UNIQUE (ticket_number);


--
-- Name: consumer consumer_account_number_key; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.consumer
    ADD CONSTRAINT consumer_account_number_key UNIQUE (account_number);


--
-- Name: consumer consumer_login_id_key; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.consumer
    ADD CONSTRAINT consumer_login_id_key UNIQUE (login_id);


--
-- Name: consumer consumer_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.consumer
    ADD CONSTRAINT consumer_pkey PRIMARY KEY (consumer_id);


--
-- Name: error_logs error_logs_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.error_logs
    ADD CONSTRAINT error_logs_pkey PRIMARY KEY (error_id);


--
-- Name: ledger_entry ledger_entry_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.ledger_entry
    ADD CONSTRAINT ledger_entry_pkey PRIMARY KEY (ledger_id);


--
-- Name: meter meter_meter_serial_number_key; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.meter
    ADD CONSTRAINT meter_meter_serial_number_key UNIQUE (meter_serial_number);


--
-- Name: meter meter_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.meter
    ADD CONSTRAINT meter_pkey PRIMARY KEY (meter_id);


--
-- Name: meterreadings meterreadings_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.meterreadings
    ADD CONSTRAINT meterreadings_pkey PRIMARY KEY (reading_id);


--
-- Name: otp_verifications otp_verifications_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.otp_verifications
    ADD CONSTRAINT otp_verifications_pkey PRIMARY KEY ("ID");


--
-- Name: password_reset password_reset_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.password_reset
    ADD CONSTRAINT password_reset_pkey PRIMARY KEY (reset_id);


--
-- Name: password_reset password_reset_reset_token_key; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.password_reset
    ADD CONSTRAINT password_reset_reset_token_key UNIQUE (reset_token);


--
-- Name: payment payment_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.payment
    ADD CONSTRAINT payment_pkey PRIMARY KEY (payment_id);


--
-- Name: registration_tickets registration_tickets_TicketNumber_key; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.registration_tickets
    ADD CONSTRAINT "registration_tickets_TicketNumber_key" UNIQUE ("TicketNumber");


--
-- Name: registration_tickets registration_tickets_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.registration_tickets
    ADD CONSTRAINT registration_tickets_pkey PRIMARY KEY ("ID");


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (role_id);


--
-- Name: roles roles_role_name_key; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.roles
    ADD CONSTRAINT roles_role_name_key UNIQUE (role_name);


--
-- Name: route route_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.route
    ADD CONSTRAINT route_pkey PRIMARY KEY (route_id);


--
-- Name: system_logs system_logs_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.system_logs
    ADD CONSTRAINT system_logs_pkey PRIMARY KEY (log_id);


--
-- Name: waterrates waterrates_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.waterrates
    ADD CONSTRAINT waterrates_pkey PRIMARY KEY (rate_id);


--
-- Name: zone zone_pkey; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.zone
    ADD CONSTRAINT zone_pkey PRIMARY KEY (zone_id);


--
-- Name: zone zone_zone_name_key; Type: CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.zone
    ADD CONSTRAINT zone_zone_name_key UNIQUE (zone_name);


--
-- Name: idx_bills_consumer_id; Type: INDEX; Schema: water_billing; Owner: -
--

CREATE INDEX idx_bills_consumer_id ON water_billing.bills USING btree (consumer_id);


--
-- Name: idx_connection_ticket_account_id; Type: INDEX; Schema: water_billing; Owner: -
--

CREATE INDEX idx_connection_ticket_account_id ON water_billing.connection_ticket USING btree (account_id);


--
-- Name: idx_connection_ticket_consumer_id; Type: INDEX; Schema: water_billing; Owner: -
--

CREATE INDEX idx_connection_ticket_consumer_id ON water_billing.connection_ticket USING btree (consumer_id);


--
-- Name: idx_consumer_account_number; Type: INDEX; Schema: water_billing; Owner: -
--

CREATE INDEX idx_consumer_account_number ON water_billing.consumer USING btree (account_number);


--
-- Name: idx_consumer_login_id; Type: INDEX; Schema: water_billing; Owner: -
--

CREATE INDEX idx_consumer_login_id ON water_billing.consumer USING btree (login_id);


--
-- Name: idx_error_logs_user_id; Type: INDEX; Schema: water_billing; Owner: -
--

CREATE INDEX idx_error_logs_user_id ON water_billing.error_logs USING btree (user_id);


--
-- Name: idx_ledger_entry_consumer_id; Type: INDEX; Schema: water_billing; Owner: -
--

CREATE INDEX idx_ledger_entry_consumer_id ON water_billing.ledger_entry USING btree (consumer_id);


--
-- Name: idx_meter_consumer_id; Type: INDEX; Schema: water_billing; Owner: -
--

CREATE INDEX idx_meter_consumer_id ON water_billing.meter USING btree (consumer_id);


--
-- Name: idx_meterreadings_consumer_id; Type: INDEX; Schema: water_billing; Owner: -
--

CREATE INDEX idx_meterreadings_consumer_id ON water_billing.meterreadings USING btree (consumer_id);


--
-- Name: idx_meterreadings_meter_id; Type: INDEX; Schema: water_billing; Owner: -
--

CREATE INDEX idx_meterreadings_meter_id ON water_billing.meterreadings USING btree (meter_id);


--
-- Name: idx_payment_bill_id; Type: INDEX; Schema: water_billing; Owner: -
--

CREATE INDEX idx_payment_bill_id ON water_billing.payment USING btree (bill_id);


--
-- Name: idx_payment_consumer_id; Type: INDEX; Schema: water_billing; Owner: -
--

CREATE INDEX idx_payment_consumer_id ON water_billing.payment USING btree (consumer_id);


--
-- Name: idx_route_meter_reader_id; Type: INDEX; Schema: water_billing; Owner: -
--

CREATE INDEX idx_route_meter_reader_id ON water_billing.route USING btree (meter_reader_id);


--
-- Name: idx_system_logs_account_id; Type: INDEX; Schema: water_billing; Owner: -
--

CREATE INDEX idx_system_logs_account_id ON water_billing.system_logs USING btree (account_id);


--
-- Name: account_approval fk_account_approval_account; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.account_approval
    ADD CONSTRAINT fk_account_approval_account FOREIGN KEY (account_id) REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: account_approval fk_account_approval_approved_by; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.account_approval
    ADD CONSTRAINT fk_account_approval_approved_by FOREIGN KEY (approved_by) REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: accounts fk_accounts_role; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.accounts
    ADD CONSTRAINT fk_accounts_role FOREIGN KEY (role_id) REFERENCES water_billing.roles(role_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: backuplogs fk_backuplogs_created_by; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.backuplogs
    ADD CONSTRAINT fk_backuplogs_created_by FOREIGN KEY (created_by) REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: bills fk_bills_billing_officer; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.bills
    ADD CONSTRAINT fk_bills_billing_officer FOREIGN KEY (billing_officer_id) REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: bills fk_bills_consumer; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.bills
    ADD CONSTRAINT fk_bills_consumer FOREIGN KEY (consumer_id) REFERENCES water_billing.consumer(consumer_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: bills fk_bills_reading; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.bills
    ADD CONSTRAINT fk_bills_reading FOREIGN KEY (reading_id) REFERENCES water_billing.meterreadings(reading_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: bills fk_bills_setting; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.bills
    ADD CONSTRAINT fk_bills_setting FOREIGN KEY (setting_id) REFERENCES water_billing.billing_settings(setting_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: connection_ticket fk_connection_ticket_account; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.connection_ticket
    ADD CONSTRAINT fk_connection_ticket_account FOREIGN KEY (account_id) REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: connection_ticket fk_connection_ticket_approved_by; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.connection_ticket
    ADD CONSTRAINT fk_connection_ticket_approved_by FOREIGN KEY (approved_by) REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: connection_ticket fk_connection_ticket_consumer; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.connection_ticket
    ADD CONSTRAINT fk_connection_ticket_consumer FOREIGN KEY (consumer_id) REFERENCES water_billing.consumer(consumer_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: consumer fk_consumer_classification; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.consumer
    ADD CONSTRAINT fk_consumer_classification FOREIGN KEY (classification_id) REFERENCES water_billing.classification(classification_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: consumer fk_consumer_login; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.consumer
    ADD CONSTRAINT fk_consumer_login FOREIGN KEY (login_id) REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: consumer fk_consumer_zone; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.consumer
    ADD CONSTRAINT fk_consumer_zone FOREIGN KEY (zone_id) REFERENCES water_billing.zone(zone_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: error_logs fk_error_logs_user; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.error_logs
    ADD CONSTRAINT fk_error_logs_user FOREIGN KEY (user_id) REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ledger_entry fk_ledger_entry_consumer; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.ledger_entry
    ADD CONSTRAINT fk_ledger_entry_consumer FOREIGN KEY (consumer_id) REFERENCES water_billing.consumer(consumer_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: meter fk_meter_consumer; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.meter
    ADD CONSTRAINT fk_meter_consumer FOREIGN KEY (consumer_id) REFERENCES water_billing.consumer(consumer_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: meterreadings fk_meterreadings_consumer; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.meterreadings
    ADD CONSTRAINT fk_meterreadings_consumer FOREIGN KEY (consumer_id) REFERENCES water_billing.consumer(consumer_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: meterreadings fk_meterreadings_meter; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.meterreadings
    ADD CONSTRAINT fk_meterreadings_meter FOREIGN KEY (meter_id) REFERENCES water_billing.meter(meter_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: meterreadings fk_meterreadings_reader; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.meterreadings
    ADD CONSTRAINT fk_meterreadings_reader FOREIGN KEY (meter_reader_id) REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: meterreadings fk_meterreadings_route; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.meterreadings
    ADD CONSTRAINT fk_meterreadings_route FOREIGN KEY (route_id) REFERENCES water_billing.route(route_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: password_reset fk_password_reset_account; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.password_reset
    ADD CONSTRAINT fk_password_reset_account FOREIGN KEY (account_id) REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: payment fk_payment_bill; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.payment
    ADD CONSTRAINT fk_payment_bill FOREIGN KEY (bill_id) REFERENCES water_billing.bills(bill_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: payment fk_payment_consumer; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.payment
    ADD CONSTRAINT fk_payment_consumer FOREIGN KEY (consumer_id) REFERENCES water_billing.consumer(consumer_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: payment fk_payment_validated_by; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.payment
    ADD CONSTRAINT fk_payment_validated_by FOREIGN KEY (validated_by) REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: route fk_route_meter_reader; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.route
    ADD CONSTRAINT fk_route_meter_reader FOREIGN KEY (meter_reader_id) REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: route fk_route_zone; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.route
    ADD CONSTRAINT fk_route_zone FOREIGN KEY (zone_id) REFERENCES water_billing.zone(zone_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: system_logs fk_system_logs_account; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.system_logs
    ADD CONSTRAINT fk_system_logs_account FOREIGN KEY (account_id) REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: waterrates fk_waterrates_modified_by; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.waterrates
    ADD CONSTRAINT fk_waterrates_modified_by FOREIGN KEY (modified_by) REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: otp_verifications otp_account_fk; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.otp_verifications
    ADD CONSTRAINT otp_account_fk FOREIGN KEY ("AccountID") REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: registration_tickets registration_account_fk; Type: FK CONSTRAINT; Schema: water_billing; Owner: -
--

ALTER TABLE ONLY water_billing.registration_tickets
    ADD CONSTRAINT registration_account_fk FOREIGN KEY ("AccountID") REFERENCES water_billing.accounts(account_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict XtgyUPorphTjgpyMyD2gpc78kXhHeefWGVu9NxseOaAKwhtcD9KYPGfudhPtowp
