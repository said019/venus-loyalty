# Moji Capture Flow Implementation Plan

**Goal:** Use the Moji itself to select a client, capture white-light photos, request the private OpenAI assessment and review it, without desktop file uploads.

**Approved flow:** Client → white light and camera → photographs → consent/questions → analysis → exact-owner review. The user approved this flow and requested implementation, so no further design checkpoint is needed.

**Architecture:** Preserve `/captura` as the entry URL. Chrome can capture without automatic lights. A minimal update to the already-authorized Venus Android app opens the same HTTPS page and handles an explicitly tapped, bounded white-light command. The tested GPIO0 write-only behavior is preserved. No UV, UART, root, GPIO reads, background server or manufacturer app replacement. The web page saves photos to the existing record and navigates within the same Venus app to the private advisor, preselecting only this session's saved photo IDs. This separate top-level page has no camera/light privilege and preserves consent/questionnaire/review. No automatic paid generation. The original iframe plan was replaced after review because same-origin frames could access the capture parent.

**Tech Stack:** Existing vanilla ES2018, Express routes, Android API27 Java, existing local Android build tools and signing identity.

## Tasks

- [ ] Native wrapper in `tools/moji-capture/android`: fixed HTTPS origin, main-frame user-gesture-only white command, two-second independent OFF timer, lifecycle/error/manual OFF, camera permission restricted to exact origin, no JavaScript interface exposed to arbitrary frames. Deep link `venusmoji://capture` opens only the fixed capture URL. Keep original Moji installed. Reuse tested write-only port source and local signing key by reference. Compile and verify APK; do not remotely activate hardware.
- [ ] Web integration in `public/captura.html` and `public/moji-capture-flow.js`: explicit capture vs follow-up mode, capture-session photo list, zone confirmation, stale-client/capture guards, bounded image promises, native pulse acknowledgement before capture, stop lights before upload, error states, same-app advisor navigation with no frames. Chrome shows honest instructions and offers opening Venus app, never claims automatic lights.
- [ ] Advisor preselection in `public/skin-advisor.js`: accept session photo IDs from URL, match only against authenticated record photos; confirm actual timestamps and orientation manually, preserve backend consent and white-original confirmations. No raw image URLs or trusted metadata from query.
- [ ] Add `/moji` short alias if needed, and capture response CSP frame restrictions. Never loosen private API origin/account checks.
- [ ] Tests: ES2018 parse, native URL/gesture/lifecycle safety, web stale-session and selected-photo behavior, all existing Skin IA regressions. Independent spec then quality review. Verify browser with synthetic inputs; no patient pictures sent during tests.
- [ ] Publish only reviewed code and signed APK, preserving current production features. Verify live routes and download hash. Installation/hardware validation requires device connection and an observed user-operated test; report separately if unavailable.

## Acceptance and boundaries

No manual file upload is required in the normal flow. Photos are still saved when AI fails, and repeated AI clicks cannot double-generate. Changing client clears the session and closes camera/lights. Web-selected session metadata cannot bypass server ownership or consent validation. A two-second pulse is a write acknowledgement, not proof of physical illumination: the operator confirms white light before consenting to analysis. Native failures block automatic-light capture. One image may be assigned unknown zone rather than inventing laterality. Do not modify the historical diagnostic APK sources or their signing identity. Use the existing feature branch; preserve unrelated `public/admin 2.html`.
