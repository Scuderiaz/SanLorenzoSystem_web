# San Lorenzo Ruiz Water Billing System
## Consultation Notes — April 14, 2026
**Client:** Sir Lester Acunin

---

## 🗂️ PART 1 — NOTES & REQUIREMENTS

---

### 🌐 Landing Page

**Title:** San Lorenzo Ruiz Water Billing

Must include the following sections:
- What the water system is about
- How to apply for a water connection
- Where they are located
- Office hours and contact information

---

### 🔐 Login Page

- Add **Login with Google** and **Login with Facebook**
- Reason: So users don't have to fill in too many fields manually

---

### 📋 Application Form

- Base the form on the **actual physical form** — not just the required fields
- Use a **single-page layout** to reduce clicks and improve flow
- Allow users to **edit and update** their profile details after submission
- Require a **soft copy of Cedula** (Community Tax Certificate) to be uploaded
- Generate a **downloadable and printable ticket** upon submission

---

### 💧 Consumer Classifications & Billing Rates

| Classification | Minimum Charge | Rate (11 cbm+) |
|---|---|---|
| Residential | ₱75.00 | +₱7.50 / cbm |
| Commercial | ₱150.00 | +₱15.00 / cbm |
| Institutional | ❓ Unknown | ❓ Unknown |

> ⚠️ **Follow up needed:** The Institutional rate (for schools) was not recorded. This must be confirmed before billing can be fully implemented.

**Why separate classifications?**  
Each type is billed differently. Commercial consumers pay twice the residential rate — reflecting higher usage and capacity to pay. Institutional likely follows its own rate as well.

---

### 👤 Customer Dashboard

- The **status of the application/ticket must be visible** at all times
  - Example: *"Your account is waiting for approval."*
- Customers can **still log in and see their dashboard** even while their account is pending

**Suggested status labels:**

| Status | Meaning |
|---|---|
| Pending | Application submitted, awaiting review |
| Approved | Application accepted, account is active |
| Rejected | Application denied (reason will be shown) |
| Active | Account in good standing |
| Delinquent | 3+ months of unpaid bills |
| Disconnected | Service has been cut off |

---

### 🪟 Application Details Modal

- Show **Application No. first**, then the applicant's name — make both large and prominent
- **Bold the actual data**, not the label
  - ❌ Wrong: **Consumer Name:** Charles De Vera
  - ✅ Correct: Consumer Name **Charles De Vera**
- For rejected applications:
  - Show status as **Rejected** — never delete the record
  - A **reason must be entered** before rejection is confirmed
  - A popup/modal should appear asking for the reason before finalizing

---

### 🎨 Overall UI Design

- Use **larger text sizes** throughout the system
- Make better use of **white space** — layouts feel cramped
- Make **modal/popup forms larger** — current ones are too small

---

### 🧾 Receipt

- The receipt layout only looks good on **mobile** right now
- Fix it so it also looks correct on **desktop/wide screens**

---

### 🙍 Profile

- Add an option to **upload a profile picture**
- If the user logged in via **Facebook**, their profile photo should carry over automatically

---

### 💸 Bill Display — Bug

- **Customer:** Charles De Vera
- **Issue:** The green Total Due box is showing **₱90** but it should show **₱0**
- The bill has already been paid — the display is not reflecting the correct status

---

### 📟 Meter Reader Module

- When a meter reader is **Approved**, barangays should **automatically be divided** among available meter readers
- Each meter reader must have a **schedule** showing:
  - When to **read** the meter
  - When **billing** happens
  - When **disconnection** is enforced

---

### 🔌 IoT Device Backup

**Question:** What happens if the IoT device breaks down or goes offline?

**Answer:**  
The system keeps running. The meter reader **manually checks the meter** and inputs the reading directly into the system — same process, same system, just no device doing the capturing.

> No device? No problem — manual entry is always the fallback.

---

### ⚠️ Delinquent Account Monitoring

**Threshold:** 3 consecutive months of non-payment = eligible for disconnection

**Requirements:**
- The system must **automatically flag** accounts that reach this threshold
- Staff should be able to see a **list of delinquent accounts** without checking one by one
- A built-in filter or report tab is needed for this

---

### 🖨️ Official Receipt Printing

| | Details |
|---|---|
| Who prints | The Treasurer, after payment is confirmed |
| Proposed format | Blank receipt with 3 input fields |
| Print type | Dot-matrix printer compatible |
| Copy | Carbon copy visible to the cashier |

---

### 🗺️ Pipeline Map

- A **visual map of the water pipeline network** must be added to the system
- Use **color coding** to identify concessionaire type:
  - 🔵 Residential
  - 🔴 Commercial
  - 🟢 Institutional
- Purpose: Easier monitoring and faster identification of issues

---

### 📜 System Logs

The system must log **all key actions** — not just errors. Logs must show:
- **What** happened
- **When** it happened
- **Who** did it

**Events to log:**

