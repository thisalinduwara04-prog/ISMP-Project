# CLAUDE.md

Security Policy Awareness & Compliance Management Platform (ISPM).

## Rules

1. **University project, not a production system.** Optimise for something demonstrable and explainable.
2. **Simplicity wins.** Plain, obvious implementations. No extra abstractions, layers or libraries.
3. **The spec is the source of truth** — [docs/security_training_application_spec.md](docs/security_training_application_spec.md). **Do not deviate.** If it's unclear, ask — don't invent. Read only the section you need (map below).
4. **Reusable components first.** Build UI from shared components in `frontend/src/components/`; check for an existing one before writing new markup.

## Spec map (~1500 lines — read by range, not whole)

| § | Line | Contents |
|---|---|---|
| 2 | 72 | Scope, modules M1–M6, deliverables |
| 3 | 111 | Roles, actors, permission matrix |
| 4 | 161 | Tech stack, layered view, key decisions |
| 5 | 216 | Use cases (detailed from 286) |
| 6 | 531 | User stories, sprint plan |
| 7 | 663 | Collections (users 739, policies 765, versions 783, acks 809, training 829, quizAttempts 882, assignments 909, incidents 948, notifications 1005, refreshTokens 1028, auditLogs 1046), indexes 1135 |
| 8 | 1207 | Endpoints per module, error envelope 1307 |
| 9 | 1336 | M6 phishing sim (optional) + safety constraints |
| 10–13 | 1408 | NFRs, traceability, assumptions/risks, glossary |

## Conventions

- Backend: `routes → middleware → controller → service → model`; thin controllers, logic in services. One folder per feature: `backend/src/modules/<name>/<name>.{routes,controller,service,schemas}.js`.
- Reuse existing `middleware/` (authenticate, authorize, validate, errorHandler, rateLimit), `utils/` (AppError, AppAssert, asyncHandler, cookies), `constants/` (roles, permissions, http, appErrorCode, auditActions).
- Validate every route with Zod at the boundary; return the §8.9 error envelope.
- Frontend: `components/` reusable, `pages/` routed screens. Local state, Tailwind utilities only.
- Never: leak password hashes/tokens/quiz answer keys · update or delete `auditLogs` · accept input on simulated phishing pages · commit `.env` or uploads.

