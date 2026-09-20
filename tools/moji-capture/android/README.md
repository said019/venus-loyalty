# Venus capture wrapper 0.8.2

Fixed entry: `https://venuscosmetologia.com.mx/captura.html?modo=analisis`.
Launcher and `venusmoji://capture` both load that constant; intent data is never used as a URL.
Package `mx.venus.mojileds`, versionCode 10, min26 / target27. Only CAMERA and INTERNET.

This release integrates native Camera1 JPEG capture with the white-light pulse.
The operator confirmed two supervised empty-device white ON/capture/OFF tests.
Other light modes remain disabled. This is not a complete multispectral analyzer
or validation for clinical use. Detailed evidence: `VERIFICATION-20260920.md`.
The original app compatibility check remains; uninstalling it is not supported.

Native JPEGs are served from memory to the trusted capture document, then uploaded
through the existing authenticated photo endpoint. The original bytes are retained.
Camera handoff detaches the WebView ended handler before stopping its stream.
Manual OFF immediately rejects a pending capture without uploading it.

## Build and verification

Run `sh tools/moji-capture/android/build.sh` from the repository root.
The script references the prior local toolchain and signing identity, never copies or generates a key.
Override `MOJI_PREVIOUS_BUILD`, `MOJI_JDK`, or `MOJI_SIGNING_KEY` if necessary.
Generated build/dist files and keys are ignored. No device connection is made by the build.

Host tests exercise exact URL policy, request parsing, main-frame/user-gesture/foreground gating,
timer scheduling, duplicate rejection, OFF, stale timers, and failed writes.
Structural guards inspect Android lifecycle, permissions, and forbidden GPIO operations.
These are not instrumented Android or physical-device tests.

## Bridge and hardware boundary

A direct user-click navigation to `venus-moji://white?request=123` is intercepted only in the
main frame, with a WebView-reported gesture, on the trusted capture document while foreground.
Request IDs are decimal integers 1 through 999999999. No arbitrary JavaScript is accepted.
The fixed result callback is `window.venusMojiLightResult({ok:true,command:'white',request:123})`.
An accepted write is not confirmation of physical illumination. `venus-moji://off` permits
gesture-free OFF from the same trusted main frame. Native top-bar OFF also cancels permissions.

The independent scheduled executor arms OFF at 2000 ms before ON. Writes are serialized;
failed writes lock out subsequent ON. Pause/destroy/navigation/errors cancel active pulses.
No launch pulse or GPIO read, observer, UART, UV, other GPIO, root, or native library is included.
GPIO implementation preserves the verified 0.6/0.7 `O_WRONLY | O_CLOEXEC` open/write/close
behavior, with only ASCII 0=ON and 1=OFF. It retains the model/original-app version compatibility
gate. Manual/lifecycle/navigation cancellation always attempts an OFF write, even if local state
says inactive (including after process restart). Failed OFF locks out ON permanently but manual
OFF continues retrying. Launch never sends ON; page navigation may send safety OFF.

## Mandatory web-side protections / verification limits

Android API27 PermissionRequest reports origin, not requesting frame identity. Native requires
the exact origin, fixed capture document (including its query), foreground, only VIDEO_CAPTURE,
and Android CAMERA. Advisor uses a top-level transition, not a same-origin iframe. Native allows
only the fixed capture URL and HTTPS Venus `/skin-advisor.html` with optional query. Advisor is
never trusted for camera or light. Native Back from advisor returns to the fixed capture page;
Back from capture exits. Web CSP must block child frames (`frame-src 'none'`).

WebView does not invoke shouldInterceptRequest for redirected subresource destinations.
The wrapper permits initial HTTPS resources only from the Venus origin and `res.cloudinary.com`
(no userinfo or nondefault port). Cloudinary is not a trusted document, camera or light origin;
top-level navigation remains restricted to capture and advisor as above. Server
CSP and the absence of cross-origin redirects must also be verified before release.
Device tests used isolated diagnostic packages and mocked uploads, not patient records.
The timer cannot guarantee physical OFF if the kernel write blocks, Android kills the process,
or hardware fails. A failed OFF locks out new pulses, but physical observation remains required.
