# Pages Directory Structure

This directory is organized by user roles, matching the desktop app structure.

## Folder Structure

```
pages/
├── login/                  # Login pages
│   └── Login.tsx
├── admin/                  # Admin tools (special access)
│   └── (future pages)
├── assessor_admin/         # Waterworks Admin (Role ID: 1)
│   ├── Dashboard.tsx
│   ├── Users.tsx
│   ├── Consumers.tsx
│   ├── Settings.tsx        (pending)
│   ├── Maintenance.tsx     (pending)
│   ├── Reports.tsx         (pending)
│   └── CloseDay.tsx        (pending)
├── billing_officer/        # Billing Officer (Role ID: 3)
│   ├── Dashboard.tsx       (pending)
│   ├── Consumers.tsx       (pending)
│   ├── MeterReading.tsx    (pending)
│   ├── GenerateBills.tsx   (pending)
│   ├── Ledger.tsx          (pending)
│   └── Reports.tsx         (pending)
└── treasurer/              # Cashier/Treasurer (Role ID: 4)
    ├── Dashboard.tsx       (pending)
    ├── ProcessPayment.tsx  (pending)
    ├── VerifyPayment.tsx   (pending)
    ├── Ledger.tsx          (pending)
    ├── Reports.tsx         (pending)
    └── ViewBill.tsx        (pending)
```

## Role Mapping

| Folder | Role Name | Role ID | Access Level |
|--------|-----------|---------|--------------|
| `admin/` | Admin Tools | N/A | Special (hotkey access) |
| `assessor_admin/` | Waterworks Admin | 1 | Full system access |
| `billing_officer/` | Billing Officer | 3 | Billing operations |
| `treasurer/` | Cashier/Treasurer | 4 | Payment processing |
| `login/` | Login | N/A | Public |

## Completed Pages

- ✅ `login/Login.tsx` - Login page with role selection
- ✅ `assessor_admin/Dashboard.tsx` - Admin dashboard
- ✅ `assessor_admin/Users.tsx` - User management (desktop/mobile)
- ✅ `assessor_admin/Consumers.tsx` - Consumer management with search/filter

## Pending Pages

### Assessor Admin (4 pages)
- Settings
- Maintenance
- Reports
- Close Day

### Billing Officer (6 pages)
- Dashboard
- Consumers (view-only)
- Meter Reading Schedule
- Generate Bills
- Ledger
- Reports

### Treasurer (5 pages)
- Dashboard
- Process Payment
- Verify Payment
- Ledger
- Reports
- View Bill

**Total Remaining**: 15 pages
