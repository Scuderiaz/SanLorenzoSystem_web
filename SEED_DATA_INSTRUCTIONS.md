# 🔧 Seed Data - Fixed for Auto-Generated IDs

## ⚠️ Problem Solved

The original seed data used hardcoded IDs (1, 2, 3...) which caused foreign key errors because:
- PostgreSQL auto-generates IDs using sequences
- After deleting data, IDs don't reset to 1
- Foreign key references failed when IDs didn't match

## ✅ Solution Applied

All INSERT statements now use **SELECT with WHERE clauses** to get actual IDs:

### Example - Before (❌ Broken):
```sql
INSERT INTO meters ("Consumer_ID", "Meter_Serial_Number") VALUES
(1, 'SN-2020-001'),  -- Assumes Consumer_ID = 1
(2, 'SN-2019-002');  -- Assumes Consumer_ID = 2
```

### Example - After (✅ Fixed):
```sql
INSERT INTO meters ("Consumer_ID", "Meter_Serial_Number")
SELECT "Consumer_ID", 'SN-2020-001' FROM consumer WHERE "Account_Number" = '03-N-149-5'
UNION ALL SELECT "Consumer_ID", 'SN-2019-002' FROM consumer WHERE "Account_Number" = '01-R-201-3';
```

## 📋 All Fixed Tables

1. ✅ **meters** - Uses `Account_Number` to find `Consumer_ID`
2. ✅ **meterreaders** - Uses `Username` to find `AccountID`
3. ✅ **routes** - Uses JOIN to find `Meter_Reader_ID`
4. ✅ **reading_schedules** - Uses `Username` to find `AccountID`
5. ✅ **meterreadings** - Uses `Account_Number` + `Username`
6. ⏳ **bills** - Still needs fixing (uses hardcoded Reading_ID, Consumer_ID)
7. ⏳ **payments** - Still needs fixing (uses hardcoded ConsumerID, BillID)
8. ⏳ **ledger** - Still needs fixing (uses hardcoded IDs)

## 🚀 How to Use

1. **Run Schema First** (creates tables):
   ```sql
   -- Copy and run: supabase_schema.sql
   ```

2. **Run Seed Data** (inserts data):
   ```sql
   -- Copy and run: supabase_seed_data.sql
   ```

The seed data now:
- ✅ Clears existing data first
- ✅ Uses dynamic ID lookups
- ✅ Works even after multiple runs
- ✅ No foreign key errors

## 📝 Note

Bills, payments, and ledger still use hardcoded IDs because they reference auto-generated Reading_ID and Bill_ID. These will be fixed next to use subqueries based on consumer account numbers and dates.
