# System User Guide

This guide explains how to use the system in simple steps.

## 1. Before You Start

- Open the web app in your browser.
- Sign in using your assigned account.
- Your menu is based on your role.

## 2. User Roles and Menus

### Admin (Role 1)
Main menu:
- Dashboard
- Account Management
- Applications
- Reports
- Delinquents & Ledger
- System Settings
- System Maintenance
- Pipeline Map
- Reader & Zone Setup
- Close Day

### Billing Officer (Role 2)
Main menu:
- Dashboard
- Applications
- Concessionaire Management
- Reader & Zone Setup
- Bills Registry
- Billing Reports
- Account Ledger
- Billing Logs

### Meter Reader (Role 3)
Main menu:
- Dashboard
- Concessionaire Management
- Bills Review

### Treasurer (Role 4)
Main menu:
- Dashboard
- Process Payment
- Digital Ledger
- Report

### Consumer (Role 5)
Main pages:
- Consumer Dashboard
- Consumer Profile

## 3. Common Workflows

### A. Approve or Reject New Applications (Admin/Billing)
1. Open `Applications`.
2. Review account and submitted details.
3. Click `Approve` or `Reject`.
4. Add remarks when needed.

### B. Manage Consumers (Admin/Billing/Meter Reader)
1. Open `Concessionaire Management`.
2. Search by name, account number, or zone.
3. Add, edit, or review records.
4. Save and confirm success message.

### C. Configure Reader Assignments and Zone Coverage (Admin/Billing)
1. Open `Reader & Zone Setup`.
2. Pick a schedule date and assign readers per zone.
3. For Admin, open `Zone Coverage Configuration` to manage barangay-to-zone rules.
4. Save assignments.

Note:
- Zone coverage editing is admin-controlled.
- Barangays can be shared across multiple zones based on your zoning structure.

### D. Manage Water Rates and Billing Settings (Admin)
1. Open `System Settings`.
2. Add or edit water rate entries by classification.
3. Set effective dates carefully.
4. Historical rates are for record keeping and should not be changed.

### E. Generate Bills (Billing Officer)
1. Open `Bills Registry`.
2. Select consumer records or reading batch.
3. Confirm bill period and generated values.
4. Save and validate records.

### F. Process Payments (Treasurer)
1. Open `Process Payment`.
2. Search consumer/account.
3. Enter payment amount and method.
4. Save payment.
5. Verify receipt details.

### G. View Ledger and Delinquents
1. Open `Account Ledger` or `Delinquents & Ledger`.
2. Filter by status, date, or account.
3. Review balances, overdue items, and payment trail.

### H. Consumer Self-Service
1. Consumers sign in to `Consumer Dashboard`.
2. They can:
- view account and billing summary
- view payment history
- submit connection application
- send concerns
- request reconnection
- update profile details

## 4. Tips for Daily Use

- Use filters and search before editing records.
- Always double-check effective dates before saving rates.
- Refresh the page if data looks stale.
- Use logs to trace who changed what.

## 5. If Something Looks Wrong

- If a save fails, check required fields first.
- If payment sync is delayed, it may depend on unresolved bill sync errors.
- If data appears different from Supabase, wait for sync cycle or ask admin to run a manual sync in maintenance.
