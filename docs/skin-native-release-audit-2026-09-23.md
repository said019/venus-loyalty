# Native skin report release audit

## Verified release

- Web commit: `ef26a970c5bb6f1bf22b4b8ac454f65dac1a1fb0`.
- Railway deployment: `8cb45eaf-d7bd-41ff-91f7-388cd019cdae`, SUCCESS.
- Production HTML, workspace CSS, advisor JS, report JS and report-data JS matched
  the local release byte-for-byte after deployment.
- Unauthenticated preview POST returned 401 and `Cache-Control: private, no-store`.
- `node --test tests/skin-*.test.js`: 91 passing tests.
- Workspace integration test passed with the synthetic demo, without patient data
  or a provider call.
- Desktop report and 390px mobile layout inspected; no horizontal overflow at 390px.
- Red display contrast loaded as a 960px JPEG in the demo browser.

## Android evidence collected after deployment

- Repository manifest declares package `mx.venus.mojileds`, version 0.9.0, code 11.
- `sh tools/moji-capture/android/test.sh`: 70 safety checks and 209 simulated
  sequence checks passed.
- `node tools/moji-capture/android/tests/native-safety.mjs`: structural guards passed.
- `adb devices -l` returned no attached devices. Installed APK version, physical
  capture, upload and the final report on the actual WebView remain UNVERIFIED.
- The Android README describes historical 0.8.2 white-only behavior. It is not
  proof of the current installed version or of multi-light physical validation.

## Functional boundaries

The new report reads immutable selected originals and separately labels nearby
complementary captures. Temporal proximity is not proof of a shared capture session.
Display filters are deterministic image transformations, not manufacturer maps:
red channel contrast, normalized grayscale with a brown tint, and mild sharpening.
They do not quantify melanin, hemoglobin, hydration, collagen, severity or UV damage.
They never replace originals or become inputs to the AI assessment.

The saved manufacturer report establishes available output modalities, not access
to its algorithms or proof that Venus reproduces those measurements.

## Open acceptance gates

1. Connect the analyzer and read device identity and installed APK version.
2. Verify the actual Android navigation and report rendering, including originals
   and auxiliary views, using an authorized session without fabricating login.
3. Verify capture-to-record persistence and interrupted/partial upload behavior on
   the physical device. Do not use a patient to test unvalidated illumination.
4. Confirm operator supervision and documented exposure precautions before any
   physical multi-light capture. Host tests do not establish optical safety.
5. Confirm the delivered visual report satisfies the requested richer experience.
   Exact proprietary algorithm equivalence is not established by this release.

The full delivery goal is not complete while these gates remain open.
