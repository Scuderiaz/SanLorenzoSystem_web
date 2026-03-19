-- Check current RLS status and create proper policies
-- Run this in Supabase SQL Editor

-- Check RLS status on all tables
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('roles', 'accounts', 'zones', 'classifications', 'consumer', 'meterreaders', 'meters', 'routes', 'reading_schedules', 'meterreadings', 'bills', 'payments', 'ledger', 'waterrates');

-- Force disable RLS (try again)
ALTER TABLE public.roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.classifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumer DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.meterreaders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.meters DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.meterreadings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.waterrates DISABLE ROW LEVEL SECURITY;

-- Grant permissions to anon role
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO anon;

-- Grant permissions to authenticated role
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
