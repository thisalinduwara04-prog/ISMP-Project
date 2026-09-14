# M3 Traceability — Training & Awareness

Maps each automated test to the requirement it verifies, for the traceability
section of the project report. Companion to `traceability-m2.md`.

- **Suite:** `backend/tests/` — Jest + Supertest against an in-memory MongoDB
  **replica set** (the publish workflow uses a transaction; a standalone would
  silently exercise the fallback path instead of the production one).
- **Run:** `npm test` · **Coverage:** `npm run test:cov`
- **Result at time of writing:** 204 tests, 14 suites, all passing — of which
  129 are M3's, across eight files.

## Coverage — M3 service layer (NFR target: 60% statements)

| File | Statements | Branches | Functions |
|------|-----------:|---------:|----------:|
| `training.service.js` | 92.9% | 67.1% | 92.7% |
| `attempt.service.js` | 95.0% | 81.3% | 94.5% |
| `assignment.service.js` (M3's `updateProgress`) | 98.3% | 60.9% | 100% |
| `training.controller.js` | 100% | 100% | 100% |

Services and controllers are reported **separately** because the requirement is
about business logic: a suite reaching 60% by exercising thin controllers would
satisfy the number and miss the point. `jest.config.js` enforces the threshold
per file, so the build fails if it regresses.

## Test files

| File | Task | What it covers |
|---|---|---|
| `training.projection.test.js` | T1 | The learner/admin projections, and stable nanoid identity |
| `training.attempt.model.test.js` | T1 | Attempt immutability at the model layer |
| `training.authoring.test.js` | T2 | Authoring, quiz validation, bounds, editing, deletion |
| `training.publish.test.js` | T3 | Publication and assignment fan-out |
| `training.progress.test.js` | T4 | Per-item progress and the quiz gate |
| `training.quiz.test.js` | T5 | The attempt lifecycle, grading and the clock |
| `training.retake.test.js` | T6 | Retakes, limits, best score and the admin reset |
| `training.seed.test.js` | T8 | The demo data the seed script produces |
| `training.nfr.test.js` | T9 | The table-driven NFR verification below |

## Requirement → test

### AD-3 — the answer key never reaches the client

| Requirement | Test file | Test |
|---|---|---|
| Learner projection strips `isCorrect` and `explanation` at any depth | `training.projection.test.js` | *contains no isCorrect key anywhere in the object tree* (+ the `explanation` twin) |
| The projection removes the key **and nothing else** | `training.projection.test.js` | *differs from the learner view ONLY in the answer key* |
| Every employee-facing route, deep-searched | `training.nfr.test.js` | *finds no key named isCorrect at any depth, on any route* — table-driven over all 7 routes |
| The manifest cannot fall behind the router | `training.nfr.test.js` | *accounts for every route in the module, admin or employee* — asserts the router's own route list equals admin + employee manifests |
| The right answer's **text** is absent too, not just the flag | `training.nfr.test.js` | *never sends the text of a correct option the learner did not choose* |
| Admin view retains the key (one route, ADMIN-guarded) | `training.authoring.test.js` | *gives an admin the answer key* |

**The one documented exception.** `explanation` is part of the result payload
after a pass or the final permitted attempt (US-023, US-024). It is tested as a
decision rather than left as a gap: `training.nfr.test.js` → *appears only after
a pass, and never before*.

### NFR-SEC-03 — rules enforced in the API, not the interface

| Requirement | Test file | Test |
|---|---|---|
| Every ADMIN-guarded route refuses a valid EMPLOYEE and MANAGER token | `training.nfr.test.js` | Table-driven over the 5-route admin manifest × 2 roles (10 assertions) |
| The admin manifest matches the router's guarded routes exactly | `training.nfr.test.js` | *claims every ADMIN-guarded route the router declares* |
| Unauthenticated requests refused | `training.nfr.test.js` | *refuses an unauthenticated request outright* |
| Audience scoping: WAREHOUSE requesting a SALES-only module by id → 403 | `training.nfr.test.js` | *refuses a WAREHOUSE employee a SALES-only module by direct id, with 403* |
| Audience scoping on the module read | `training.authoring.test.js` | *refuses an employee a module aimed at another department, with 403 not 404* |
| Quiz gating is server-side | `training.progress.test.js` | *refuses an attempt started before the content is finished, naming what is left* |
| Progress cannot be faked by the client | `training.progress.test.js` | *rejects a client-supplied percentComplete rather than trusting it* · *refuses an itemId that is not part of the module* |
| Attempt ownership | `training.quiz.test.js` | *refuses to let one employee save answers on another employee attempt* |

### NFR-SEC-04 — validation at the boundary

| Requirement | Test file | Test |
|---|---|---|
| Unknown keys rejected, not dropped | `training.authoring.test.js` | *rejects a client-supplied status rather than ignoring it* |
| Question-type correctness rules | `training.authoring.test.js` | *refuses a SINGLE_CHOICE question with two correct options* · *…MULTI_CHOICE with no correct option* · *…TRUE_FALSE with three options* |
| Embedding bounds (10 items, 15 questions) | `training.authoring.test.js` | *refuses an eleventh content item* · *refuses a sixteenth question* |

### UC-13 / US-018–US-020 — authoring

| Requirement | Test file | Test |
|---|---|---|
| A module is created as a DRAFT with a generated code | `training.authoring.test.js` | *creates it as a DRAFT with a generated code…* |
| Reordering does not break progress records | `training.authoring.test.js` | *keeps itemIds when the admin reorders content* |
| Editing a question keeps its identity | `training.authoring.test.js` | *keeps question and option ids through an edit of the question text* |
| Editing a live quiz warns rather than blocks | `training.authoring.test.js` | *warns rather than refuses when a published quiz is edited with attempts on record* |

### UC-14 / US-021 — publication and fan-out

| Requirement | Test file | Test |
|---|---|---|
| Republishing to an overlapping audience creates no duplicates | `training.publish.test.js` | *assigns 10, then 15 after five more people join the audience — not 25* |
| In-flight progress survives a republish | `training.publish.test.js` | *leaves the progress of someone who had already started untouched* |
| Assignments carry denormalised fields and empty progress | `training.publish.test.js` | *creates PENDING assignments with denormalised fields and empty progress* |
| Publication refuses an empty quiz, empty content, empty audience | `training.publish.test.js` | *what publication refuses* (4 tests) |
| `TRAINING_PUBLISHED` is audited | `training.publish.test.js` | *records a TRAINING_PUBLISHED audit entry* |

### UC-15 / US-022 — consumption and progress

| Requirement | Test file | Test |
|---|---|---|
| Progress is per content item and idempotent | `training.progress.test.js` | *is idempotent: marking the same item twice leaves one entry* |
| PENDING → IN_PROGRESS with `startedAt` on the first item | `training.progress.test.js` | *moves the assignment from PENDING to IN_PROGRESS and sets startedAt* |
| Progress lives server-side and resumes on another device | `training.progress.test.js` | *resumes where it stopped, on a fresh request with no client state* |
| The quiz unlocks at 100% | `training.progress.test.js` | *unlocks the quiz once every item is complete* |

### UC-16 / US-020, US-023 — the attempt lifecycle

| Requirement | Test file | Test |
|---|---|---|
| **US-020 acceptance:** 60% fails, assignment stays open, attempts shown | `training.quiz.test.js` | *scores 60%, fails, and leaves the assignment open with attempts remaining* |
| **US-020 acceptance:** 80% passes, assignment COMPLETED with timestamp | `training.quiz.test.js` | *scores 80%, passes, and completes the assignment with a timestamp* |
| MULTI_CHOICE requires an exact set match | `training.quiz.test.js` | *requires an exact set match on a MULTI_CHOICE question* |
| `passMarkAtAttempt` is used, not the module's current mark | `training.quiz.test.js` | *grades against passMarkAtAttempt, not the module pass mark of today* |
| Unanswered questions refused, by number | `training.quiz.test.js` | *refuses to submit with unanswered questions, naming their numbers* |
| Per-question marks reveal nothing about the right answer | `training.quiz.test.js` | *marks each question right or wrong without naming the correct option* |
| Attempts are immutable after submission | `training.quiz.test.js`, `training.attempt.model.test.js` | *refuses a second submission…*, *refuses to save answers onto a submitted attempt*, *rejects a query-level update of a submitted attempt* |
| A session expiring mid-attempt leaves it IN_PROGRESS and resumes | `training.quiz.test.js` | *hands back the same attempt rather than opening a second one* |
| The clock is the server's | `training.quiz.test.js` | *counts the remaining time down from the server, not from the client* |
| Expiry auto-submits, unanswered scoring zero | `training.quiz.test.js` | *auto-submits an attempt whose time ran out, scoring the unanswered as zero* |

### UC-17 / US-024 — retakes and limits

| Requirement | Test file | Test |
|---|---|---|
| The fourth attempt at a 3-attempt quiz is refused, naming the way out | `training.retake.test.js` | *refuses the fourth attempt at a three-attempt quiz, and says who can reset it* |
| An abandoned IN_PROGRESS attempt does not count | `training.retake.test.js` | *does not count an attempt abandoned in progress* |
| Only the best score counts | `training.retake.test.js` | *reports the best attempt, not the most recent one* · *keeps the failed attempt in the record and marks the best one* |
| Explanations withheld until a pass or the final attempt | `training.retake.test.js` | *are withheld on a failure that still has retakes left* · *are revealed on the final permitted attempt, even when it fails* |
| Admin reset clears the count without deleting history | `training.retake.test.js` | *gives the attempts back without deleting the history* · *counts only the attempts made since the reset* |
| The reset records who authorised it | `training.retake.test.js` | *records who authorised it* |
| An employee cannot reset their own | `training.retake.test.js` | *refuses an employee trying to reset their own attempts* |

### NFR-MNT-01/02 — maintainability

| Requirement | Evidence |
|---|---|
| M3 never touches the `assignments` model directly | No `require('../../models/Assignment')` exists anywhere under `src/modules/training/`; every write goes through `assignment.service.js` (`fanOut`, `complete`, `updateProgress`, `removeForItems`) |
| The audience filter is not duplicated | `training.service.js` imports `buildAudienceFilter` / `matchesAudience` from `src/utils/audience.js`, the same helper M2 uses |
| One projection, applied everywhere | `toLearnerView` is defined once in `training.service.js`; the route-manifest test above is what proves no route bypasses it |
| Coverage does not regress | Per-file thresholds in `jest.config.js` |

### Deliverables 4 and 6, risk R-07 — demo data

| Requirement | Test file | Test |
|---|---|---|
| Two published modules: walkthrough + quiz, video + quiz | `training.seed.test.js` | *includes a walkthrough with a quiz and a video with a quiz* |
| All three question types, 70% pass mark, 3 attempts | `training.seed.test.js` | *covers all three question types…*, *creates two published modules with real content and a quiz each* |
| One module targeted at SALES only | `training.seed.test.js` | *targets one module at SALES only, so audience filtering is visible* |
| Assignments in COMPLETED / PENDING / OVERDUE / partial states | `training.seed.test.js` | *leaves assignments in a spread of states for the dashboard* · *leaves somebody part-way through…* |
| A failure followed by a passing retake | `training.seed.test.js` | *records a failure followed by a passing retake* |
| Idempotent, safe to re-run | `training.seed.test.js` | *is safe to run twice, leaving the same data rather than doubling it* |

## Not verified by the automated suite

Stated plainly, because a traceability matrix that implies more than it proves
is worse than one with gaps in it.

| Requirement | Status | How it is verified |
|---|---|---|
| NFR-USE-03 · Lighthouse accessibility ≥ 90 | **Not run** | Needs a browser against the running app. Method and checklist: `docs/m3-mobile-checklist.md` |
| NFR-PERF-01 · page load < 2s on throttled 4G | **Not run** | Same — DevTools network throttling, checklist as above |
| NFR-USE-01/02 · usable at 360px, thumb-reachable actions | **Partly** | Implemented (one question per screen below 700px, sticky action bar, full-width options); confirmed by hand against the checklist, not by an automated test |
| US-025 · notifications on assignment | **Not implemented** | Deliberate: the notification contract is still open. Marked `TODO` in `training.service.js` publish, mirroring the same decision in M2-T4 |
