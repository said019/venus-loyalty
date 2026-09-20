# Device verification: independent capture is not ready

Read-only ADB inspection of 192.168.100.13:5555, 2026-09-20.
No lights enabled, new photos taken, records changed or APK installed.

## Confirmed

- RK3399-S9932; original com.yiyuan.skin 1.7.7 previously verified.
- mx.venus.mojileds installed versionName 0.8.1, versionCode 9.
- Camera permission granted; camera service records Venus opening camera 0.
- No active camera client at inspection. Device exposes Camera1 HAL; API2 is
  not directly supported. This is capability evidence, not a new capture test.
- Six previously collected empty-device JPEGs decode at 2448 x 3264.
- Original application labels correspond to GPIO order 0,4,5,2,1,3,0,0,
  supported by static code and the earlier application write log.

## Important implementation gap

MainActivity never constructs CaptureSequence or CaptureStore. The published
APK only calls WhitePulse.start. The sequence/storage unit tests exercise
fakes, not native camera/LED adapters. Do not describe them as working
multi-light acquisition or as physical safety certification.

The original app associates a JPEG callback with P[S], then schedules the next
mode. Its save task rotates and recompresses the JPEG. The source uses the
same filename for repeated image (white) captures; six exported files are not
eight independently preserved originals, and contain no proven shutter timing.

## Required implementation and acceptance checks

1. Connect Camera1 JPEG capture to request, record, session and mode identity.
2. Keep camera ownership exclusive; stop WebView camera before native capture.
3. Implement a serialized light adapter with independently scheduled OFF,
   write failure lockout, lifecycle cancellation and physically checked OFF.
4. Preserve each native JPEG and metadata before acknowledging a saved shot;
   distinguish partial sets and prevent duplicate uploads on retry.
5. On an empty device with an operator present, validate white-only capture,
   resolution, orientation, cancellation, camera error and interrupted save.
6. Confirm optical model from physical label; obtain optical limits/precautions
   applicable to that exact device before enabling other illumination modes.

The Android board identifier does not establish optical hardware identity.
GPIO logs cannot measure wavelength, irradiance, polarization or eye exposure.
No new automatic multi-light functionality was published by this inspection.

## Follow-up implementation (unpublished)

- Added phase deadlines for light acknowledgement, settling, JPEG callback and
  save acknowledgement. Timeout requests OFF and locks out further acquisition.
- Tested cancellation in each phase, stale callbacks/deadlines, invalid JPEG
  markers and missing acknowledgements: 172 simulated sequence checks pass.
- Existing WhitePulse and policy suite: 65 checks pass.
- Added NativeStillCamera Camera1 adapter for highest advertised still-image
  resolution, configurable quarter-turn rotation, shutter timestamp, camera
  error/timeout handling and release. This adapter has not run on the device
  and is not wired to MainActivity. Compilation is not physical validation.
- Physical independent OFF watchdog and optical validation remain separate
  requirements; sequence deadlines do not establish safe exposure limits.

## Follow-up: missing visible light report

- ADB still lists the device online and Venus MainActivity resumed. Filtered
  recent logs only showed blocked WebView default video-poster messages; they
  do not establish why a light was not seen. No new light command was sent.
- A valid but rejected white command now returns a negative acknowledgement
  to the trusted foreground document instead of falling through to navigation.
  Gesture, main-frame and document checks remain mandatory. Rejection reasons
  are logged without patient data or credentials. This is not installed yet.
- NativeStillCamera now requires a nonempty initial preview callback before
  accepting a still capture, and waits for preview readiness again after each
  JPEG. Closing invalidates late callbacks and releases the preview surface
  even if camera release throws. These changes compile but are not yet tested
  against the physical Camera1 HAL. Existing pure-Java checks do not cover it.
- Build, APK signature validation and git diff --check passed. No publication
  or installation occurred. The standalone multi-mode acceptance gap remains.

## Camera-only probe, 16:08 device time

- Camera service had no active clients before or after the probe.
- A test-only dex launched via app_process aborted in Camera.open with JNI
  `java_string == null`, before a camera CONNECT event. The shell process has
  no application package context. This is a harness failure, not evidence of
  a defective camera or successful JPEG capture. Do not rerun that harness.
