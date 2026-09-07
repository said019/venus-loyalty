# Venus scheduler FinOps — 2026-09-06

Scope: node-cron 4.2.1 -> 4.6.0 exact. Production Nixpacks already uses Node24 and `node server.js`; no runtime-major, environment, region, replica, business callback, schedule expression, database or migration change.

## Evidence and safeguards

- Production 24h RAM average 281.42 MB, last 251.20 MB, max 585.19 MB (2026-09-07 03:49 UTC).
- Database approximately 18.18 MB, 56 tables. Record read-only fingerprints/counts again before/after deployment; these are not backups. Never roll back data for this dependency-only release.
- Isolated Node24.20.0 benchmark: old 7,166 formatter constructions, peak118.19 MiB,596.39ms CPU; new4 constructions, peak72.00 MiB,61.33ms CPU. Synthetic harness cost is included; this is NOT a dollar forecast or sustained production measurement.
- All16 actual scheduler callbacks are registered in a VM with allowlisted synthetic imports. Empty fixtures execute without writes/messages. Review and re-engagement guards remain disabled. Positive synthetic Drive retry and single-appointment confirmation pass, as do confirmed-appointment and DB-error auto-cancellation guards. No real customer notifications are sent by tests.
-96 calendar cases cover midnight, leap year, year boundaries and Monday scheduling;960 next-run queries. Fifteen nonweekly schedules have identical output hashes before/after. The old4.2.1 weekly next-date calculator returns dates in2029 instead of the next Monday in several cases;4.6.0 matches an independent minute-by-minute oracle for all96 cases. This is an observed scheduling bug correction, not identical old/new next-run output for that task. Callback and configured Monday07:00 Mexico expression remain unchanged.
-135 existing unit tests pass on Node24.20.0. A preexisting test failed because its injected May2026 date did not freeze the real clock used by todayMexicoStr(). The fixture now freezes the ambient day without changing production booking logic. The existing mismatch between the utility's purity comment and its ambient-clock dependency remains documented; this PR does not refactor it.
-New CI installs from the lockfile, runs the full135-test suite and scheduler regression on Node24. No test disabled or assertion weakened. Unrelated native-library lock metadata retained.

## Known preexisting Drive incident — HOLD, not fixed by this PR

At2026-09-07 04:00 UTC the existing production deployment emitted10 Drive retry errors: service accounts have no storage quota. Four inspected Drive-ID columns contain no references;11 intake forms remain in the database. No claim is made that all11 were signed/pending uploads, or that any remote file was deleted. The configured root folder alone does not prove upload authorization. Resolving the account/shared-drive/OAuth configuration is a separate access decision; do not repurpose Calendar credentials, change accounts, remove documents or disable retries as part of this optimization.

## Release gate and rollback

Base commit f5fe128adda6ea4209db2aac4c27f914299a5285; previous app deployment b66b035c-d744-4437-a3f9-cd2f83df6b0f; PostgreSQL deployment1f027ac8-4a56-4459-b97f-390ee44bf23a must stay unchanged. Merge only after CI passes, then require SUCCESS/stopped=false, scheduler startup, public pages200 and protected APIs401, and reconcile all56 tables. Natural tasks remain to be observed over their actual schedules. No claim of full operational PASS while Drive upload remains unresolved. Roll back this dependency change through the normal source workflow if new regressions occur. Measure memory over an equivalent traffic cycle before declaring savings.

Official release: https://github.com/node-cron/node-cron/releases/tag/v4.6.0
