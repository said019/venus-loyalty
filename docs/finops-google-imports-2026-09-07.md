# Selective Google SDK loading

The installed googleapis version and lockfile are unchanged. Six integrations
now share a small facade loading only Calendar, Drive, OAuth2 and Wallet Objects.
Authentication classes are the exact same SDK constructors; the factory receiver
retains the default `_options` object. No application uses global Google options
or runtime discovery. Future integrations must explicitly add their API here.

No changes to credentials, scopes, token persistence, API parameters, scheduling,
files, images, migrations, database queries, payments or delivery rules.
The pre-existing Drive service-account quota error is not fixed by this change.

Validation: 140 unit/contract tests pass, including 12 intercepted requests for
Calendar/Drive/OAuth2/Wallet (promise and callback styles), auth URL/constructor
equivalence and API version/required-field errors. Fresh-process test proves no
unrelated API catalogue is loaded. Scheduler fixture preserves 16 callbacks,
96 calendar cases and the two disabled-feature guards. Production is never
started with real credentials during tests.

Three independent local import runs before: RSS 171.75–172.46 MB, used heap
63.93 MB. Scoped imports: RSS 65.37–65.65 MB, used heap 7.53 MB. This is an isolated
import benchmark, not the total application footprint or Railway billing savings.

Publication gate: CI, unchanged production main, read-only database aggregates,
deployment identity and public health. Compare post-deploy counts/hashes with
normal concurrent activity explained. PostgreSQL is not redeployed. Rollback is
the previous application artifact 10689804-7809-470b-bc54-5c487a221db5, not a data
rollback. Measure a full post-deploy window before declaring stable savings.
