# Local skin layers

Imported from the user-supplied `analizador_piel_codigo.zip`. No patient photos
are included. The vendor directory denotes imported code, not a manufacturer SDK.

Python 3.11. Install requirements in an isolated environment. Run:

```sh
python run.py --blanca /private/white.jpg --polarizada /private/polarized.jpg --out /private/new-session
python -m unittest discover -s tools/skin-layers -p 'test_*.py'
```

Only pass original captures. Processed reference layers are not UV/Wood inputs.
Outputs must remain in private storage, outside the public directory and Git.
The manifest exposes candidate counts, null confirmed counts, and no scores.
Color transformations are visualizations, not spectral measurements.

Current limitations: single-session calibration; unvalidated thresholds; no
alignment quality gate yet; face zones can overlap or omit detections. The
recalibration utilities from the supplied archive are intentionally not included
because their paths and recipe names do not match the runner. The private POST
photo/layers endpoint verifies the current staff account and record ownership
before loading a white capture.

Wrinkles (2026-10-21): v2 now emits `arrugas` using the v1 Frangi ridge filter
on the white capture, with candidate counts by zone. The threshold is relative
(97th percentile of the skin response), so smooth skin still yields candidates;
a public test portrait also showed false lines along the hairline. Treat it as a
review aid, not a measurement. `test_wrinkles.py` runs the real detector on the
public-domain scikit-image astronaut portrait (skipped without the runtime).

History (2026-10-21): each generation is saved. JPEGs go to Cloudinary under
`venus-expedientes/skin-maps/<recordId>/` and a `skin_layer_sets` row links them
to the source photo (migration `20261021000000_skin_layer_sets`). GET
photo/layers returns the latest saved set; storage IDs never reach the browser.
A failed upload or database write removes the images already uploaded. Deleting
a photo or session also destroys its maps.

Reverse engineering (2026-10-21): the original com.yiyuan.skin 1.7.7 APK on the
device (SHA-256 affb7831…b635) holds no local skin algorithms. Its native
`SDK.analysis` (libtensorflowlite_jni.so) is an HTTP client to the vendor's
cloud, and the app never calls it; libtensorflow_demo.so is the stock
TensorFlow demo; `yyface-detect.tflite` is face detection. Pores, wrinkles and
spots are computed server-side by the manufacturer, so Venus maps are
independent detectors, not manufacturer equivalents.

Deployment: nixpacks.toml installs the isolated Python 3.11 runtime and executes
check_runtime.py during the build. SKIN_LAYERS_PYTHON selects that executable;
an empty value disables the feature. One analysis at a time runs per process.
Temporary photos/results are deleted on success and failure. The CPU operation
has a 195-second deadline. No third-party image processing API is called.
- Runbook de despliegue a producción: `docs/superpowers/plans/2026-10-21-venus-skin-app-runbook.md`.
