-- Grant full permissions to service_role on all tables
-- Run this in Supabase SQL Editor

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO service_role;

-- Grant all privileges on all tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;

-- Grant all privileges on all sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Grant specific permissions on each table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zones TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consumer TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meterreaders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meters TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_schedules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meterreadings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waterrates TO service_role;

-- Also grant to anon and authenticated roles for good measure
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Verify permissions
SELECT 
    grantee, 
    table_schema, 
    table_name, 
    privilege_type 
FROM information_schema.table_privileges 
WHERE table_schema = 'public' 
AND grantee IN ('service_role', 'anon', 'authenticated')
ORDER BY table_name, grantee;
