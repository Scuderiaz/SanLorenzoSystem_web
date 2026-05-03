# System Maintenance Guide

This guide is for admins and technical maintainers.

## 1. Purpose

Use this guide to keep the system healthy, stable, and recoverable.

## 2. System Components

- Frontend app: `web-app/`
- Backend API: `backend/server.js`
- Main database: PostgreSQL (`water_billing` schema)
- Cloud mirror/sync: Supabase
- Schema backup file: `backend/sql/water_billing_schema_backup.sql`

## 3. Start and Stop Services

### Backend
```bash
cd backend
npm install
npm start
```

### Frontend
```bash
cd web-app
npm install
npm start
```

## 4. Maintenance Features in the App

Go to `System Maintenance` (Admin menu) for:
- connection test
- manual sync trigger
- system backup creation
- activity and protocol logs
- log cleanup

## 5. Environment Configuration

### Backend `.env`
Common keys:
- `PORT`
- `DATABASE_URL` or `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_SCHEMA=water_billing`
- `SUPABASE_SYNC_INTERVAL_MS`
- `IMMEDIATE_SYNC_DELAY_MS`

### Frontend `.env`
- `REACT_APP_API_URL=http://localhost:3001/api`

## 6. Data and Sync Notes

- The backend syncs between local PostgreSQL and Supabase.
- Some operations are dependency-based. Example:
- `payment` sync can be skipped when `bills` has unresolved sync conflicts.
- `zone_coverage` is the active table for zone coverage rules.

## 7. Known Operational Checks

### A. If payment sync is skipped
Check and fix `bills` conflicts first. After bills are clean, payment sync continues in next cycle.

### B. If Supabase says table/column not found
- Confirm table exists under `water_billing` schema.
- Confirm column names match current backend expectations.
- Refresh Supabase schema cache if needed.

### C. If dates appear to shift
- Validate date field types and frontend date formatting paths.
- Re-check effective date logic before bulk edits.

## 8. Backup and Recovery

### In-app backup
Use `System Maintenance` -> `Create System Backup`.

### Schema structure backup
Use:
- `backend/sql/water_billing_schema_backup.sql`

This file is structure-only and can be used as a baseline reference for rebuilding tables and constraints.

## 9. Logs and Cleanup

Runtime logs are generated during operation.

Recommended cleanup:
- Remove large temporary logs regularly.
- Keep source files and SQL backups under version control.
- Keep `.gitignore` updated for generated logs/build artifacts.

## 10. Release Checklist

Before deploying changes:
1. Run backend syntax check.
2. Build frontend successfully.
3. Verify role access for changed pages.
4. Verify critical flows:
- login
- applications approve/reject
- water rate CRUD
- bill generation
- payment processing
- zone coverage save/delete
5. Confirm sync status is healthy.

## 11. Escalation Checklist

If issue persists after normal checks:
1. Capture exact error message.
2. Capture affected endpoint/page.
3. Capture timestamp and user role.
4. Check backend logs and system logs.
5. Reproduce in a controlled test account.
