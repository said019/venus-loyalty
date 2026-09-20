# Device identity from live system inspection

Read-only ADB inspection on 2026-09-20, requested by the owner when a physical
label was unavailable. No light commands, camera activation or configuration
changes were made during this inspection. Device serials are intentionally
omitted from this document.

## Direct observations

| Source | Value |
| --- | --- |
| ro.product.model | RK3399-S9932 |
| ro.firmware.name | S9931P_O_ZMLH_EDP |
| ro.build.display.id | S9931P_O_ZMLH_EDP_20230921_V1.0.3.5 |
| ro.product.version | 1.0.3.5 |
| ro.build.version.release | 8.1.0 |
| ro.build.version.sdk | 27 |
| sys_graphic.cam_back.iq | /vendor/etc/OV13850.xml |
| sys_graphic.cam_back.iq.ver | 06-Aug-2014_ZYL-OYYF_OV13850_CMK-CT0116-FV1_v0.1.2 |
| ro.fise.gpio.test | 0,1,2,3,4,5, |
| original installed package | com.yiyuan.skin, versionName 1.7.7, versionCode 67 |

`/vendor/etc/cam_board.xml` additionally declares OV13850, MIPI four-lane
RAW10 interface, back-facing camera and orientation zero. This agrees with
the active IQ path and earlier native JPEG captures. Other XML sensor profiles
also exist in /vendor/etc; their presence alone does not mean those sensors
are installed.

## Scope of this identification

This identifies the embedded firmware and camera without requiring a label.
The ZMLH string is a firmware identifier; it does not establish an exact
marketed analyzer model or optical assembly revision. Likewise the generic
GPIO test list does not determine wavelengths, intensity or polarization.

The camera XML's Flash section declares placeholder luminance/color-temperature
values of zero. These are not calibrated measurements of the analyzer LED
arrays. Do not use camera white-balance or preview parameters as optical limits.

Use MODES-RESEARCH.md for the original application's channel mapping. Exact
optical specifications and physical shutdown validation remain separate from
software/board identification. No finding here certifies client-use readiness.
