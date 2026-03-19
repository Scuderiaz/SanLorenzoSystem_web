# 🔗 Database Foreign Key Dependencies

## Dependency Hierarchy (Top to Bottom)

```
Level 0: Base Reference Tables (No dependencies)
├── roles
├── zones
├── classifications
└── waterrates

Level 1: Accounts (depends on: roles)
└── accounts → roles.Role_ID

Level 2: Consumers & Meter Readers (depend on: accounts, zones, classifications)
├── consumer → zones.Zone_ID, classifications.Classification_ID, accounts.AccountID
└── meterreaders → accounts.Account_ID

Level 3: Meters & Routes (depend on: consumer, meterreaders, zones)
├── meters → consumer.Consumer_ID
└── routes → meterreaders.Meter_Reader_ID, zones.Zone_ID

Level 4: Readings, Bills, Schedules (depend on: consumer, meters, routes, accounts)
├── meterreadings → consumer.Consumer_ID, meters.Meter_ID, routes.Route_ID
├── bills → consumer.Consumer_ID, meterreadings.Reading_ID, accounts.AccountID
└── reading_schedules → zones.Zone_ID, accounts.AccountID

Level 5: Payments (depend on: consumer, bills)
└── payments → consumer.ConsumerID, bills.BillID

Level 6: Ledger (depends on: consumer, bills, payments, meterreadings, accounts)
└── ledger → consumer.Consumer_ID, bills.Bill_ID, payments.PaymentID, meterreadings.Reading_ID, accounts.AccountID
```

---

## Delete Order (Reverse Dependency)

When clearing data, delete in **reverse order** (deepest dependencies first):

```sql
-- 1. Ledger (most dependencies)
DELETE FROM ledger;

-- 2. Payments
DELETE FROM payments;

-- 3. Bills, Meter Readings, Reading Schedules
DELETE FROM bills;
DELETE FROM meterreadings;
DELETE FROM reading_schedules;

-- 4. Routes, Meters
DELETE FROM routes;
DELETE FROM meters;

-- 5. Meter Readers, Consumers
DELETE FROM meterreaders;
DELETE FROM consumer;

-- 6. Accounts (except admin)
DELETE FROM accounts WHERE "Username" != 'admin';

-- 7. Reference tables (optional - usually keep these)
-- DELETE FROM waterrates;
-- DELETE FROM classifications;
-- DELETE FROM zones;
-- DELETE FROM roles;
```

---

## Insert Order (Follow Dependencies)

When inserting data, insert in **forward order** (base tables first):

```sql
-- 1. Reference tables (usually pre-populated by schema)
-- roles, zones, classifications, waterrates

-- 2. Accounts
INSERT INTO accounts ...

-- 3. Consumers, Meter Readers
INSERT INTO consumer ...
INSERT INTO meterreaders ...

-- 4. Meters, Routes
INSERT INTO meters ...
INSERT INTO routes ...

-- 5. Readings, Bills, Schedules
INSERT INTO meterreadings ...
INSERT INTO bills ...
INSERT INTO reading_schedules ...

-- 6. Payments
INSERT INTO payments ...

-- 7. Ledger
INSERT INTO ledger ...
```

---

## Foreign Key Constraints Summary

| Table | Foreign Keys | References |
|-------|--------------|------------|
| **accounts** | Role_ID | → roles.Role_ID |
| **consumer** | Zone_ID, Classification_ID, Login_ID | → zones, classifications, accounts |
| **meters** | Consumer_ID | → consumer.Consumer_ID |
| **meterreaders** | Account_ID | → accounts.AccountID |
| **routes** | Meter_Reader_ID, Zone_ID | → meterreaders, zones |
| **meterreadings** | Route_ID, Consumer_ID, Meter_ID | → routes, consumer, meters |
| **bills** | Consumer_ID, Reading_ID, Billing_Officer_ID | → consumer, meterreadings, accounts |
| **reading_schedules** | Zone_ID, Meter_Reader_ID, Created_By | → zones, accounts, accounts |
| **payments** | ConsumerID, BillID | → consumer, bills |
| **ledger** | Consumer_ID, Bill_ID, Payment_ID, Reading_ID, Created_By | → consumer, bills, payments, meterreadings, accounts |

---

## 🎯 Key Points

1. **Always delete in reverse dependency order** to avoid foreign key violations
2. **Always insert in forward dependency order** so referenced records exist
3. **Reference tables** (roles, zones, classifications) are usually populated by schema and kept
4. **Use CASCADE** carefully - it can delete more than intended
5. **Keep admin account** when clearing accounts table for system access
