-- Create consumer_concerns table in water_billing schema
CREATE TABLE IF NOT EXISTS water_billing.consumer_concerns (
    concern_id SERIAL PRIMARY KEY,
    sync_id UUID DEFAULT gen_random_uuid() NOT NULL,
    consumer_id INTEGER,
    account_id INTEGER NOT NULL,
    category CHARACTER VARYING(50) NOT NULL,
    subject CHARACTER VARYING(255) NOT NULL,
    description TEXT NOT NULL,
    status CHARACTER VARYING(20) DEFAULT 'Pending' NOT NULL,
    priority CHARACTER VARYING(20) DEFAULT 'Normal' NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP WITHOUT TIME ZONE,
    resolved_by INTEGER,
    remarks TEXT,
    CONSTRAINT consumer_concerns_status_check CHECK (status IN ('Pending', 'In Progress', 'Resolved', 'Closed', 'Rejected')),
    CONSTRAINT consumer_concerns_priority_check CHECK (priority IN ('Low', 'Normal', 'High', 'Urgent'))
);

-- Add index for account_id
CREATE INDEX IF NOT EXISTS idx_consumer_concerns_account_id ON water_billing.consumer_concerns(account_id);
CREATE INDEX IF NOT EXISTS idx_consumer_concerns_consumer_id ON water_billing.consumer_concerns(consumer_id);
