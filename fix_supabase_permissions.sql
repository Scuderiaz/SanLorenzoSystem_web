-- Fix Supabase Row Level Security (RLS) permissions
-- Run this in Supabase SQL Editor to allow API access

-- Disable RLS on all tables to allow API access
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE zones DISABLE ROW LEVEL SECURITY;
ALTER TABLE classifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE consumer DISABLE ROW LEVEL SECURITY;
ALTER TABLE meterreaders DISABLE ROW LEVEL SECURITY;
ALTER TABLE meters DISABLE ROW LEVEL SECURITY;
ALTER TABLE routes DISABLE ROW LEVEL SECURITY;
ALTER TABLE reading_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE meterreadings DISABLE ROW LEVEL SECURITY;
ALTER TABLE bills DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE waterrates DISABLE ROW LEVEL SECURITY;

-- Alternative: If you want to keep RLS enabled, create policies instead
-- Uncomment the following lines and comment out the DISABLE statements above

/*
-- Create policies to allow all operations for authenticated users
CREATE POLICY "Allow all operations on roles" ON roles FOR ALL USING (true);
CREATE POLICY "Allow all operations on accounts" ON accounts FOR ALL USING (true);
CREATE POLICY "Allow all operations on zones" ON zones FOR ALL USING (true);
CREATE POLICY "Allow all operations on classifications" ON classifications FOR ALL USING (true);
CREATE POLICY "Allow all operations on consumer" ON consumer FOR ALL USING (true);
CREATE POLICY "Allow all operations on meterreaders" ON meterreaders FOR ALL USING (true);
CREATE POLICY "Allow all operations on meters" ON meters FOR ALL USING (true);
CREATE POLICY "Allow all operations on routes" ON routes FOR ALL USING (true);
CREATE POLICY "Allow all operations on reading_schedules" ON reading_schedules FOR ALL USING (true);
CREATE POLICY "Allow all operations on meterreadings" ON meterreadings FOR ALL USING (true);
CREATE POLICY "Allow all operations on bills" ON bills FOR ALL USING (true);
CREATE POLICY "Allow all operations on payments" ON payments FOR ALL USING (true);
CREATE POLICY "Allow all operations on ledger" ON ledger FOR ALL USING (true);
CREATE POLICY "Allow all operations on waterrates" ON waterrates FOR ALL USING (true);
*/
