# Software Requirements & Design Specification

## Security Policy Awareness & Compliance Management Platform

**Client:** Savikro Enterprises (Sole agent & authorised distributor for LS Electric, Sri Lanka)
**Module:** IE3072 – Information Security Policy Management
**Degree:** B.Sc. (Hons) in Information Technology specialising in Cyber Security, SLIIT
**Group:** 14
**Document version:** 1.0
**Status:** Draft for review
**Companion document:** *Project Proposal – Group 14*

| No. | Name | Student ID |
|-----|------|------------|
| 1 | T I Kasthuri Arachchi | IT23543546 |
| 2 | N D G Liyanage | IT23692732 |
| 3 | S N Wijeratane | IT23552388 |
| 4 | H S A Silva | IT23558182 |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Scope](#2-system-scope)
3. [Roles & Permissions](#3-roles--permissions)
4. [System Architecture](#4-system-architecture)
5. [Use Cases](#5-use-cases)
6. [User Stories](#6-user-stories)
7. [Database Architecture](#7-database-architecture)
8. [API Specification](#8-api-specification)
9. [Optional Module – Phishing Simulation](#9-optional-module--phishing-simulation-m6)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Traceability Matrix](#11-traceability-matrix)
12. [Assumptions, Constraints & Risks](#12-assumptions-constraints--risks)
13. [Glossary](#13-glossary)

---

## 1. Introduction

### 1.1 Purpose

This document translates the Group 14 project proposal into an implementable specification. It defines the actors and roles, the in-scope functionality expressed as use cases and user stories, the MongoDB data architecture, and the REST API surface for the Security Policy Awareness & Compliance Management Platform.

It is intended to be read by the development team as the build reference, by the module supervisor as the assessed design artefact, and by Savikro Enterprises' management as confirmation of what the prototype will and will not do.

### 1.2 Product Summary

Savikro Enterprises handles commercially sensitive supplier pricing, customer contracts, quotations and inventory records across sales, warehouse and administrative functions, but manages information security informally. The platform centralises five things the business currently lacks: a single source of truth for security policies, evidence that staff have read them, role-appropriate awareness training with assessment, management visibility of compliance, and a defined channel for reporting suspected security incidents.

### 1.3 Definitions of Key Terms

| Term | Meaning in this system |
|------|------------------------|
| **Policy** | A named security document (e.g. *Acceptable Use Policy*) that persists across revisions. |
| **Policy Version** | An immutable, numbered revision of a policy. Only one version per policy is `PUBLISHED` at a time. |
| **Acknowledgement** | An employee's recorded confirmation that they have read a *specific version* of a policy. |
| **Assignment** | The system-generated obligation linking a user to a policy version or training module, with a due date. |
| **Compliance** | The percentage of assignments in a scope (user, department, organisation) that are complete and not overdue. |
| **Incident** | An employee-submitted report of a suspected security event. |
| **Simulation** | A controlled, authorised fake phishing email sent to staff for measurement and training (Module M6). |

### 1.4 Document Conventions

- Requirement IDs use the prefixes `UC-` (use case), `US-` (user story), `NFR-` (non-functional requirement), and `FR-` (functional requirement, carried over from the proposal).
- Priority uses MoSCoW: **M** = Must have (MVP), **S** = Should have, **C** = Could have, **W** = Won't have this release.
- Everything marked **M6 / Optional** is the stretch phishing-simulation module and is explicitly outside the MVP commitment.

---

## 2. System Scope

### 2.1 In Scope

| ID | Module | Included functionality |
|----|--------|------------------------|
| M1 | Authentication & Authorisation | Account creation by admin, secure login/logout, bcrypt password hashing, JWT sessions, RBAC enforced at the API layer, account lockout after repeated failures, inactivity timeout, step-up re-authentication for sensitive views. |
| M2 | Policy Management | Policy CRUD, version control, publish/archive workflow, targeting by role and department, employee viewing, digital acknowledgement, immutable acknowledgement audit trail. |
| M3 | Training & Awareness | Training modules made of short content items (article, walkthrough, embedded video), end-of-module quizzes, attempt tracking, pass/fail thresholds, per-employee training record. |
| M4 | Compliance Tracking & Reporting | Organisation and department dashboards, filtering, overdue detection, automated and manual reminders, PDF/Excel export. |
| M5 | Incident Reporting | Employee submission with type, description and optional attachment, automatic severity defaulting, admin triage workflow, high-severity alerting, reporter-side status tracking. |
| M6 | Phishing Simulation *(optional, stretch)* | Template library, authorised campaign scheduling, tracked send/open/click events, safe landing page with just-in-time training, aggregate reporting, optional auto-enrolment of clickers into remedial training. |

### 2.2 Out of Scope

The following are explicitly excluded and will not be delivered or assessed:

- Enterprise network security architecture, firewall configuration or endpoint protection.
- Penetration testing of production systems.
- Integration with Savikro Enterprises' existing ERP, accounting or inventory systems.
- Single sign-on with an external identity provider (Google Workspace, Microsoft Entra ID).
- Native mobile applications — the platform is a responsive web application only.
- Real e-learning standards support (SCORM/xAPI); training content is stored natively.
- Multi-tenancy. The prototype serves one organisation.
- Live production email infrastructure. Email is sent through a development SMTP service or sandbox provider.
- **For M6:** any capture of credentials entered on a simulated landing page. See §9.3.

### 2.3 Deliverables

1. Working MVP web application covering M1–M5.
2. This specification document.
3. An Acceptable Use Policy for the platform itself, loaded as seed data.
4. Sample training content: one walkthrough, one video, one awareness quiz.
5. A sample exported compliance report (PDF and Excel).
6. Seed data script (users, departments, two policies, two training modules).
7. *(If time permits)* M6 phishing simulation module with one campaign's results.

---

## 3. Roles & Permissions

### 3.1 Role Model

The proposal describes staff as *sales, warehouse, administration and management*. These describe **where a person works**, not **what they are allowed to do**, so the system separates the two axes. This keeps RBAC checks simple while still allowing content to be targeted at a specific part of the business.

| Axis | Field | Values |
|------|-------|--------|
| Authorisation | `role` | `EMPLOYEE`, `MANAGER`, `ADMIN` |
| Organisational unit | `department` | `SALES`, `WAREHOUSE`, `ADMINISTRATION`, `MANAGEMENT` |

A warehouse supervisor is therefore `role: MANAGER, department: WAREHOUSE`, and sees warehouse compliance data only.

### 3.2 Actors

| Actor | Type | Description |
|-------|------|-------------|
| **Employee** | Primary, human | Sales, warehouse or administrative staff. Reads policies, acknowledges them, completes assigned training, reports incidents. Often not desk-based; may use a tablet or phone. |
| **Manager** | Primary, human | Department head. Everything an Employee can do, plus visibility of their own department's compliance and the ability to chase outstanding staff. |
| **Administrator** | Primary, human | The owner/IT-responsible person at Savikro. Manages users, authors policies and training, triages incidents, runs organisation-wide reports, authorises simulations. |
| **Scheduler** | Secondary, system | Internal cron process. Detects overdue assignments, dispatches reminders, expires sessions, releases scheduled simulation sends. |
| **Mail Service** | Secondary, external | SMTP/transactional email provider used for notifications, reminders and (M6) simulation delivery. |

### 3.3 Permission Matrix

| Capability | Employee | Manager | Admin |
|------------|:--------:|:-------:|:-----:|
| Log in, change own password | ✔ | ✔ | ✔ |
| View policies targeted at own role/department | ✔ | ✔ | ✔ |
| Acknowledge a policy version | ✔ | ✔ | ✔ |
| View own compliance status | ✔ | ✔ | ✔ |
| Complete training, attempt quizzes | ✔ | ✔ | ✔ |
| Submit an incident report | ✔ | ✔ | ✔ |
| View status of *own* submitted incidents | ✔ | ✔ | ✔ |
| View compliance dashboard — own department | ✖ | ✔ | ✔ |
| View compliance dashboard — organisation-wide | ✖ | ✖ | ✔ |
| Send manual reminders to own department | ✖ | ✔ | ✔ |
| Export compliance report (PDF/Excel) | ✖ | ✔ (dept only) | ✔ (all) |
| Create / edit / publish policy versions | ✖ | ✖ | ✔ |
| Create / edit training modules and quizzes | ✖ | ✖ | ✔ |
| View all incidents, triage, assign, resolve | ✖ | ✖ | ✔ |
| Create, deactivate and re-role user accounts | ✖ | ✖ | ✔ |
| View the system audit log | ✖ | ✖ | ✔ |
| Create templates and launch simulations (M6) | ✖ | ✖ | ✔ |
| View simulation results (M6) | ✖ | ✔ (dept, aggregate) | ✔ |

**Enforcement rule:** every capability above maps to a middleware guard on the corresponding Express route. Hiding a button in React is a usability measure, never an authorisation control (NFR-SEC-03).

---

## 4. System Architecture

### 4.1 Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Client | React.js (Vite), React Router, Axios, TailwindCSS | SPA, responsive down to 360 px. Access token held in memory; refresh token in an `httpOnly` cookie. |
| API | Node.js + Express.js | Layered as `routes → middleware → controller → service → model`. |
| Database | MongoDB (Atlas free tier or local), Mongoose ODM | Document model, described in §7. |
| Auth | `jsonwebtoken` (access + refresh), `bcrypt` (cost 12) | JWT carries `sub`, `role`, `department`, `tokenVersion`. |
| Validation | Zod schemas at the route boundary | Rejects unknown keys; prevents mass-assignment. |
| Hardening | `helmet`, `express-rate-limit`, `cors` (allow-list), `express-mongo-sanitize` | Rate limit: 5 login attempts / 15 min / IP + account. |
| Files | Multer → local `uploads/` in dev, S3-compatible bucket in deployment | MIME + magic-byte check, 10 MB cap, stored under a generated UUID name. |
| Reporting | `pdfkit` (PDF), `exceljs` (XLSX) | Streamed, generated on demand. |
| Jobs | `node-cron` | Reminder sweep, overdue marking, scheduled simulation sends. |
| Email | Nodemailer + sandbox SMTP (Mailtrap / Ethereal) | Templated HTML mail. |
| Logging | `winston` + `morgan` | Application logs are separate from the tamper-evident `auditLogs` collection. |

### 4.2 Layered View

```
┌──────────────────────────────────────────────────────────┐
│  React SPA — Employee / Manager / Admin views            │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTPS + JSON, Bearer access token
┌───────────────────────▼──────────────────────────────────┐
│  Express API                                             │
│  helmet → cors → rate-limit → JSON+sanitise              │
│    → authenticate (JWT)                                  │
│      → authorise (role guard)                            │
│        → validate (Zod)                                  │
│          → controller → service → Mongoose model         │
│  cross-cutting: auditLogger, errorHandler                │
└───────┬──────────────────────┬───────────────────┬───────┘
        │                      │                   │
┌───────▼───────┐   ┌──────────▼────────┐   ┌──────▼───────┐
│   MongoDB     │   │  File storage     │   │  SMTP / cron │
│ 14 collections│   │  policy PDFs,     │   │  reminders,  │
│               │   │  incident attach. │   │  campaigns   │
└───────────────┘   └───────────────────┘   └──────────────┘
```

### 4.3 Key Architectural Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-1 | Policy versions live in a separate collection from policies | Acknowledgements must bind to an exact revision for audit defensibility. Embedding would make a version mutable and break the evidence trail. |
| AD-2 | `assignments` is materialised, not computed on request | Dashboards, overdue sweeps and reminders all read the same rows, so due dates and completion are consistent and queries stay indexable. |
| AD-3 | Quiz answer keys are stripped in the read API | Prevents an employee reading correct answers from the network tab. Grading happens server-side only. |
| AD-4 | `auditLogs` is append-only, no update or delete route | The compliance evidence must be trustworthy; §7.14. |
| AD-5 | Simulation landing pages never accept input | Removes any possibility of the awareness tool becoming a credential-harvesting tool; §9.3. |
| AD-6 | Refresh-token rotation with `tokenVersion` on the user | Lets an admin revoke every active session for a user in one write (deactivation, role change). |

---

## 5. Use Cases

### 5.1 Use Case Inventory

| ID | Use case | Primary actor | Module | Priority |
|----|----------|---------------|--------|:--------:|
| UC-01 | Create employee account | Admin | M1 | M |
| UC-02 | Log in | All users | M1 | M |
| UC-03 | Log out / session expiry | All users | M1 | M |
| UC-04 | Change own password | All users | M1 | M |
| UC-05 | Deactivate or re-role a user | Admin | M1 | M |
| UC-06 | Step-up re-authentication for sensitive view | All users | M1 | S |
| UC-07 | Author a policy and its first version | Admin | M2 | M |
| UC-08 | Publish a new version of an existing policy | Admin | M2 | M |
| UC-09 | View policies applicable to me | Employee | M2 | M |
| UC-10 | Acknowledge a policy version | Employee | M2 | M |
| UC-11 | Archive a policy | Admin | M2 | C |
| UC-12 | View acknowledgement audit trail for a version | Admin | M2 | S |
| UC-13 | Create a training module with quiz | Admin | M3 | M |
| UC-14 | Assign training to roles/departments | Admin | M3 | M |
| UC-15 | Complete a training module | Employee | M3 | M |
| UC-16 | Attempt a quiz | Employee | M3 | M |
| UC-17 | Retake a failed quiz | Employee | M3 | S |
| UC-18 | View my compliance status | Employee | M4 | M |
| UC-19 | View compliance dashboard | Manager / Admin | M4 | M |
| UC-20 | Send reminders to non-compliant staff | Scheduler / Admin | M4 | M |
| UC-21 | Export a compliance report | Manager / Admin | M4 | M |
| UC-22 | Submit a security incident report | Employee | M5 | M |
| UC-23 | Triage and progress an incident | Admin | M5 | M |
| UC-24 | Escalate a high-severity incident | System | M5 | M |
| UC-25 | Track my submitted incident | Employee | M5 | M |
| UC-26 | Create a phishing template | Admin | M6 | C |
| UC-27 | Schedule and authorise a simulation campaign | Admin | M6 | C |
| UC-28 | Record simulation interaction events | System | M6 | C |
| UC-29 | Serve just-in-time training after a click | System | M6 | C |
| UC-30 | Review campaign results | Manager / Admin | M6 | C |

### 5.2 Use Case Diagram (textual)

```
                    ┌─────────────────────────────────────────┐
                    │  Security Policy Awareness & Compliance  │
                    │            Management Platform           │
                    │                                          │
  ┌──────────┐      │  ○ Log in / out (UC-02,03)               │
  │ EMPLOYEE ├──────┼─→○ View & acknowledge policy (UC-09,10)  │
  └──────────┘      │  ○ Complete training & quiz (UC-15,16)   │
        △           │  ○ View my compliance (UC-18)            │
        │  extends  │  ○ Submit & track incident (UC-22,25)    │
  ┌─────┴────┐      │                                          │
  │ MANAGER  ├──────┼─→○ Dept compliance dashboard (UC-19)     │
  └──────────┘      │  ○ Export dept report (UC-21)            │
        △           │  ○ Send reminders (UC-20)                │
        │  extends  │                                          │
  ┌─────┴────┐      │  ○ Manage users (UC-01,05)               │
  │  ADMIN   ├──────┼─→○ Author & publish policy (UC-07,08)    │
  └──────────┘      │  ○ Author training & quiz (UC-13,14)     │
                    │  ○ Triage incidents (UC-23)              │
                    │  ○ Org-wide dashboard & export           │
                    │  ○ Run simulations (UC-26,27,30) [M6]    │
                    │                                          │
  ┌──────────┐      │  ○ Reminder sweep (UC-20)                │
  │SCHEDULER ├──────┼─→○ Escalate high severity (UC-24)        │
  └──────────┘      │  ○ Release scheduled sends (UC-27) [M6]  │
                    │                                          │
  ┌──────────┐      │  ○ Deliver notification email            │
  │MAIL SVC  ├──────┼─→○ Deliver simulation email       [M6]   │
  └──────────┘      └─────────────────────────────────────────┘
```

### 5.3 Detailed Use Case Specifications

---

#### UC-02 — Log in

| Field | Detail |
|-------|--------|
| **ID / Name** | UC-02 Log in |
| **Primary actor** | Employee, Manager, Admin |
| **Goal** | Obtain an authenticated session scoped to the user's role. |
| **Preconditions** | An active account exists for the supplied employee ID or email. |
| **Trigger** | User submits the login form. |
| **Postconditions (success)** | Access token (15 min) issued in the response body; refresh token (7 days) set as an `httpOnly`, `Secure`, `SameSite=Strict` cookie; `lastLoginAt` updated; `AUTH_LOGIN_SUCCESS` written to the audit log. |
| **Postconditions (failure)** | `failedLoginAttempts` incremented; no session created; `AUTH_LOGIN_FAILURE` audited. |

**Main flow**

1. User enters employee ID (or email) and password.
2. System validates the payload shape with Zod.
3. System retrieves the user and confirms `status = ACTIVE`.
4. System confirms the account is not locked (`lockedUntil` is null or in the past).
5. System compares the password against the bcrypt hash.
6. System resets `failedLoginAttempts` to 0 and clears `lockedUntil`.
7. System issues the access and refresh tokens.
8. System redirects to the role-appropriate home: Employee → My Tasks; Manager → Department Dashboard; Admin → Admin Console.

**Alternate & exception flows**

| Ref | Condition | System response |
|-----|-----------|-----------------|
| 2a | Payload invalid | 400 with field-level errors. |
| 3a | No such user **or** wrong password | Generic 401 "Invalid credentials" — identical message and comparable response time in both cases, to avoid account enumeration. Increment counter. |
| 3b | `status = INACTIVE` | Generic 401; no counter increment; `AUTH_LOGIN_INACTIVE` audited. |
| 4a | Account locked | 423 with the remaining lock duration. |
| 5a | 5th consecutive failure | Set `lockedUntil = now + 15 min`; notify the user's email; audit `AUTH_ACCOUNT_LOCKED`. |
| — | More than 5 attempts from one IP in 15 min | 429 from `express-rate-limit`, independent of account state. |

**Related requirements:** FR-AUTH-02, FR-AUTH-04 · NFR-SEC-01, NFR-SEC-02

---

#### UC-10 — Acknowledge a policy version

| Field | Detail |
|-------|--------|
| **ID / Name** | UC-10 Acknowledge a policy version |
| **Primary actor** | Employee (also Manager, Admin acting as employees) |
| **Goal** | Record auditable evidence that this person has read this exact revision. |
| **Preconditions** | User is authenticated; the version is `PUBLISHED`; an `assignment` of type `POLICY` exists for this user and version. |
| **Trigger** | User clicks **I have read and understood this policy**. |
| **Postconditions** | An `acknowledgements` document is created with the user, policy version, timestamp, IP and user agent; the linked assignment moves to `COMPLETED`; dashboards recalculate; `POLICY_ACKNOWLEDGED` audited. |

**Main flow**

1. Employee opens an assigned policy from *My Tasks*.
2. System renders the version body and any attached PDF, and records a `POLICY_VIEWED` event with the view-open timestamp.
3. The acknowledgement control stays disabled until the user has scrolled to the end of the document **and** at least 15 seconds have elapsed (a light guard against reflexive clicking).
4. Employee ticks the confirmation checkbox and submits.
5. System re-verifies that the version is still `PUBLISHED` and is the current version.
6. System writes the acknowledgement and closes the assignment.
7. System shows a confirmation with the recorded timestamp and removes the item from *My Tasks*.

**Alternate & exception flows**

| Ref | Condition | System response |
|-----|-----------|-----------------|
| 5a | A newer version was published while the page was open | 409 "This policy has been updated"; reload the new version; the old assignment is superseded and a new one is created. |
| 5b | Version was archived mid-read | 410; item removed from *My Tasks* with an explanatory notice. |
| 6a | Acknowledgement already exists for this user + version | Return the existing record (idempotent, 200). The unique compound index makes duplicates impossible. |
| 6b | Database write fails | 500; nothing is recorded; the assignment stays `PENDING`; user is told to retry. |

**Business rules**

- BR-01 An acknowledgement is immutable. It is never edited or deleted, only superseded by a newer version's acknowledgement.
- BR-02 Publishing a new version invalidates prior acknowledgements *for compliance purposes* but does not erase them; historical evidence is retained.

**Related requirements:** FR-POL-03, FR-POL-04

---

#### UC-16 — Attempt a quiz

| Field | Detail |
|-------|--------|
| **ID / Name** | UC-16 Attempt a quiz |
| **Primary actor** | Employee |
| **Goal** | Demonstrate understanding of a completed training module. |
| **Preconditions** | All content items in the module are marked complete; attempts used < `maxAttempts`. |
| **Trigger** | Employee selects **Start quiz**. |
| **Postconditions** | A `quizAttempts` document holds the answers, score and pass/fail. On a pass, the `TRAINING` assignment moves to `COMPLETED`. |

**Main flow**

1. System creates an attempt in `IN_PROGRESS` and returns the questions **with `isCorrect` flags stripped from every option** (AD-3).
2. Employee answers each question; the client may save progress.
3. Employee submits.
4. Server grades against the stored key: `score = (correct / total) × 100`.
5. Server compares to `passMark` (default 70) and sets `passed`.
6. If passed → assignment `COMPLETED`, `completedAt` set, certificate line added to the training record.
7. If failed → attempt recorded, remaining attempts shown, per-question feedback displayed without revealing the correct option.
8. Result is surfaced on the employee's training record and in the compliance dashboard.

**Alternate & exception flows**

| Ref | Condition | System response |
|-----|-----------|-----------------|
| 1a | `maxAttempts` already used | 403; instruct the user to contact their manager, who can grant a reset. |
| 3a | Not all questions answered | 400 listing the unanswered question numbers. |
| 3b | Time limit exceeded (if `timeLimitMinutes` set) | Auto-submit whatever was answered; unanswered questions score zero. |
| 3c | Session expired mid-attempt | Attempt is preserved as `IN_PROGRESS`; after re-login the user resumes; the remaining time continues from the server-side clock. |

**Related requirements:** FR-TRN-02, FR-TRN-03

---

#### UC-19 — View compliance dashboard

| Field | Detail |
|-------|--------|
| **ID / Name** | UC-19 View compliance dashboard |
| **Primary actor** | Manager (department scope), Admin (organisation scope) |
| **Goal** | See who is compliant, who is outstanding, and what is overdue. |
| **Preconditions** | Authenticated as Manager or Admin; step-up re-auth satisfied if the session is older than 30 minutes (UC-06). |
| **Trigger** | User opens **Compliance**. |
| **Postconditions** | Read-only. `COMPLIANCE_DASHBOARD_VIEWED` is audited with the scope requested. |

**Main flow**

1. System resolves the caller's permitted scope. A Manager's `departmentFilter` is forced to their own department server-side and cannot be widened by a query parameter.
2. System runs an aggregation over `assignments` to produce: overall compliance %, policy acknowledgement rate, training completion rate, count overdue, and a per-department breakdown.
3. System renders headline cards, a department bar chart, and a sortable table of outstanding staff with each person's oldest overdue item.
4. User filters by department, item type, status or date range.
5. User may drill into an individual to see their full assignment list.
6. From the outstanding table, user may trigger UC-20 (reminders) or UC-21 (export).

**Alternate & exception flows**

| Ref | Condition | System response |
|-----|-----------|-----------------|
| 1a | Manager requests a department other than their own | 403; attempt audited as `RBAC_SCOPE_VIOLATION`. |
| 2a | No assignments exist yet | Empty state: "No policies or training have been assigned yet" with a link to the authoring screens (Admin only). |
| 2b | Aggregation exceeds 2 s | Serve the last cached result (60 s TTL) with a "as of" timestamp. |

**Related requirements:** FR-CMP-01 · NFR-PERF-01

---

#### UC-22 — Submit a security incident report

| Field | Detail |
|-------|--------|
| **ID / Name** | UC-22 Submit a security incident report |
| **Primary actor** | Employee (any role) |
| **Goal** | Report a suspected security issue quickly, from any device. |
| **Preconditions** | Authenticated. |
| **Trigger** | Employee taps **Report an incident** (persistent in the main navigation). |
| **Postconditions** | An `incidents` document is created in `OPEN` with a human-readable reference (`INC-2026-0001`); the reporter sees the reference; admins are notified; high severity triggers UC-24. |

**Main flow**

1. Employee selects a type: *Suspicious email / phishing*, *Lost or stolen device*, *Unauthorised access*, *Data loss or exposure*, *Malware or suspicious file*, *Other*.
2. Employee enters a description and, optionally, when it occurred.
3. Employee optionally attaches a file (screenshot, `.eml`) up to 10 MB.
4. System validates the attachment by extension **and magic bytes**, rejecting executables and archives.
5. System assigns a default severity from the type map (§7.10) — the employee is not asked to judge severity.
6. System stores the incident with `reportedBy`, timestamp and a generated reference number.
7. System notifies all Admins in-app and by email.
8. System confirms to the employee, showing the reference and reassurance that reporting is expected behaviour, not a fault admission.

**Alternate & exception flows**

| Ref | Condition | System response |
|-----|-----------|-----------------|
| 3a | File over 10 MB | 413 before upload completes, with the size limit stated. |
| 4a | Disallowed type or magic-byte mismatch | 415; the incident can still be submitted without the attachment. |
| 5a | Type is *Suspicious email* and the sender matches an active simulation (M6) | Incident is still created, tagged `simulationRelated`, and the reporter is credited as a **reporter** in the campaign statistics. |
| 7a | Email dispatch fails | Incident is still persisted; the notification is queued for retry; failure is logged. Report submission never depends on mail delivery. |

**Related requirements:** FR-INC-01, FR-INC-02, FR-INC-03

---

#### UC-27 — Schedule and authorise a simulation campaign *(M6, optional)*

| Field | Detail |
|-------|--------|
| **ID / Name** | UC-27 Schedule and authorise a phishing simulation campaign |
| **Primary actor** | Admin |
| **Goal** | Measure real-world susceptibility to phishing and route those affected into targeted training. |
| **Preconditions** | A written authorisation from Savikro management is recorded against the campaign; a template exists; the staff handbook already states that simulations occur. |
| **Trigger** | Admin creates a campaign and clicks **Schedule**. |
| **Postconditions** | Campaign is `SCHEDULED`; one `simulationEvent` in `PENDING` per target; the scheduler releases sends at the appointed time. |

**Main flow**

1. Admin selects a template from the library.
2. Admin selects targets by department, role or individually. Minimum cohort size is 5 — smaller groups make individuals identifiable in aggregate reporting.
3. Admin sets the send window and optionally a jitter interval so messages do not all arrive at once.
4. Admin selects the remedial training module to auto-assign to anyone who clicks.
5. Admin records the authorisation reference and the approving manager's name — the campaign **cannot** be scheduled without this.
6. System shows a pre-flight summary: target count, template, landing page preview, and an explicit statement that no credentials will be captured.
7. Admin confirms. Campaign status → `SCHEDULED`; `SIMULATION_CAMPAIGN_SCHEDULED` audited with the authoriser.
8. At the send window the scheduler transitions the campaign to `RUNNING` and dispatches each email with a unique tracking token.

**Alternate & exception flows**

| Ref | Condition | System response |
|-----|-----------|-----------------|
| 2a | Fewer than 5 targets resolve | 400; campaign cannot be scheduled. |
| 5a | Authorisation fields empty | 400; blocking validation error. |
| 7a | Admin cancels a `SCHEDULED` campaign | Status → `CANCELLED`; pending events discarded; audited. |
| 8a | Mail service unavailable | Failed events marked `SEND_FAILED` and retried up to 3 times; the campaign continues for the rest. |

**Related requirements:** §9

### 5.4 Summary Use Cases

The remaining use cases follow the same pattern; their essentials are:

| ID | Actor | Main flow (abridged) | Key exception |
|----|-------|----------------------|---------------|
| UC-01 | Admin | Enter name, employee ID, email, department, role → system generates a temporary password → welcome email → user must change password on first login. | Duplicate employee ID or email → 409. |
| UC-05 | Admin | Set `status = INACTIVE` or change role → increment `tokenVersion` → all existing sessions are invalidated immediately. | Admin cannot deactivate their own account → 400. |
| UC-07 | Admin | Create policy shell (title, category, owner) → author version 1 (body + optional PDF) → set target roles/departments → `DRAFT` → publish. | Publishing with no target audience → 400. |
| UC-08 | Admin | Open published policy → **New version** clones the body → edit → add a change note → publish → previous version becomes `SUPERSEDED`; new assignments generated for all targeted staff; notification sent. | A `DRAFT` for the policy already exists → resume it rather than create a second. |
| UC-09 | Employee | *Policies* lists only versions targeted at the user's role/department, showing acknowledged / pending / overdue state. | No applicable policies → empty state. |
| UC-12 | Admin | Open a version → **Acknowledgements** tab → who acknowledged, when, from which IP; outstanding staff listed alongside. | — |
| UC-13 | Admin | Create module (title, target audience, duration, due-in days) → add content items → build quiz (questions, options, pass mark, max attempts) → publish. | Publish with zero quiz questions → 400. |
| UC-14 | Admin | Select target roles/departments → system creates `TRAINING` assignments with `dueDate = publishedAt + dueInDays`. | Already-assigned users are skipped, not duplicated. |
| UC-15 | Employee | Open module → work through content items → each marked complete → quiz unlocks. | Leaving mid-module preserves progress per item. |
| UC-17 | Employee | Retry a failed quiz until `maxAttempts` is reached; only the best score counts for compliance. | Attempts exhausted → manager reset required. |
| UC-18 | Employee | *My Tasks* shows outstanding policies and training, due dates, and a personal compliance percentage. | — |
| UC-20 | Scheduler / Admin | Nightly sweep finds assignments overdue or due within 3 days → in-app + email reminder → `lastRemindedAt` set. Admin may also send manually. | Max one reminder per assignment per 24 h. |
| UC-21 | Manager / Admin | Choose scope, date range and format → server generates PDF or XLSX → download. Report header records who generated it and when. | Export over 5 000 rows → generated asynchronously, emailed on completion. |
| UC-23 | Admin | Open incident → set severity → assign owner → progress `OPEN → IN_REVIEW → RESOLVED → CLOSED` → add resolution notes. Every transition is appended to `statusHistory`. | Cannot skip from `OPEN` to `CLOSED` without a resolution note. |
| UC-24 | System | On creation of a `HIGH` or `CRITICAL` incident → immediate email to all Admins + in-app alert with a red banner. | Escalation failure logged; the incident record is unaffected. |
| UC-25 | Employee | *My Reports* shows each submission's reference, current status and resolution note (once closed). | Reporter never sees other people's incidents. |
| UC-26 | Admin | Compose template: subject, sender display name, HTML body, difficulty rating, and the visual cues a trainee should have spotted. | Templates impersonating a real named individual are disallowed by policy; generic supplier/IT framing is used instead. |
| UC-28 | System | Unique token per recipient records `SENT`, `OPENED`, `CLICKED`, `REPORTED`. Landing page load = click. | Corporate mail scanners can cause false opens; opens are reported as indicative only, clicks as authoritative. |
| UC-29 | System | Landing page states plainly that this was an authorised simulation, highlights the cues in that specific email, and enrols the user in remedial training. Tone is educational, never punitive. | If auto-enrolment fails, the click is still recorded. |
| UC-30 | Manager / Admin | Campaign report: send/open/click/report rates, time-to-first-click, department comparison, trend across campaigns. Managers see aggregates only. | Cohorts under 5 are suppressed in any per-department breakdown. |

---

## 6. User Stories

Stories are grouped by epic. Each carries an ID, a MoSCoW priority, a story-point estimate, and acceptance criteria written as verifiable conditions.

### Epic E1 — Authentication & Access Control

| ID | Story | Pri | Pts |
|----|-------|:---:|:---:|
| US-001 | As an **Admin**, I want to create employee accounts with a name, employee ID, department and role, so that only known Savikro staff can use the system. | M | 3 |
| US-002 | As an **Employee**, I want to log in with my employee ID and password, so that I can reach my assigned policies and training. | M | 3 |
| US-003 | As an **Employee**, I want to be forced to change the temporary password on first login, so that the password emailed to me is not permanent. | M | 2 |
| US-004 | As a **security-conscious business**, I want accounts locked for 15 minutes after 5 failed logins, so that brute-force guessing is impractical. | M | 3 |
| US-005 | As an **Employee**, I want my session to expire after 30 minutes of inactivity, so that an unattended warehouse terminal cannot be used by someone else. | M | 2 |
| US-006 | As an **Admin**, I want to re-enter my password before opening the compliance dashboard on an old session, so that sensitive company-wide data has a second gate. | S | 3 |
| US-007 | As an **Admin**, I want to deactivate a leaver's account and have all their sessions die immediately, so that access ends the moment employment does. | M | 3 |
| US-008 | As an **Employee**, I want to change my own password, so that I can respond if I think it has been exposed. | M | 2 |

**Acceptance criteria (selected)**

- **US-002** — Given an active account and correct credentials, when I submit the login form, then I receive a session and land on the home screen for my role. Given wrong credentials, then I see the same generic "Invalid credentials" message whether or not the account exists. Given three roles, then each is routed to a different landing page.
- **US-004** — Given 4 prior failures, when the 5th fails, then the account locks for 15 minutes, an email is sent to the account holder, and further attempts return 423 with the remaining time — even with the correct password.
- **US-007** — Given a user with a live session, when an Admin deactivates them, then their next API call returns 401 within one request cycle without waiting for token expiry.

### Epic E2 — Policy Management

| ID | Story | Pri | Pts |
|----|-------|:---:|:---:|
| US-009 | As an **Admin**, I want to create a policy and write its first version, so that guidance lives in one place instead of scattered files. | M | 5 |
| US-010 | As an **Admin**, I want to target a policy at specific roles and departments, so that warehouse staff are not buried in sales-pricing rules. | M | 3 |
| US-011 | As an **Admin**, I want to publish a new version with a change note, so that staff can see what changed and why. | M | 5 |
| US-012 | As an **Employee**, I want to be notified when a policy that applies to me is published or updated, so that I am not expected to check for changes myself. | M | 3 |
| US-013 | As an **Employee**, I want to read only the policies relevant to my job, so that the list is short enough to actually get through. | M | 3 |
| US-014 | As an **Employee**, I want to digitally acknowledge a policy and see the timestamp recorded, so that I have proof I completed it. | M | 3 |
| US-015 | As an **Admin**, I want prior versions and their acknowledgements retained permanently, so that an auditor can see who agreed to what and when. | M | 3 |
| US-016 | As an **Admin**, I want to attach the signed PDF of a policy alongside the on-screen text, so that the formal document and the readable version stay together. | S | 3 |
| US-017 | As an **Admin**, I want to archive a policy that no longer applies, so that it disappears from staff task lists without being deleted from the record. | C | 2 |

**Acceptance criteria (selected)**

- **US-011** — Given a published version 1 with 12 acknowledgements, when I publish version 2, then v1 becomes `SUPERSEDED`, v2 becomes `PUBLISHED`, all 12 acknowledgements are retained against v1, and every targeted employee gets a new pending assignment for v2.
- **US-013** — Given I am `EMPLOYEE`/`WAREHOUSE`, when I open *Policies*, then I see only versions whose `targetRoles` includes `EMPLOYEE` **and** whose `targetDepartments` includes `WAREHOUSE` or is empty; requesting another version by ID directly returns 403.
- **US-014** — Given an assigned policy, when I scroll to the end, wait 15 s, tick the box and submit, then an acknowledgement is stored with my ID, the version ID, the timestamp and my IP; the item leaves *My Tasks*; a second submission returns the original record rather than creating a duplicate.

### Epic E3 — Training & Awareness

| ID | Story | Pri | Pts |
|----|-------|:---:|:---:|
| US-018 | As an **Admin**, I want to build a training module from short content items, so that staff who are not desk-based can finish one in a few minutes. | M | 5 |
| US-019 | As an **Admin**, I want to embed a video or a walkthrough, so that the material suits people who would not read a long article. | S | 3 |
| US-020 | As an **Admin**, I want to attach a quiz with a pass mark, so that completion means comprehension rather than clicking *next*. | M | 5 |
| US-021 | As an **Employee**, I want training aimed at my actual job — quotations for sales, stock records for warehouse — so that it is obviously relevant. | M | 3 |
| US-022 | As an **Employee**, I want my progress saved when I stop halfway, so that I can finish between deliveries. | S | 3 |
| US-023 | As an **Employee**, I want to see my score and which questions I got wrong, so that I learn from the attempt. | M | 3 |
| US-024 | As an **Employee**, I want to retake a failed quiz up to the allowed limit, so that one bad attempt is not permanent. | S | 2 |
| US-025 | As a **Manager**, I want to see completion status and scores for my department, so that I know who still needs to do it. | M | 3 |
| US-026 | As an **Employee**, I want the training pages to work on my phone, so that I do not have to find a desktop. | M | 3 |

**Acceptance criteria (selected)**

- **US-020** — Given a quiz with a 70% pass mark, when I score 60%, then the attempt is `failed`, the assignment stays `PENDING`, and my remaining attempts are shown. When I score 80%, then the assignment moves to `COMPLETED` with a completion timestamp.
- **US-023** — Given a submitted attempt, when I view results, then I see my percentage, pass/fail, and per-question right/wrong marks — and the response payload contains no `isCorrect` flag for any option I did not choose.

### Epic E4 — Compliance Tracking & Reporting

| ID | Story | Pri | Pts |
|----|-------|:---:|:---:|
| US-027 | As an **Admin**, I want a dashboard of acknowledgement and training-completion rates, so that I know where the business stands. | M | 8 |
| US-028 | As a **Manager**, I want to filter by department and see only mine, so that the view is relevant and other departments' data stays private. | M | 3 |
| US-029 | As an **Admin**, I want a list of outstanding staff and their oldest overdue item, so that I can chase the right people first. | M | 5 |
| US-030 | As the **system**, I want to remind people automatically when something is due or overdue, so that chasing does not depend on someone remembering. | M | 5 |
| US-031 | As an **Admin**, I want to send an immediate manual reminder, so that I can act before a deadline rather than after. | S | 2 |
| US-032 | As an **Admin**, I want to export a compliance report as PDF or Excel, so that I can hand evidence to an auditor or to LS Electric. | M | 5 |
| US-033 | As an **Employee**, I want to see my own outstanding items and compliance percentage, so that I know exactly what is left. | M | 3 |
| US-034 | As an **Admin**, I want compliance trend over time, so that I can show whether awareness is genuinely improving. | C | 5 |

**Acceptance criteria (selected)**

- **US-027** — Given 20 users with 60 assignments of which 45 are complete, when I open the dashboard, then overall compliance reads 75%, policy and training rates are shown separately, and the department breakdown sums to the total. The page renders in under 2 seconds.
- **US-030** — Given an assignment due in 3 days and one 2 days overdue, when the nightly job runs, then both users receive one reminder each, `lastRemindedAt` is set, and re-running the job the same day sends nothing further.
- **US-032** — Given a department scope and a date range, when I export to Excel, then the file contains one row per user per assignment with status and dates, plus a header recording the generating user, the scope and the generation timestamp.

### Epic E5 — Incident Reporting

| ID | Story | Pri | Pts |
|----|-------|:---:|:---:|
| US-035 | As an **Employee**, I want to report a suspicious email in under a minute from any page, so that friction does not stop me reporting. | M | 5 |
| US-036 | As an **Employee**, I want to attach a screenshot or the email file, so that IT can assess it properly. | S | 3 |
| US-037 | As the **system**, I want to set a default severity from the incident type, so that untrained staff are not asked to judge criticality. | M | 2 |
| US-038 | As an **Admin**, I want immediate notification of high-severity incidents, so that a lost device or live breach is not sitting in a queue. | M | 3 |
| US-039 | As an **Admin**, I want to move an incident through open → in review → resolved → closed with notes, so that there is a defensible handling record. | M | 5 |
| US-040 | As an **Employee**, I want to see the status of my own report, so that I know it was not ignored. | M | 3 |
| US-041 | As an **Admin**, I want incidents grouped by type over time, so that I can spot recurring problems worth a policy or training change. | C | 3 |

**Acceptance criteria (selected)**

- **US-035** — Given I am on any authenticated page, when I tap *Report an incident*, then the form is reachable in one tap, requires only type and description, and returns a reference number on submit. The whole flow is usable on a 360 px viewport.
- **US-038** — Given I submit a *Lost or stolen device* report, then severity defaults to `HIGH`, every Admin receives an email within 60 seconds, and an in-app alert badge appears on their console.

### Epic E6 — Phishing Simulation *(optional / stretch)*

| ID | Story | Pri | Pts |
|----|-------|:---:|:---:|
| US-042 | As an **Admin**, I want a library of phishing templates at varying difficulty, so that campaigns are realistic without impersonating a real named person. | C | 5 |
| US-043 | As an **Admin**, I want to record management's written authorisation before scheduling, so that the simulation is provably sanctioned. | C | 3 |
| US-044 | As an **Admin**, I want to select targets by department or role and stagger the sends, so that staff do not warn each other within minutes. | C | 5 |
| US-045 | As the **system**, I want to record send, open, click and report events per recipient, so that susceptibility can be measured accurately. | C | 8 |
| US-046 | As an **Employee** who clicked, I want a page that explains what I missed rather than blaming me, so that I learn instead of hiding it next time. | C | 5 |
| US-047 | As the **system**, I want to auto-assign remedial training to anyone who clicked, so that the intervention lands while the moment is fresh. | C | 3 |
| US-048 | As an **Employee**, I want credit for reporting the simulated email through the incident form, so that good behaviour is measured and not just failure. | C | 3 |
| US-049 | As a **Manager**, I want department-level results only, so that the exercise measures organisational risk rather than exposing individuals. | C | 3 |
| US-050 | As an **Admin**, I want click rate compared across campaigns, so that I can show whether awareness training is working. | C | 5 |

**Acceptance criteria (selected)**

- **US-045** — Given a campaign sent to 20 staff, when 12 open and 5 click, then the dashboard reports a 25% click rate; each event carries a timestamp; and no page in the simulation flow contains an input field of any kind.
- **US-046** — Given I click a simulated link, when the landing page loads, then it identifies itself as an authorised Savikro awareness exercise, lists the specific warning signs present in that email, and states that no data was captured and my manager will not be told individually.
- **US-048** — Given I report the simulated email via the incident form before clicking, then my event is marked `REPORTED`, I am counted in the reporter statistic, and I am not enrolled in remedial training.

### 6.1 Suggested Sprint Allocation

| Sprint | Focus | Stories |
|--------|-------|---------|
| 1 | Foundation | Project setup, DB schemas, US-001 → US-008 |
| 2 | Policy core | US-009 → US-015, notifications |
| 3 | Training core | US-018 → US-024, US-026 |
| 4 | Compliance | US-027 → US-033, reminder job |
| 5 | Incidents + export | US-035 → US-040, US-032 |
| 6 | Hardening, seed data, report samples | US-016, US-017, US-025, US-034, US-041 |
| 7 *(if time)* | Phishing simulation | US-042 → US-050 |

---

## 7. Database Architecture

### 7.1 Design Principles

MongoDB is a document store, so the schema is shaped by access patterns rather than by normal forms.

| Principle | Application here |
|-----------|------------------|
| **Embed what is read together and owned by the parent** | Quiz questions live inside the training module; incident status history lives inside the incident. |
| **Reference what is shared, large or independently queried** | Users, policy versions and assignments are separate collections. |
| **Never embed unbounded arrays** | Acknowledgements could reach thousands per policy, so they are their own collection rather than an array on the version. |
| **Make evidence immutable** | `acknowledgements`, `quizAttempts` and `auditLogs` are written once and never updated. |
| **Denormalise for the dashboard, carefully** | `assignments` stores `department` and `itemTitle` copies so dashboard aggregations avoid `$lookup` on every request. Copies are refreshed when the source changes. |
| **Index every filter used by the dashboard** | See §7.16. |

### 7.2 Collection Overview

| # | Collection | Purpose | Est. volume (1 yr) | Growth |
|---|-----------|---------|--------------------|--------|
| 1 | `users` | Staff accounts, role, department, credentials | ~30 | Static |
| 2 | `policies` | Policy identity, persists across revisions | ~15 | Slow |
| 3 | `policyVersions` | Immutable revisions | ~40 | Slow |
| 4 | `acknowledgements` | Evidence of reading a version | ~1 200 | Linear |
| 5 | `trainingModules` | Modules with embedded content + quiz | ~12 | Slow |
| 6 | `quizAttempts` | Every attempt, graded | ~600 | Linear |
| 7 | `assignments` | The obligation ledger driving all dashboards | ~1 500 | Linear |
| 8 | `incidents` | Reports with embedded status history | ~100 | Linear |
| 9 | `notifications` | In-app notification feed | ~5 000 | High (TTL) |
| 10 | `auditLogs` | Append-only security event log | ~20 000 | High |
| 11 | `refreshTokens` | Active session tracking | ~60 | Churns (TTL) |
| 12 | `phishingTemplates` *(M6)* | Reusable simulated emails | ~10 | Static |
| 13 | `phishingCampaigns` *(M6)* | Authorised campaign definitions | ~6 | Slow |
| 14 | `simulationEvents` *(M6)* | Per-recipient interaction record | ~180 | Linear |

### 7.3 Entity Relationship Diagram

```
                            ┌──────────────┐
                            │    users     │
                            │  role, dept  │
                            └──┬──┬──┬──┬──┘
              ┌────────────────┘  │  │  └──────────────────┐
              │                   │  └────────┐            │
   ┌──────────▼──────────┐  ┌─────▼──────┐ ┌──▼─────────┐ ┌▼─────────────┐
   │   acknowledgements  │  │ assignments│ │quizAttempts│ │  incidents   │
   │  userId + versionId │  │ userId +   │ │ userId +   │ │ reportedBy   │
   │       (unique)      │  │ item ref   │ │ moduleId   │ │ assignedTo   │
   └──────────┬──────────┘  └──┬──────┬──┘ └──────┬─────┘ │ [statusHist] │
              │                │      │           │       └──────────────┘
   ┌──────────▼──────────┐     │      │    ┌──────▼──────────┐
   │   policyVersions    │◄────┘      └───►│ trainingModules │
   │ versionNumber, body │                 │ [contentItems]  │
   │ targetRoles/depts   │                 │ [quizQuestions] │
   └──────────┬──────────┘                 └─────────────────┘
              │ N:1
   ┌──────────▼──────────┐
   │      policies       │
   │  title, category    │
   └─────────────────────┘

   ── M6 (optional) ────────────────────────────────────────
   ┌────────────────────┐      ┌────────────────────┐
   │ phishingTemplates  │◄─────┤ phishingCampaigns  │
   └────────────────────┘  1:N │ authorisedBy       │
                               └─────────┬──────────┘
                                         │ 1:N
                               ┌─────────▼──────────┐      ┌─────────┐
                               │  simulationEvents  ├─────►│  users  │
                               │ token, status      │  N:1 └─────────┘
                               └────────────────────┘

   ── Cross-cutting ────────────────────────────────────────
   notifications ──► users        auditLogs ──► users (actorId)
   refreshTokens ──► users
```

### 7.4 `users`

```javascript
{
  _id:            ObjectId,
  employeeId:     String,   // "SVK-014", unique, uppercase
  fullName:       String,
  email:          String,   // unique, lowercase
  passwordHash:   String,   // bcrypt, cost 12 — never selected by default
  role:           String,   // enum: EMPLOYEE | MANAGER | ADMIN
  department:     String,   // enum: SALES | WAREHOUSE | ADMINISTRATION | MANAGEMENT
  jobTitle:       String,   // optional, display only
  status:         String,   // enum: ACTIVE | INACTIVE — default ACTIVE
  mustChangePassword: Boolean,      // true after admin creation / reset
  failedLoginAttempts: Number,      // default 0
  lockedUntil:    Date,     // null when not locked
  lastLoginAt:    Date,
  tokenVersion:   Number,   // default 0 — incremented to kill all sessions
  createdBy:      ObjectId, // ref users
  createdAt:      Date,
  updatedAt:      Date
}
```

**Rules** — `passwordHash` carries `select: false` in the Mongoose schema so it can never leak through a generic serialiser. `role` and `department` are always read from the database on privileged routes rather than trusted from the JWT payload alone, so a role change takes effect immediately.

### 7.5 `policies`

```javascript
{
  _id:             ObjectId,
  title:           String,   // "Acceptable Use Policy"
  code:            String,   // "POL-AUP-001", unique
  category:        String,   // enum: DATA_HANDLING | ACCESS_CONTROL | DEVICE_SECURITY |
                             //       EMAIL_SECURITY | INCIDENT_RESPONSE | GENERAL
  description:     String,   // one-line summary shown in listings
  ownerId:         ObjectId, // ref users — accountable admin
  currentVersionId:ObjectId, // ref policyVersions — the PUBLISHED one, null while draft
  status:          String,   // enum: ACTIVE | ARCHIVED
  createdAt:       Date,
  updatedAt:       Date
}
```

### 7.6 `policyVersions`

```javascript
{
  _id:            ObjectId,
  policyId:       ObjectId, // ref policies
  versionNumber:  Number,   // 1, 2, 3 …
  title:          String,   // snapshot — survives a rename of the parent
  body:           String,   // rich text / markdown
  changeNote:     String,   // "Added USB storage restriction" — required from v2
  attachmentUrl:  String,   // optional signed PDF
  attachmentName: String,
  targetRoles:      [String], // empty array = all roles
  targetDepartments:[String], // empty array = all departments
  status:         String,   // enum: DRAFT | PUBLISHED | SUPERSEDED | ARCHIVED
  effectiveFrom:  Date,
  dueInDays:      Number,   // default 14 — drives assignment dueDate
  authoredBy:     ObjectId, // ref users
  publishedBy:    ObjectId, // ref users
  publishedAt:    Date,
  createdAt:      Date
}
```

**Rules** — Once `status` is `PUBLISHED`, `body`, `targetRoles` and `targetDepartments` are frozen; corrections require a new version. Exactly one version per `policyId` may be `PUBLISHED` at a time, enforced by a partial unique index (§7.16). This is the single most important integrity rule in the schema: it is what makes an acknowledgement mean something specific.

### 7.7 `acknowledgements`

```javascript
{
  _id:             ObjectId,
  userId:          ObjectId, // ref users
  policyId:        ObjectId, // ref policies — denormalised for grouping
  policyVersionId: ObjectId, // ref policyVersions — the binding reference
  versionNumber:   Number,   // snapshot
  acknowledgedAt:  Date,
  viewOpenedAt:    Date,     // used to derive time-spent-reading
  timeSpentSeconds:Number,
  ipAddress:       String,
  userAgent:       String,
  assignmentId:    ObjectId  // ref assignments
}
```

**Rules** — Insert-only. No update or delete route exists. Unique on `{ userId, policyVersionId }`, which makes the acknowledge endpoint naturally idempotent (UC-10, 6a).

### 7.8 `trainingModules`

```javascript
{
  _id:         ObjectId,
  title:       String,
  code:        String,     // "TRN-PHISH-01", unique
  description: String,
  category:    String,     // enum matching policy categories
  estimatedMinutes: Number,
  targetRoles:      [String],
  targetDepartments:[String],
  status:      String,     // enum: DRAFT | PUBLISHED | ARCHIVED
  dueInDays:   Number,     // default 21

  contentItems: [{         // embedded — ordered, small, always read together
    itemId:   String,      // nanoid, stable across edits
    order:    Number,
    type:     String,      // enum: ARTICLE | VIDEO | WALKTHROUGH | PDF
    title:    String,
    body:     String,      // ARTICLE / WALKTHROUGH markdown
    mediaUrl: String,      // VIDEO / PDF
    durationSeconds: Number
  }],

  quiz: {                  // embedded — one quiz per module
    passMark:    Number,   // percent, default 70
    maxAttempts: Number,   // default 3
    timeLimitMinutes: Number, // null = untimed
    shuffleQuestions: Boolean,
    questions: [{
      questionId: String,  // nanoid
      order:      Number,
      text:       String,
      type:       String,  // enum: SINGLE_CHOICE | MULTI_CHOICE | TRUE_FALSE
      options: [{
        optionId:  String,
        text:      String,
        isCorrect: Boolean   // NEVER serialised to a non-admin client
      }],
      explanation: String    // revealed after the final attempt only
    }]
  },

  createdBy: ObjectId,
  publishedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Rules** — A module is bounded (roughly 10 content items, 15 questions), so embedding is safe and keeps the whole module a single read. The service layer applies a projection that strips `options.isCorrect` and `explanation` on every employee-facing route (AD-3).

### 7.9 `quizAttempts`

```javascript
{
  _id:        ObjectId,
  userId:     ObjectId,
  moduleId:   ObjectId,
  attemptNumber: Number,   // 1-based
  status:     String,      // enum: IN_PROGRESS | SUBMITTED | EXPIRED
  startedAt:  Date,
  submittedAt:Date,
  responses: [{
    questionId:        String,
    selectedOptionIds: [String],
    isCorrect:         Boolean   // written at grading time
  }],
  totalQuestions: Number,
  correctCount:   Number,
  scorePercent:   Number,
  passMarkAtAttempt: Number,  // snapshot — the module's pass mark may change later
  passed:         Boolean,
  assignmentId:   ObjectId
}
```

**Rules** — Immutable after submission. `passMarkAtAttempt` is snapshotted so a past result is never retroactively invalidated by an admin editing the module.

### 7.10 `assignments`

The central ledger. Every dashboard number in the system is an aggregation over this collection.

```javascript
{
  _id:        ObjectId,
  userId:     ObjectId,
  department: String,     // denormalised from user, for fast grouping
  userRole:   String,     // denormalised
  itemType:   String,     // enum: POLICY | TRAINING
  itemId:     ObjectId,   // policyVersionId or moduleId
  itemTitle:  String,     // denormalised for report rows without $lookup
  status:     String,     // enum: PENDING | IN_PROGRESS | COMPLETED | OVERDUE | SUPERSEDED
  assignedAt: Date,
  dueDate:    Date,       // assignedAt + item.dueInDays
  startedAt:  Date,
  completedAt:Date,
  completionRef: ObjectId,// acknowledgement _id or passing quizAttempt _id
  progress: {             // TRAINING only
    completedItemIds: [String],
    percentComplete:  Number
  },
  remindersSent:  Number,
  lastRemindedAt: Date,
  source:      String,    // enum: PUBLICATION | MANUAL | REMEDIAL_SIMULATION
  sourceRef:   ObjectId,  // campaign id when source = REMEDIAL_SIMULATION
  createdAt:   Date,
  updatedAt:   Date
}
```

**Rules**

- Unique on `{ userId, itemType, itemId }` — a user is never assigned the same item twice.
- `OVERDUE` is a materialised status set by the nightly job, not computed per request, so a single indexed equality match answers "how many are overdue".
- When a new policy version is published, prior assignments for the superseded version move to `SUPERSEDED` and are excluded from live compliance while remaining in the historical record.
- The denormalised `department`, `userRole` and `itemTitle` fields are refreshed by the service layer when a user transfers department or an item is renamed.

### 7.11 `incidents`

```javascript
{
  _id:        ObjectId,
  reference:  String,     // "INC-2026-0001", unique, human-quotable
  reportedBy: ObjectId,
  reporterDepartment: String,   // denormalised
  type:       String,     // enum: SUSPICIOUS_EMAIL | LOST_DEVICE | UNAUTHORISED_ACCESS |
                          //       DATA_LOSS | MALWARE | OTHER
  title:      String,
  description:String,
  occurredAt: Date,       // optional, user-supplied
  severity:   String,     // enum: LOW | MEDIUM | HIGH | CRITICAL
  severitySetBy: String,  // enum: SYSTEM_DEFAULT | ADMIN_OVERRIDE
  status:     String,     // enum: OPEN | IN_REVIEW | RESOLVED | CLOSED
  assignedTo: ObjectId,   // ref users (admin)

  attachments: [{
    fileName:   String,   // original name, display only
    storageKey: String,   // UUID name on disk/bucket
    mimeType:   String,
    sizeBytes:  Number,
    uploadedAt: Date
  }],

  statusHistory: [{       // embedded, append-only, bounded by workflow length
    fromStatus: String,
    toStatus:   String,
    changedBy:  ObjectId,
    changedAt:  Date,
    note:       String
  }],

  resolutionNote: String,
  resolvedAt:     Date,
  closedAt:       Date,
  simulationRelated: Boolean,  // true when it matches an active M6 campaign
  campaignId:     ObjectId,    // M6
  createdAt:      Date,
  updatedAt:      Date
}
```

**Default severity map**

| Type | Default severity |
|------|------------------|
| `LOST_DEVICE` | HIGH |
| `UNAUTHORISED_ACCESS` | HIGH |
| `DATA_LOSS` | CRITICAL |
| `MALWARE` | HIGH |
| `SUSPICIOUS_EMAIL` | MEDIUM |
| `OTHER` | LOW |

An Admin may override severity; the override is recorded in `statusHistory` and audited, so the original system judgement is never silently lost.

### 7.12 `notifications`

```javascript
{
  _id:      ObjectId,
  userId:   ObjectId,
  type:     String,   // enum: POLICY_PUBLISHED | POLICY_UPDATED | TRAINING_ASSIGNED |
                      //       REMINDER_DUE | REMINDER_OVERDUE | INCIDENT_STATUS_CHANGED |
                      //       INCIDENT_HIGH_SEVERITY | ACCOUNT_LOCKED
  title:    String,
  message:  String,
  linkPath: String,   // "/policies/6634…" — deep link into the SPA
  priority: String,   // enum: NORMAL | HIGH
  isRead:   Boolean,
  readAt:   Date,
  emailSent:      Boolean,
  emailSentAt:    Date,
  emailError:     String,   // populated on delivery failure
  createdAt:      Date,
  expiresAt:      Date      // TTL index, 90 days
}
```

### 7.13 `refreshTokens`

```javascript
{
  _id:        ObjectId,
  userId:     ObjectId,
  tokenHash:  String,   // SHA-256 of the token — the raw value is never stored
  userAgent:  String,
  ipAddress:  String,
  issuedAt:   Date,
  expiresAt:  Date,     // TTL index
  revokedAt:  Date,
  replacedBy: ObjectId  // rotation chain; reuse of a revoked token signals theft
}
```

**Rule** — Presentation of an already-revoked refresh token revokes the entire chain for that user and writes `AUTH_TOKEN_REUSE_DETECTED` to the audit log.

### 7.14 `auditLogs`

```javascript
{
  _id:         ObjectId,
  timestamp:   Date,
  actorId:     ObjectId,  // null for system/scheduler actions
  actorRole:   String,
  action:      String,    // "POLICY_PUBLISHED", "RBAC_SCOPE_VIOLATION", …
  entityType:  String,    // "POLICY_VERSION" | "USER" | "INCIDENT" | "CAMPAIGN" | …
  entityId:    ObjectId,
  outcome:     String,    // enum: SUCCESS | FAILURE | DENIED
  ipAddress:   String,
  userAgent:   String,
  metadata:    Object     // action-specific, e.g. { fromStatus, toStatus }
}
```

**Rules** — Written by middleware, never by controllers. The application's database user is granted `insert` and `find` on this collection only, with no `update` or `delete` privilege, which is what makes the log evidentially useful rather than merely descriptive.

### 7.15 M6 Collections *(optional module)*

```javascript
// phishingTemplates
{
  _id:          ObjectId,
  name:         String,      // "Supplier invoice — urgent payment"
  difficulty:   String,      // enum: EASY | MEDIUM | HARD
  senderName:   String,      // generic role, never a real named individual
  senderEmail:  String,      // lookalike domain owned by the project
  subject:      String,
  bodyHtml:     String,      // must contain the {{TRACKING_LINK}} placeholder
  redFlags:     [String],    // cues shown on the landing page afterwards
  createdBy:    ObjectId,
  createdAt:    Date
}

// phishingCampaigns
{
  _id:          ObjectId,
  name:         String,
  templateId:   ObjectId,
  status:       String,      // enum: DRAFT | SCHEDULED | RUNNING | COMPLETED | CANCELLED
  targetRoles:      [String],
  targetDepartments:[String],
  targetUserIds:    [ObjectId],
  targetCount:      Number,  // minimum 5 — enforced at schedule time
  scheduledFor:     Date,
  jitterMinutes:    Number,  // sends spread randomly across this window
  startedAt:        Date,
  completedAt:      Date,
  remedialModuleId: ObjectId,// auto-assigned to anyone who clicks

  authorisation: {           // blocking — campaign cannot be scheduled without this
    approvedByName:  String,
    approvedByRole:  String,
    approvalRef:     String,
    approvalDate:    Date,
    recordedBy:      ObjectId
  },

  stats: {                   // denormalised counters, updated on each event
    sent: Number, opened: Number, clicked: Number,
    reported: Number, failed: Number
  },
  createdBy: ObjectId,
  createdAt: Date
}

// simulationEvents — one per recipient
{
  _id:          ObjectId,
  campaignId:   ObjectId,
  userId:       ObjectId,
  department:   String,      // denormalised for aggregate reporting
  trackingToken:String,      // unique, unguessable (32-byte random), never reused
  status:       String,      // enum: PENDING | SENT | SEND_FAILED | OPENED | CLICKED | REPORTED
  sentAt:       Date,
  openedAt:     Date,
  clickedAt:    Date,
  reportedAt:   Date,        // reported via the incident form
  timeToClickSeconds: Number,
  remedialAssignmentId: ObjectId,
  createdAt:    Date
}
```

**Rules** — `status` only ever moves forward through the funnel; a click after an open does not overwrite the open timestamp. `REPORTED` is treated as the best outcome and takes precedence in reporting even if the user later clicks. **No collection in M6 has a field capable of holding submitted form data**, because the landing page has no form (§9.3).

### 7.16 Indexes

| Collection | Index | Type | Serves |
|-----------|-------|------|--------|
| `users` | `{ employeeId: 1 }` | unique | Login |
| `users` | `{ email: 1 }` | unique | Login, notifications |
| `users` | `{ department: 1, role: 1, status: 1 }` | compound | Assignment targeting, dashboards |
| `policies` | `{ code: 1 }` | unique | Lookup |
| `policyVersions` | `{ policyId: 1, versionNumber: -1 }` | unique compound | Version history |
| `policyVersions` | `{ policyId: 1, status: 1 }` | partial unique on `status: "PUBLISHED"` | Enforces one published version per policy |
| `policyVersions` | `{ status: 1, targetRoles: 1, targetDepartments: 1 }` | compound multikey | "Policies applicable to me" |
| `acknowledgements` | `{ userId: 1, policyVersionId: 1 }` | unique compound | Idempotency, duplicate prevention |
| `acknowledgements` | `{ policyVersionId: 1, acknowledgedAt: -1 }` | compound | Audit trail per version |
| `trainingModules` | `{ code: 1 }` | unique | Lookup |
| `trainingModules` | `{ status: 1, targetRoles: 1, targetDepartments: 1 }` | compound multikey | "Training assigned to me" |
| `quizAttempts` | `{ userId: 1, moduleId: 1, attemptNumber: -1 }` | compound | Attempt count, best score |
| `assignments` | `{ userId: 1, itemType: 1, itemId: 1 }` | unique compound | No duplicate assignment |
| `assignments` | `{ department: 1, status: 1, itemType: 1 }` | compound | Dashboard aggregation |
| `assignments` | `{ status: 1, dueDate: 1 }` | compound | Nightly overdue + reminder sweep |
| `assignments` | `{ userId: 1, status: 1 }` | compound | *My Tasks* |
| `incidents` | `{ reference: 1 }` | unique | Lookup by reference |
| `incidents` | `{ status: 1, severity: -1, createdAt: -1 }` | compound | Admin triage queue |
| `incidents` | `{ reportedBy: 1, createdAt: -1 }` | compound | *My Reports* |
| `notifications` | `{ userId: 1, isRead: 1, createdAt: -1 }` | compound | Notification bell |
| `notifications` | `{ expiresAt: 1 }` | TTL | Automatic purge at 90 days |
| `refreshTokens` | `{ tokenHash: 1 }` | unique | Rotation |
| `refreshTokens` | `{ expiresAt: 1 }` | TTL | Automatic cleanup |
| `auditLogs` | `{ timestamp: -1 }` | single | Log browsing |
| `auditLogs` | `{ actorId: 1, timestamp: -1 }` | compound | Per-user activity |
| `auditLogs` | `{ action: 1, timestamp: -1 }` | compound | Security event review |
| `simulationEvents` | `{ trackingToken: 1 }` | unique | Landing-page resolution |
| `simulationEvents` | `{ campaignId: 1, status: 1 }` | compound | Campaign results |

### 7.17 Reference Aggregation — Compliance Dashboard

```javascript
db.assignments.aggregate([
  { $match: {
      status: { $ne: "SUPERSEDED" },
      ...(scope.department && { department: scope.department })
  }},
  { $group: {
      _id: { department: "$department", itemType: "$itemType" },
      total:     { $sum: 1 },
      completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
      overdue:   { $sum: { $cond: [{ $eq: ["$status", "OVERDUE"]   }, 1, 0] } }
  }},
  { $addFields: {
      compliancePercent: {
        $round: [{ $multiply: [{ $divide: ["$completed", "$total"] }, 100] }, 1]
      }
  }},
  { $sort: { "_id.department": 1 } }
]);
```

Because `department`, `status` and `itemType` are all denormalised onto `assignments` and covered by a compound index, this runs as an indexed scan with no `$lookup` — the reason AD-2 chose a materialised ledger. Results are cached for 60 seconds (UC-19, 2b).

### 7.18 Data Retention

| Data | Retention | Basis |
|------|-----------|-------|
| Acknowledgements, quiz attempts | Indefinite | Compliance evidence must outlive the policy it relates to. |
| Audit logs | 24 months minimum | Security investigation window. |
| Incidents & attachments | 24 months after closure | Trend analysis and recurrence detection. |
| Notifications | 90 days (TTL) | Transient. |
| Refresh tokens | Until expiry (TTL) | Session hygiene. |
| Simulation events (M6) | 12 months, then aggregated and individual identifiers dropped | Individual susceptibility data is sensitive and has no long-term value once the trend is captured. |
| Leaver accounts | Deactivated, not deleted | Deleting the user would orphan the acknowledgement evidence they generated. |

---

## 8. API Specification

All routes are prefixed `/api/v1`. Every route except `POST /auth/login` and `POST /auth/refresh` requires a valid access token. The **Guard** column names the middleware chain applied after authentication.

### 8.1 Authentication — `/auth`

| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| POST | `/auth/login` | Issue access + refresh tokens | rate-limited, public |
| POST | `/auth/refresh` | Rotate refresh token | cookie only |
| POST | `/auth/logout` | Revoke current refresh token | any |
| GET | `/auth/me` | Current user profile & permissions | any |
| POST | `/auth/change-password` | Change own password | any |
| POST | `/auth/step-up` | Re-verify password for a sensitive view | any |

### 8.2 Users — `/users`

| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET | `/users` | List users, filterable | ADMIN, or MANAGER scoped to own dept |
| POST | `/users` | Create account | ADMIN |
| GET | `/users/:id` | User detail | ADMIN, or self |
| PATCH | `/users/:id` | Update role, department, status | ADMIN |
| POST | `/users/:id/reset-password` | Issue a temporary password | ADMIN |
| GET | `/users/:id/compliance` | Individual compliance record | ADMIN, MANAGER (own dept), self |

### 8.3 Policies — `/policies`

| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET | `/policies` | List policies (filtered to caller's audience for non-admins) | any |
| POST | `/policies` | Create policy shell | ADMIN |
| GET | `/policies/:id` | Policy with version history | any (audience-checked) |
| PATCH | `/policies/:id` | Edit metadata / archive | ADMIN |
| POST | `/policies/:id/versions` | Create a new draft version | ADMIN |
| PATCH | `/policies/:id/versions/:vid` | Edit a draft | ADMIN |
| POST | `/policies/:id/versions/:vid/publish` | Publish; supersede previous; fan out assignments | ADMIN |
| GET | `/policies/:id/versions/:vid` | Read a version | any (audience-checked) |
| POST | `/policies/:id/versions/:vid/acknowledge` | Record acknowledgement | any (assignment required) |
| GET | `/policies/:id/versions/:vid/acknowledgements` | Audit trail + outstanding list | ADMIN |

### 8.4 Training — `/training`

| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET | `/training/modules` | List modules for the caller's audience | any |
| POST | `/training/modules` | Create module | ADMIN |
| PATCH | `/training/modules/:id` | Edit module, content items, quiz | ADMIN |
| POST | `/training/modules/:id/publish` | Publish and fan out assignments | ADMIN |
| GET | `/training/modules/:id` | Module content (answer key stripped for non-admins) | any (audience-checked) |
| POST | `/training/modules/:id/progress` | Mark a content item complete | any |
| POST | `/training/modules/:id/attempts` | Start a quiz attempt | any |
| PATCH | `/training/attempts/:aid` | Save answers in progress | owner only |
| POST | `/training/attempts/:aid/submit` | Submit and grade server-side | owner only |
| GET | `/training/attempts/:aid` | Attempt result | owner, ADMIN |

### 8.5 Compliance — `/compliance`

| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET | `/compliance/me` | My tasks and personal percentage | any |
| GET | `/compliance/dashboard` | Aggregated metrics; scope forced server-side | MANAGER, ADMIN |
| GET | `/compliance/outstanding` | Non-compliant staff and oldest overdue item | MANAGER, ADMIN |
| POST | `/compliance/reminders` | Send manual reminders | MANAGER (own dept), ADMIN |
| POST | `/compliance/reports/export` | Generate PDF or XLSX | MANAGER (own dept), ADMIN |
| GET | `/compliance/trend` | Compliance over time | ADMIN |

### 8.6 Incidents — `/incidents`

| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| POST | `/incidents` | Submit a report (multipart) | any |
| GET | `/incidents` | List — all for ADMIN, own for everyone else | any (scoped) |
| GET | `/incidents/:id` | Detail | ADMIN, or reporter |
| PATCH | `/incidents/:id` | Change status, severity, assignee; append note | ADMIN |
| GET | `/incidents/:id/attachments/:fid` | Download attachment via signed URL | ADMIN, or reporter |
| GET | `/incidents/stats` | Counts by type, severity and month | ADMIN |

### 8.7 Notifications & Audit

| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET | `/notifications` | My feed, unread first | any |
| PATCH | `/notifications/:id/read` | Mark read | owner |
| POST | `/notifications/read-all` | Mark all read | owner |
| GET | `/audit-logs` | Filterable security log | ADMIN |

### 8.8 Simulations — `/simulations` *(M6, optional)*

| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET | `/simulations/templates` | Template library | ADMIN |
| POST | `/simulations/templates` | Create template | ADMIN |
| POST | `/simulations/campaigns` | Create draft campaign | ADMIN |
| POST | `/simulations/campaigns/:id/schedule` | Authorise and schedule; rejects without authorisation and a cohort of 5+ | ADMIN |
| POST | `/simulations/campaigns/:id/cancel` | Cancel a scheduled campaign | ADMIN |
| GET | `/simulations/campaigns/:id/results` | Aggregate results; per-user detail for ADMIN only | MANAGER (dept aggregate), ADMIN |
| GET | `/s/:token` | **Public** landing page — records the click, renders training, accepts no input | public |
| GET | `/s/:token/px.gif` | **Public** 1×1 open-tracking pixel | public |

### 8.9 Standard Error Envelope

```json
{
  "success": false,
  "error": {
    "code": "POLICY_VERSION_SUPERSEDED",
    "message": "This policy has been updated. Please read the current version.",
    "details": [{ "field": "versionId", "issue": "not_current" }]
  },
  "requestId": "b7e3…"
}
```

| Status | Used for |
|--------|----------|
| 400 | Validation failure |
| 401 | Missing, invalid or expired token; bad credentials |
| 403 | Authenticated but not permitted (including scope violations) |
| 404 | Not found, or hidden from this caller by scope |
| 409 | Conflict — duplicate, or a superseded version |
| 410 | Resource archived |
| 413 / 415 | Attachment too large / disallowed type |
| 423 | Account locked |
| 429 | Rate limit exceeded |
| 500 | Unhandled — generic message to the client, full detail to the server log only |

---

## 9. Optional Module — Phishing Simulation (M6)

### 9.1 Rationale

The proposal's problem statement identifies suspicious supplier-impersonation emails as a live risk and notes that staff have no reliable way to recognise them. Training and quizzes measure what people *know*; a simulation measures what they *do*. Running one turns the awareness programme from self-reported into evidence-based, and gives Savikro a click-rate figure it can track across campaigns.

This module is a **stretch goal**. M1–M5 constitute the assessed MVP and do not depend on it.

### 9.2 Functional Flow

```
Admin selects template ──► selects targets (≥5) ──► records management
                                                     authorisation
                                                          │
                                                          ▼
                                              Campaign = SCHEDULED
                                                          │
                                          scheduler releases sends with jitter
                                                          │
                          ┌───────────────────────────────┼──────────────────────┐
                          ▼                               ▼                      ▼
                    User ignores it              User opens (pixel)      User reports it
                          │                               │              via incident form
                     status = SENT                 status = OPENED              │
                                                          │                status = REPORTED
                                                   User clicks link          (best outcome —
                                                          │                 no remediation)
                                                   status = CLICKED
                                                          │
                                          Landing page: "This was a simulation"
                                          + the red flags in THAT email
                                          + no input fields, nothing captured
                                                          │
                                          Remedial training auto-assigned
                                                          │
                                          Campaign results → dashboard
```

### 9.3 Safety and Ethics Constraints (mandatory)

These are not optional design preferences. Building an internal phishing tool without them produces something that is functionally an attack tool, so each is a hard requirement.

| ID | Constraint |
|----|------------|
| ETH-01 | **No credential capture, ever.** The landing page contains no `<input>`, `<form>` or `<textarea>` element. It is a static educational page. No collection in the schema can store submitted data (§7.15). |
| ETH-02 | **Documented authorisation.** A campaign cannot leave `DRAFT` without an approver name, role, reference and date recorded. This is enforced by validation, not by convention. |
| ETH-03 | **Prior general disclosure.** Staff are told in the Acceptable Use Policy that authorised simulations occur. Individual campaigns remain unannounced; the programme itself is not secret. |
| ETH-04 | **Educational, never punitive.** The landing page opens by stating that clicking is common and that the exercise measures the organisation, not the person. No individual results are shown to peers. |
| ETH-05 | **Minimum cohort of 5** for any campaign, and suppression of any department breakdown below 5, so aggregate reporting cannot single someone out. |
| ETH-06 | **Managers see aggregates only.** Per-user click data is visible to Admin alone and is not used for performance management. This is stated in the AUP. |
| ETH-07 | **No sensitive lures.** Templates must not reference salary, redundancy, disciplinary action, medical matters, or a real named colleague. Generic supplier, IT and delivery framing only. |
| ETH-08 | **Owned infrastructure.** Sender domains and landing pages are project-controlled. No real third-party brand — including LS Electric — is impersonated. |
| ETH-09 | **Reporting is rewarded.** A user who reports the email is marked `REPORTED`, counted as a positive outcome, and exempted from remedial assignment. |
| ETH-10 | **Short retention.** Individual event data is anonymised after 12 months, leaving only the aggregate trend (§7.18). |

### 9.4 Metrics

| Metric | Definition | Target direction |
|--------|-----------|------------------|
| Click rate | clicked ÷ sent | Down across campaigns |
| Report rate | reported ÷ sent | Up |
| Open-to-click conversion | clicked ÷ opened | Down |
| Median time to first click | Elapsed from send to first click | Up (hesitation is good) |
| Median time to first report | Elapsed from send to first report | Down |
| Repeat clickers | Users clicking in 2+ consecutive campaigns | Down; triggers targeted follow-up |

### 9.5 Acceptance Threshold

M6 is considered delivered only when: a campaign can be created, authorised and scheduled; emails are dispatched with unique tokens; open, click and report events are recorded correctly; the landing page renders with no input elements; remedial training is auto-assigned on click; and the results dashboard shows correct rates with cohorts under 5 suppressed. Partial delivery is not merged into the MVP branch.

---

## 10. Non-Functional Requirements

| ID | Category | Requirement | How it is verified |
|----|----------|-------------|--------------------|
| NFR-USE-01 | Usability | A new employee completes login, reading and acknowledging one policy without written instruction. | Usability walkthrough with 3 non-technical testers. |
| NFR-USE-02 | Usability | All employee-facing screens are usable at 360 px width; primary actions reachable with one thumb. | Device testing on a phone and a tablet. |
| NFR-USE-03 | Accessibility | Text contrast meets WCAG 2.1 AA; all form fields have labels; the app is keyboard-navigable. | Lighthouse audit ≥ 90 on accessibility. |
| NFR-PERF-01 | Performance | Standard page loads complete under 2 s on a 4G connection. | Lighthouse + manual timing. |
| NFR-PERF-02 | Performance | The compliance aggregation returns in under 500 ms for 30 users and 2 000 assignments. | Seeded load test with `explain()` confirming index use. |
| NFR-PERF-03 | Performance | 20 concurrent users cause no visible degradation. | Artillery script. |
| NFR-REL-01 | Reliability | Available during working hours, 08:00–18:00 Sri Lanka time. | Uptime monitor. |
| NFR-REL-02 | Reliability | Incident submission succeeds even when the mail service is down. | Fault-injection test (UC-22, 7a). |
| NFR-REL-03 | Reliability | Automated daily database backup, restore tested at least once. | Documented restore run. |
| NFR-SEC-01 | Security | All traffic over HTTPS/TLS 1.2+; HSTS enabled. | SSL Labs grade A. |
| NFR-SEC-02 | Security | Passwords bcrypt-hashed at cost 12; never logged, returned or emailed after first issue. | Code review + log inspection. |
| NFR-SEC-03 | Security | Every authorisation decision is enforced server-side. Removing the UI guard must not grant access. | Direct API testing with a low-privilege token against every privileged route. |
| NFR-SEC-04 | Security | All input validated with Zod at the route boundary; unknown keys rejected. | Schema coverage review. |
| NFR-SEC-05 | Security | Uploads validated by MIME **and** magic bytes, size-capped, stored outside the web root under generated names. | Malicious-upload test. |
| NFR-SEC-06 | Security | Security-relevant actions are audited with actor, action, target, outcome and timestamp. | Audit log inspection against a scripted action set. |
| NFR-SEC-07 | Security | No sensitive data in URLs, logs or client-side storage; tokens held in memory or `httpOnly` cookies. | Code review + browser inspection. |
| NFR-SCA-01 | Scalability | Supports 200 users and 20 000 assignments with no schema change. | Seeded volume test. |
| NFR-MNT-01 | Maintainability | Modules are independently deployable within the layered structure; no controller touches another module's model directly. | Architecture review. |
| NFR-MNT-02 | Maintainability | ≥ 60% unit test coverage on service-layer business logic. | Jest coverage report. |
| NFR-MNT-03 | Maintainability | All configuration via environment variables; no secrets in the repository. | `.env.example` present, `git-secrets` scan clean. |

---

## 11. Traceability Matrix

Proposal functional requirements mapped to the artefacts that implement and verify them.

| Proposal FR | Use cases | User stories | Collections |
|-------------|-----------|--------------|-------------|
| Registration with name, employee ID, department, role | UC-01 | US-001 | `users` |
| Secure login/logout with hashed credentials | UC-02, UC-03 | US-002, US-003 | `users`, `refreshTokens` |
| Role-based access control | UC-02, UC-19 | US-002, US-013, US-028 | `users`, `auditLogs` |
| Temporary lockout after repeated failures | UC-02 (5a) | US-004 | `users` |
| Session expiry and re-authentication | UC-03, UC-06 | US-005, US-006 | `refreshTokens` |
| Upload, update and version-control policies | UC-07, UC-08 | US-009, US-011, US-016 | `policies`, `policyVersions` |
| Notify employees of new or updated policies | UC-08 | US-012 | `notifications`, `assignments` |
| View role-relevant policies and acknowledge | UC-09, UC-10 | US-013, US-014 | `policyVersions`, `acknowledgements` |
| Audit log of versions and acknowledgement timestamps | UC-12 | US-015 | `acknowledgements`, `auditLogs` |
| Role-specific training content | UC-14, UC-15 | US-021 | `trainingModules`, `assignments` |
| End-of-module quizzes | UC-16, UC-17 | US-020, US-023, US-024 | `trainingModules`, `quizAttempts` |
| Record completion status and scores | UC-15, UC-16 | US-025 | `quizAttempts`, `assignments` |
| Dashboard of acknowledgement and completion, filterable | UC-19 | US-027, US-028, US-029 | `assignments` |
| Automated reminders | UC-20 | US-030, US-031 | `assignments`, `notifications` |
| Exportable compliance reports (PDF/Excel) | UC-21 | US-032 | `assignments` |
| Incident submission with type, description, attachment | UC-22 | US-035, US-036 | `incidents` |
| Categorisation and default severity | UC-22 | US-037 | `incidents` |
| Immediate notification for high severity | UC-24 | US-038 | `notifications`, `incidents` |
| Admin status tracking; reporter sees own status | UC-23, UC-25 | US-039, US-040 | `incidents` |
| *(New)* Phishing simulation and click measurement | UC-26 – UC-30 | US-042 – US-050 | `phishingTemplates`, `phishingCampaigns`, `simulationEvents` |

---

## 12. Assumptions, Constraints & Risks

### 12.1 Assumptions

- Savikro Enterprises has roughly 20–40 staff across the four departments; the design targets this scale, not thousands.
- Every employee has a work email address or one can be issued for the prototype.
- Warehouse and field staff have access to a shared terminal or a personal smartphone with a browser.
- Policy content is authored by Savikro management; the team supplies the platform and sample content only.
- English is the sole interface language for this release.

### 12.2 Constraints

- One academic semester with a four-person team; scope is bounded accordingly.
- Free-tier hosting and database, so no guaranteed uptime SLA and modest resource limits.
- Email is sent through a sandbox provider, so deliverability testing is limited.
- The prototype is not intended to hold live production data during assessment; seed data is used.

### 12.3 Risks

| ID | Risk | Impact | Likelihood | Mitigation |
|----|------|:------:|:----------:|------------|
| R-01 | M6 is attempted before M1–M5 are stable, jeopardising the assessed MVP | High | Medium | M6 is gated behind a fully working, demo-ready MVP; it lives on a separate branch and only merges if §9.5 is fully met. |
| R-02 | The phishing module is perceived as unethical or is misconfigured | High | Low | The §9.3 constraints are implemented as validation and code structure, not as documentation; ETH-01 is verified by an automated test asserting the landing page contains no input elements. |
| R-03 | Denormalised fields on `assignments` drift from their source | Medium | Medium | Updates are confined to the service layer; a reconciliation script runs in CI against seed data. |
| R-04 | Scope creep from stakeholder feature requests | Medium | High | §2.2 exclusions are agreed in writing; new requests go to a backlog for a future release. |
| R-05 | File upload becomes a malware vector | High | Low | NFR-SEC-05: magic-byte validation, extension allow-list, size cap, storage outside the web root, no execution path. |
| R-06 | Employees perceive the platform as surveillance and disengage | Medium | Medium | Framed around compliance evidence rather than monitoring; individual simulation results restricted to Admin (ETH-06); the landing page tone is explicitly non-punitive. |
| R-07 | Free-tier hosting sleeps or throttles during the demo | Medium | Medium | Warm-up before demonstration; a local fallback environment is kept ready. |

---

## 13. Glossary

| Term | Definition |
|------|------------|
| **Assignment** | A materialised obligation linking a user to a policy version or training module, with a due date and status. |
| **Bcrypt** | Adaptive password-hashing function; the cost factor makes brute-force attacks expensive. |
| **JWT** | JSON Web Token — the signed access credential presented on each API call. |
| **Just-in-time training** | Educational content delivered at the moment of a mistake, when receptiveness is highest. |
| **MoSCoW** | Prioritisation scheme: Must, Should, Could, Won't. |
| **RBAC** | Role-Based Access Control — permissions derived from role rather than assigned per user. |
| **Simulation** | An authorised fake phishing email sent internally for measurement and training. |
| **Step-up authentication** | Requiring the password again before a sensitive action, even within a valid session. |
| **Superseded** | The state of a policy version replaced by a newer published revision; retained as evidence but excluded from live compliance. |
| **TTL index** | A MongoDB index that deletes documents automatically once a date field passes. |

---

*End of document — Software Requirements & Design Specification v1.0, Group 14.*
