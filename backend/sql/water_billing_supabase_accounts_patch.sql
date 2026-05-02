-- Ensure Supabase water_billing.accounts contains all columns expected by backend sync.
-- Safe to run multiple times.

SET search_path TO water_billing, public;

ALTER TABLE IF EXISTS water_billing.accounts
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS profile_picture_url TEXT,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID;

ALTER TABLE IF EXISTS water_billing.accounts
  ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'Active';

ALTER TABLE IF EXISTS water_billing.accounts
  ALTER COLUMN account_status SET DEFAULT 'Active';

-- Optional but recommended uniqueness to match backend assumptions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'water_billing'
      AND table_name = 'accounts'
      AND column_name = 'auth_user_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_auth_user_id_key'
  ) THEN
    ALTER TABLE water_billing.accounts
      ADD CONSTRAINT accounts_auth_user_id_key UNIQUE (auth_user_id);
  END IF;
END
$$;

-- Refresh PostgREST schema cache in Supabase (if allowed).
NOTIFY pgrst, 'reload schema';
