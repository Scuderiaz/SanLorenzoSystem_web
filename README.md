# San Lorenzo Water Billing System

This system helps the waterworks office manage:
- consumer accounts
- meter reader schedules
- water rates
- bill generation
- payment processing
- logs and maintenance

It is built as a web system with role-based access.

## Documentation Set

Start here:
- General documentation: this file
- User guide: [docs/SYSTEM_USER_GUIDE.md](docs/SYSTEM_USER_GUIDE.md)
- Maintenance guide: [docs/SYSTEM_MAINTENANCE_GUIDE.md](docs/SYSTEM_MAINTENANCE_GUIDE.md)
- Database structure backup SQL: [backend/sql/water_billing_schema_backup.sql](backend/sql/water_billing_schema_backup.sql)

## Who Uses The System

Current roles:
- `Role 1`: Admin
- `Role 2`: Billing Officer
- `Role 3`: Meter Reader
- `Role 4`: Treasurer
- `Role 5`: Consumer

## Main Features By Role

### Admin
- Dashboard
- Account Management
- Applications Review (approve/reject)
- Reports
- Delinquents and Ledger view
- System Settings (water rates and billing logic)
- System Maintenance (logs, backup, sync, connection test)
- Pipeline Map
- Close Day
- Zone coverage management in Meter Reading page

### Billing Officer
- Dashboard
- Concessionaire Management
- Reader and Zone Setup
- Bills Registry
- Billing Reports
- Account Ledger
- Billing Logs

### Meter Reader
- Dashboard
- Concessionaire Management
- Bills Review

### Treasurer
- Dashboard
- Process Payment
- Digital Ledger
- Treasurer Reports

### Consumer
- Consumer Dashboard
- View account, bills, and payment history
- Profile management
- Submit connection application
- Submit concern report
- Submit reconnection request

## System Architecture (Simple View)

- Frontend: `web-app/` (React + TypeScript)
- Backend API: `backend/` (Node.js + Express)
- Primary database: PostgreSQL (`water_billing` schema)
- Cloud sync target: Supabase PostgreSQL

## Quick Start (Local)

### 1) Backend

```bash
cd backend
npm install
npm start
```

Default backend URL:
- `http://localhost:3001`

### 2) Frontend

```bash
cd web-app
npm install
npm start
```

Default frontend URL:
- `http://localhost:3000`

## Minimum Environment Variables

Backend (`backend/.env`):
- `PORT`
- `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` (or `DATABASE_URL`)
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`)
- `SUPABASE_DB_SCHEMA=water_billing`

Frontend (`web-app/.env`):
- `REACT_APP_API_URL=http://localhost:3001/api`

## Notes

- The backend includes automatic PostgreSQL <-> Supabase sync routines.
- Zone coverage now uses the `zone_coverage` table as the canonical structure.
- Schema backup scripts are maintained under `backend/sql/`.
