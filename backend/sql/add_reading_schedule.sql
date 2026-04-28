-- Add Reading Schedule Table
CREATE TABLE IF NOT EXISTS reading_schedule (
    schedule_id SERIAL PRIMARY KEY,
    schedule_date DATE NOT NULL,
    zone_id INT NOT NULL,
    meter_reader_id INT,
    status VARCHAR(50) NOT NULL DEFAULT 'Scheduled',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(schedule_date, zone_id) -- A zone shouldn't have multiple schedules on the same day
);

-- Note: In Supabase, make sure to enable RLS or set appropriate policies if needed.
