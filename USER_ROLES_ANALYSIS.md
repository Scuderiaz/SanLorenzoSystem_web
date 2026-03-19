# SLR Water Billing System - User Roles & Data Flow Analysis

## Database Schema Summary

### Roles (Role_ID)
1. Admin
2. Meter Reader
3. Billing Officer
4. Cashier/Treasurer
5. Consumer

### Key Tables & Relationships

```
accounts (AccountID, Username, Password, Full_Name, Role_ID)
    ↓
meterreaders (Meter_Reader_ID, Account_ID, First_Name, Last_Name) -- For Role_ID=2
    ↓
consumer (Consumer_ID, First_Name, Last_Name, Login_ID→AccountID) -- For Role_ID=5
    ↓
meterreadings (Reading_ID, Consumer_ID, Meter_Reader_ID)
    ↓
bills (Bill_ID, Consumer_ID, Reading_ID, Meter_Reader_Name from meterreadings)
```

## Current Issues Identified

### Issue 1: Meter Reader ID Confusion
- `meterreadings.Meter_Reader_ID` should reference `meterreaders.Meter_Reader_ID` (4 or 5)
- But code was saving `accounts.AccountID` (47 or 48)
- **Fix**: Use `user.Meter_Reader_ID` from login, not `user.AccountID`

### Issue 2: Consumer Name in Receipt
- Receipt should show the SELECTED consumer's name
- Not the meter reader's name or logged-in user's name
- Data comes from `currentReceipt.consumer.First_Name/Last_Name`

### Issue 3: Meter Reader Name in Receipt
- "Tagabasa ng Metro" should show the meter reader who did the reading
- This comes from `userData.First_Name/Last_Name` (logged-in meter reader)
- For consumer app, it comes from `meterreadings` joined with `meterreaders`

## Data Flow by User Role

### 1. METER READER (Role_ID = 2)
**Login Flow:**
1. User enters username/password
2. App queries `accounts` table
3. App queries `meterreaders` table by `Account_ID`
4. Stores: AccountID, Meter_Reader_ID, First_Name, Last_Name

**Reading Entry Flow:**
1. App loads consumers from assigned zone (via `reading_schedules`)
2. Meter reader selects consumer
3. Enters current reading
4. Saves reading with:
   - Consumer_ID (selected consumer)
   - Meter_Reader_ID (from logged-in user)
   - Reading_Date (today)

**Receipt Display:**
- "Pangalan ng Consumer" = consumer.First_Name + consumer.Last_Name
- "Tagabasa ng Metro" = userData.First_Name + userData.Last_Name

### 2. CONSUMER (Role_ID = 5)
**Login Flow:**
1. User enters username/password
2. App queries `accounts` table
3. App queries `consumer` table by `Login_ID = AccountID`
4. Stores consumer profile

**Bill/Receipt View:**
- Consumer sees their own bills
- "Tagabasa ng Metro" = from `meterreadings.Meter_Reader_ID` → `meterreaders.First_Name/Last_Name`

### 3. BILLING OFFICER (Role_ID = 3)
- Reviews meter readings
- Generates/approves bills
- Can see all consumers and readings

### 4. TREASURER/CASHIER (Role_ID = 4)
- Processes payments
- Issues payment receipts
- Updates bill payment status

## Required Fixes

### Fix 1: Ensure Meter_Reader_ID is correctly saved
File: `meter-reader-app/app/(tabs)/entry.tsx`
- Use `user.Meter_Reader_ID` (from meterreaders table)
- Fallback to `user.AccountID` only if Meter_Reader_ID not available

### Fix 2: Ensure consumer data is correctly displayed
File: `meter-reader-app/app/(tabs)/entry.tsx`
- Receipt uses `currentReceipt.consumer.First_Name/Last_Name`
- This should be the SELECTED consumer, not the logged-in user

### Fix 3: Ensure meter reader name syncs to consumer app
File: `consumer-app/services/syncService.ts`
- Bills query joins with `meterreadings` → `meterreaders`
- Extracts `Meter_Reader_Name` for display