- No GPIO code is in the probe; no lights enabled or images persisted/uploaded.
- Removed the temporary dex from /data/local/tmp after the process terminated.
- Next native-camera acceptance test must run with a real application context
  and camera permission, preferably a separate diagnostic package so it does
  not replace the installed Venus app or alter its session and records.

## Native camera in diagnostic APK: physical PASS, 16:10 device time

- Built and temporarily installed separate mx.venus.camera.diagnostic package
  with CAMERA permission only. No GPIO, INTERNET permission or image writes.
- The production NativeStillCamera source (not a fake) captured two JPEGs:
  shot 1: 3476834 bytes, shutter 1789938641881;
  shot 2: 3116241 bytes, shutter 1789938643425.
- Configured still size 4224x3136, rotation 90; BitmapFactory bounds decoded
  both as 3136x4224. This confirms dimensions and applied rotation, not visual
  framing, color accuracy or true optical resolving power.
- Camera service recorded CONNECT at 16:10:39 and DISCONNECT at 16:10:44,
  then Active Camera Clients: []. No light command was sent.
- Two-shot success proves preview restart/readiness on this HAL. It does not
  prove sequence integration, storage/upload, lifecycle cancellation or light
  synchronization. Those acceptance requirements remain open.
- Diagnostic package uninstalled successfully after test; installed Venus
  package and production records were not replaced or modified.

## Eight-shot native acquisition/storage dry run: 16:12-16:13 device time

- Separate diagnostic APK connected production CaptureSequence,
  NativeStillCamera and CaptureStore; light/off adapters were deliberate no-ops.
  The validation flag was true ONLY inside this test-only simulated adapter.
- All eight requests returned native JPEGs at decoded 3136x4224. Each was
  saved under app-private diagnostic-only/no-client, read back byte-for-byte,
  and its mode/request metadata verified before saved acknowledgement.
- Stored sizes in sequence: 3539211, 3309408, 3304624, 3303095, 3307450,
  3337111, 3076935, 3101352 bytes. Final state COMPLETE logged at 16:13:14.
- Repeated white indices 0,6,7 persisted separately. Mode names in this run
  are SIMULATED labels, not optical captures. No LEDs were activated.
- No uploads or client records involved. Uninstalling the diagnostic package
  removes its temporary private images; these must never be used in a report.
- This covers native JPEG sequencing and atomic storage on Android 8.1. It
  does not cover light control, visual quality, optical safety, authenticated
  uploads or the production UI integration, all of which remain incomplete.

## Native lifecycle cancellation, 16:15 and 16:16

- Diagnostic Activity paused once before readiness (shots=0), then in a
  separate run immediately after takePicture was requested (shots=1).
- Both runs logged CANCELLED and camera service DISCONNECT. No SHOT/SAVED
  callbacks were logged for the pending request in the second run.
- Active Camera Clients was [] after each run. Diagnostic APK uninstalled
  after each test. No light controls or production records were involved.
- Paused flag now suppresses queued diagnostic captures/saves, and cleanup
  cancels the state machine as well as releasing Camera1. Production lifecycle
  integration must reuse these guarantees; this test does not establish that
  the installed Venus WebView already implements the native sequence.

## Candidate 0.8.2: UI and native white JPEG integration

- MainActivity now connects gesture-authorized still requests to
  NativeWhiteCapture/NativeStillCamera. Only the previously mapped WHITE port
  is present. WebView releases its stream, receives the original JPEG through
  a no-store same-origin intercepted response, uploads it, and restarts preview.
- NativeWhiteCapture tested on the physical device with real Camera1 but a
  simulated WhitePulse port: 16:28:33 PASS, JPEG 3136x4224, 3514197 bytes.
  Camera service confirms disconnect; diagnostic package uninstalled. This is
  NOT a physical illuminated capture or full WebView-to-Android gesture test.
- Taste-based capture UI refreshed with official Venus icon, olive header,
  larger camera surface, selected-client strip, collection count and collapsible
  legacy import. Screenshots inspected at 390/768/1280; no horizontal overflow.
- Playwright mock integration verifies original JPEG bytes reach upload
  unchanged and preview restarts. API writes were mocked, not production.
- 70 safety checks, 209 simulated sequence/storage checks, eight Node tests,
  APK build/signature validation and git diff --check passed.
- Candidate version 0.8.2/code10 built locally, not published or installed as
  the user's Venus app. Multi-light acquisition, optical validation and full
  multimodal reporting remain incomplete. Do not claim readiness for clients.