| Event | Example |
|---|---|
| Payment received | Amount, account, date |
| Meter reading recorded | Reader, value, date |
| Disconnection flagged | Account, reason |
| Reconnection processed | Account, processed by |
| Account record changed | Field changed, old vs new |
| Application status changed | Approved/Rejected, by whom |
| Login events | User, timestamp |

> Logs must be readable by regular staff — not just IT.

---

### 📡 IoT Connection Status

The system must show the **live status** of the IoT device:

| Status | Meaning |
|---|---|
| 🟢 Active | Device is connected and sending data |
| 🟡 Offline | Device is not responding |
| 🔴 Unresponsive | Connected but not transmitting |

Staff should immediately know from the dashboard if manual entry is needed.

---

### ❓ Still Needs Follow-Up

| Item | Status |
|---|---|
| Institutional billing rate | ⚠️ Not yet recorded — must confirm |
| Staff report requirements (daily, monthly, per zone?) | ⚠️ Not yet discussed |

---
---

## 🚀 PART 2 — IMPLEMENTATION PLAN (In Order)

---

### Phase 1 — Foundations (Do First)

These are the core things needed before anything else can work.

| # | Task | Why First |
|---|---|---|
| 1 | **Fix the bill display bug** (Charles De Vera — ₱90 → ₱0) | Critical data accuracy issue that exists now |
| 2 | **Build the Landing Page** | Public-facing entry point — needed before anything goes live |
| 3 | **Set up Google & Facebook OAuth Login** | Required for application form access and profile photo import |
| 4 | **Confirm Institutional billing rate** | Blocks full billing implementation |

---

### Phase 2 — Application & Onboarding

Once users can land and log in, they need to be able to apply.

| # | Task | Notes |
|---|---|---|
| 5 | **Redesign Application Form** | Mirror the physical form exactly |
| 6 | **Add Cedula upload** | Required for legitimacy — store in Supabase Storage |
| 7 | **Generate downloadable/printable ticket** on submission | Acknowledgment for the applicant |
| 8 | **Show application/ticket status on customer dashboard** | "Waiting for approval," "Approved," etc. |

---

### Phase 3 — Admin & Staff Improvements

Fix the staff-side tools and workflows.

| # | Task | Notes |
|---|---|---|
| 9 | **Fix Rejection flow** — require reason, show "Rejected" not deleted | Add a reason input modal before confirming |
| 10 | **Fix Application Modal layout** — App No. first, bold data not labels | UI polish for staff usability |
| 11 | **Improve overall UI** — bigger text, more whitespace, larger modals | Applies across all admin pages |
| 12 | **Fix Receipt desktop responsiveness** | Currently broken on wide screens |
| 13 | **Add Profile Picture upload** + Facebook photo auto-import | Tied to OAuth setup in Phase 1 |

---

### Phase 4 — Billing & Accounts

Implement the core billing engine and monitoring tools.

| # | Task | Notes |
|---|---|---|
| 14 | **Implement billing by classification** (Residential / Commercial / Institutional) | Requires confirmed rates from Phase 1 |
| 15 | **Delinquent account filter/report** — flag accounts after 3 unpaid months | Critical for disconnection enforcement |
| 16 | **Official Receipt** — dot-matrix compatible, 3-field blank receipt with carbon copy | Coordinate with Treasurer on exact fields |

---

### Phase 5 — Meter Reader & Scheduling

Automate the meter reading workflow.

| # | Task | Notes |
|---|---|---|
| 17 | **Auto-assign barangays** when a meter reader is Approved | Define the division algorithm first |
| 18 | **Add meter reader schedule** — reading, billing, disconnection dates | Per reader, per barangay |
| 19 | **IoT connection status indicator** on dashboard | 🟢 Active / 🟡 Offline / 🔴 Unresponsive |
| 20 | **Manual meter entry fallback** — always accessible regardless of IoT status | IoT backup plan |

---

### Phase 6 — Monitoring & Audit

Add system-wide visibility and compliance tools.

| # | Task | Notes |
|---|---|---|
| 21 | **System Logs / Audit Trail** — log all key actions with who, what, when | Required for accountability |
| 22 | **Staff Reports module** — daily, monthly, per-zone (TBD) | Follow up with client on requirements |

---

### Phase 7 — Advanced Features (Later Sprint)

Large scope items — defer until earlier phases are stable.

| # | Task | Notes |
|---|---|---|
| 23 | **Pipeline Map** — color-coded by classification | Needs GIS/layout data from client |

---

## 📌 Quick Reference — Open Blockers

> These items **block implementation** and need answers before work can start:

1. 🔴 **Institutional billing rate** — minimum charge + per cbm rate
2. 🟡 **Staff report types** — what reports do staff actually need?
3. 🟡 **Barangay assignment algorithm** — how to divide fairly among meter readers
4. 🟡 **Physical application form** — get a copy for exact field mapping
5. 🟡 **Pipeline map data** — who has the GIS or layout file?

---

*Last updated: April 15, 2026 | San Lorenzo Ruiz Water Billing System*
