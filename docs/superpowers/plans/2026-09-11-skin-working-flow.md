# Skin Working Flow Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the backend and independent reviews; execute this approved integration without repeated user checkpoints.

**Goal:** Deliver an installed private UI/API path for creating, generating, persisting and owner-reviewing Venus assessments.

**Architecture:** Preserve the newer report code, use a separate Prisma assessment entity, injected service and authenticated Express router. Photos remain in their existing storage and only authorized white-light selections are normalized for OpenAI. No provider activation, production migration or deployment is implicit in writing the implementation.

**Tech Stack:** Existing Express, Prisma/Postgres, native fetch, vanilla ES2018 UI and node:test.

- [ ] Reconcile recent tracked base and related uncommitted report files into the working branch, preserving both source checkouts and excluding unrelated data.
- [ ] Add persistent draft/generation/approval service and offline regression tests. Immutable attempts retain original input and draft; editing creates a superseding version. A conditional attempt token prevents late or duplicate generation from publishing. Expired attempts are failed without automatic retry.
- [ ] Add Prisma model/migration files without applying production migrations. Store metadata/consent/output, not base64 photos or provider keys.
- [ ] Add private Express routes with current account checks and same-origin writes; protect every route and exclude drafts from public report endpoints. Load photos only by IDs belonging to the record through bounded fixed-storage fetch.
- [ ] Add `public/skin-advisor.html`, `.css`, `.js` and an expediente link. Support selected photos, zone/orientation confirmation, consent, questionnaire, saved history, generation, error states, reviewed corrections and owner-only approval. Preserve existing report gallery. Use DOM text and no modern syntax beyond Chrome70 parsing.
- [ ] Verify route/service tests with injected storage/provider, existing38tests, Prisma syntax and ES2018 parse. Check real UI locally using fictional data, clearly separate from a live-provider test.
- [ ] Review specification then quality, fix issues, document activation prerequisites and actual test evidence. Never claim live availability without deployment and a real authorized test.

## HTTP contract

Namespace `/api/skin-advisor`, JSON `{success:true,data}` or sanitized `{success:false,error}`. GET `/config` returns activation/key readiness, `canApprove`, consent text/version and authenticated user ID. GET `/records/:recordId` returns minimal record data, owned photo metadata and assessments. POST `/records/:recordId/assessments` creates a draft with selected `photos:[{id,zone,orientation,lateralityResolved}]`, patient/answers and consent version/accepted; POST `/assessments/:id/generate` with `{version}` runs one attempt. POST `/assessments/:id/approve` with `{version,correctedAssessment,reviewNotes}` checks owner and saves reviewed result. GET `/assessments/:id` returns saved state. No public endpoint.

## Checks

Verify unauthenticated, other-admin approval, stale versions, foreign photos, missing consent, disabled config, double generation, expired attempts, late completion, failed provider, malformed image, unsafe URL/redirect, invalid corrections and role revocation. The normal case persists a private draft across service instances and records owner approval. Schema changes are additive. No catalog procedure options until approved versioned protocols are supplied.
