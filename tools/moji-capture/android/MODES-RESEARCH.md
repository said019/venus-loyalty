# Original 1.7.7 mode mapping (not hardware validation)

## Device observation 2026-09-20

ADB confirmed RK3399-S9932 with com.yiyuan.skin 1.7.7. Operator ran the
original app with the device empty. Read-only GpioUtils logcat observations
(device local timestamps) matched the static mapping:

| Mode key | GPIO | ON timestamp | Next OFF | Interval seconds |
| --- | --- | --- | --- | --- |
| image | 0 | 14:36:54.821 | 14:36:56.591 | 1.770 |
| image_positive | 4 | 14:36:56.592 | 14:36:58.742 | 2.150 |
| image_uv | 5 | 14:36:58.743 | 14:37:02.024 | 3.281 |
| image_woods | 2 | 14:37:02.025 | 14:37:04.173 | 2.148 |
| image_negative | 1 | 14:37:04.174 | 14:37:06.220 | 2.046 |
| image_blue | 3 | 14:37:06.220 | 14:37:07.959 | 1.739 |
| image | 0 | 14:37:07.960 | 14:37:09.701 | 1.741 |
| image | 0 | 14:37:09.702 | 14:37:11.417 | 1.715 |

White GPIO0 was already enabled at 14:35:49.494; its first interval above
starts at a repeated ON, not the start of total white-light exposure.
All six channels received OFF at 14:37:11.417-11.423, repeated at
14:37:13.451-13.464. These are application write logs, not optical feedback.
Operator separately confirmed an earlier controlled 0.5-second white pulse
turned on and off. Physical final OFF for this full sequence still requires
operator confirmation.

These observed intervals include processing/camera latency. They are NOT
manufacturer exposure limits or validated replacement capture delays. JPEG
shutter timestamps and persisted per-mode images have not yet been correlated.
No production photos were deleted and no multi-light replacement was deployed.

Source: locally decompiled com.yiyuan.skin 1.7.7, CameraActivity.java
onCreate (lines 1227-1243), s (1387-1426), and f/b/a/g.java b.
The model lookup maps RK3399-S9932 to device family 3.

For family 3 only, the original capture sequence is:

| Index | Original image key | GPIO |
| --- | --- | --- |
| 0 | image | 0 |
| 1 | image_positive | 4 |
| 2 | image_uv | 5 |
| 3 | image_woods | 2 |
| 4 | image_negative | 1 |
| 5 | image_blue | 3 |
| 6 | image | 0 |
| 7 | image | 0 |

These are original software identifiers, not independently measured spectra.
Do not infer polarization, wavelength, exposure safety, or a red-light mode
from photographs of the LEDs. Other model families have DIFFERENT mappings.
The older tools/moji-luces UART protocol must not be substituted here.

f/b/a/p/f.java D0 writes the selected /sys/class/fise_gpioN/level:
0 means on, 1 means off. CameraActivity.s turns the preceding channel off
before turning the next one on; out-of-range indexes turn all listed channels
off. Do not read these sysfs level files: reads can change GPIO direction.

The original app captures JPEG using Camera.takePicture and its JPEG callback
in f/f/a/g/h/c.java, then restarts preview. This is not equivalent to taking
arbitrary WebView preview screenshots after a fixed delay. The 100/200ms
LightManager callbacks in s apply to family 6, NOT RK3399-S9932.

## Still required before enabling multi-light acquisition

- Confirm connected device model and original app version via ADB.
- Trace family-3 exposure, preview settling and capture timing completely.
- Obtain manufacturer's exposure limits and precautions for UV/Wood modes.
- Validate each channel and shutdown behavior on an empty device with an
  operator present; do not use a client to test unknown illumination.
- Implement native capture acknowledgements with request/session/mode IDs,
  independent OFF deadline, cancellation on lifecycle change, and no overlap.
- Persist mode, original JPEG, session ID and capture timestamp together;
  never label a white-light capture as another modality or fabricate maps.
- Test failure on camera loss, failed OFF, interrupted upload and partial sets.

The shipped 0.8 white-only safety gate remains unchanged. Multi-light capture
is NOT implemented or validated by this research note.
