# M2 Traceability — Policy Management

Maps each automated test to the requirement it verifies, for the traceability
section of the project report.

- **Suite:** `backend/tests/` — Jest + Supertest against an in-memory MongoDB
  **replica set** (a standalone would not support the transaction the publish
  workflow uses, so the suite would silently exercise the fallback path instead
  of the production one).
- **Run:** `npm test` · **Coverage:** `npm run test:cov`
- **Result at time of writing:** 75 tests, 5 suites, all passing.

## Coverage — service layer (NFR target: 60% statements)

| File | Statements | Branches | Functions |
|------|-----------:|---------:|----------:|
| `policy.service.js` | 87.8% | 64.5% | 78.8% |
| `version.service.js` | 86.7% | 69.8% | 85.7% |
| `acknowledgement.service.js` | 96.9% | 72.1% | 100% |
| `attachment.service.js` | 93.5% | 40.0% | 100% |
| `policy.controller.js` | 98.2% | 100% | 100% |

Services and controllers are reported separately because the requirement is
about business logic: a suite that reached 60% by exercising thin controllers
would satisfy the number and miss the point. `jest.config.js` enforces the
threshold on `src/modules/policy/` so the build fails if it regresses.

## Requirement → test

### Security (NFR-SEC-03, NFR-SEC-04, NFR-SEC-06)

| Requirement | Test file | Test |
|---|---|---|
| NFR-SEC-03 · every ADMIN route refuses a low-privilege token | `policy.rbac.test.js` | Table-driven over a 10-route manifest × EMPLOYEE and MANAGER tokens (20 assertions) |
| NFR-SEC-03 · unauthenticated requests refused | `policy.rbac.test.js` | *refuses an unauthenticated request* |
| NFR-SEC-03 · audience enforced by the API, not the UI | `policy.audience.test.js` | *returns a SALES-only version to a warehouse employee as 403, not 404* |
| NFR-SEC-04 · Zod at the boundary, unknown keys rejected | `policy.publish.test.js` | *rejects unknown keys rather than dropping them* |
| NFR-SEC-04 · malformed input surfaces as 400 | `policy.lifecycle.test.js` | *returns 400 for a malformed id rather than a cast error* |
| NFR-SEC-05 · uploads validated by content, not by name | `policy.lifecycle.test.js` | *rejects an executable renamed to .pdf with 415* |
| NFR-SEC-06 · denied access is audited | `policy.audience.test.js` | *audits the refused read rather than only refusing it* |

### Use cases and user stories

| Requirement | Test file | Test |
|---|---|---|
| UC-07 / US-009 · author a policy and its first version | `policy.publish.test.js` | *requires a change note from version 2 onward* (covers v1 creation) |
| UC-08 · one draft at a time | `policy.publish.test.js` | *refuses a second concurrent draft and names the existing one* |
| UC-08 · published versions are immutable | `policy.publish.test.js` | *refuses to edit a published version* |
| UC-08 · publishing to nobody is an error | `policy.publish.test.js` | *refuses to publish to an audience matching nobody* |
| **US-011** · full acceptance criterion | `policy.publish.test.js` | *supersedes v1, retains its 12 acknowledgements, and assigns 12 people to v2* |
| UC-09 / US-013 · see only what applies to me | `policy.audience.test.js` | *treats empty target arrays as everyone*; *requires BOTH role and department to match* |
| UC-10 / US-014 · acknowledgement recorded | `policy.acknowledgement.test.js` | *records the acknowledgement and closes the assignment* |
| UC-10 6a · idempotent submission | `policy.acknowledgement.test.js` | *is idempotent…*; *survives two concurrent submissions with only one document written* |
| UC-10 5a · superseded mid-read | `policy.acknowledgement.test.js` | *returns 409 when the version has been superseded* |
| UC-10 5b · archived mid-read | `policy.acknowledgement.test.js` | *returns 410 when the policy has been withdrawn* |
| UC-10 · assignment required | `policy.acknowledgement.test.js` | *returns 403 when the caller holds no assignment* |
| UC-12 / US-015 · audit trail per version | `policy.lifecycle.test.js` | *reports both who acknowledged and who has not*; *records that the evidence was inspected* |
| US-016 · signed PDF alongside the text | `policy.lifecycle.test.js` | *accepts a genuine PDF and stores it under a generated name* |
| UC-11 / US-017 · archive without deleting | `policy.lifecycle.test.js` | *closes open assignments and keeps the evidence*; *does not resurrect assignments on restore* |

### Business rules and architectural decisions

| Requirement | Test file | Test |
|---|---|---|
| **BR-01** · an acknowledgement is immutable | `policy.acknowledgement.test.js` | *exposes no update or delete route*; *rejects an update at the model layer*; *rejects a delete at the model layer* |
| **BR-02** · publishing retains prior evidence | `policy.acknowledgement.test.js` | *keeps acknowledgements against a superseded version* |
| §7.6 · exactly one PUBLISHED version per policy | `policy.publish.test.js` | *is impossible to have two PUBLISHED versions of one policy* — asserts the **database** rejects it with E11000, not the service |
| §7.16 · unique policy code | `policy.publish.test.js` | *rejects a duplicate policy code with 409* |
| AD-2 · assignments are a materialised ledger | `policy.publish.test.js` | fan-out counts asserted against the `assignments` collection |
| NFR-MNT-01 · no cross-module model access | Architecture review — `policy.service.js` and `version.service.js` import `assignment.service`, never the `Assignment` model |

## Deliberate gaps

| Item | Status |
|---|---|
| **US-012** notifications on publication | **Not implemented.** Blocked on the T0 group decision: the notification event payload, and whether dispatch is synchronous or queued. Marked as a TODO in `version.service.js`, holding the target user list ready. |
| T18 full seed dataset | `npm run demo:policies` is a stopgap covering M2 only |
| M3 tests (answer-key leakage, grading) | Training module not implemented yet |

## Supplementary verification scripts

These predate the Jest suite and run against a real MongoDB rather than an
in-memory one. They remain useful as demonstrations because their output is
readable line by line, and because a couple of checks are awkward to express as
unit tests.

| Script | Proves |
|---|---|
| `npm run verify:policies` | 9 checks: the partial unique index, duplicate rejection and insert-only guards, all at the database level |
| `npm run verify:workflow` | 64 checks over the whole HTTP surface, including the `explain()` proof that the audit-trail sort is index-backed |
| `npm run clean:orphans` | Reports ledger rows pointing at deleted policies |
