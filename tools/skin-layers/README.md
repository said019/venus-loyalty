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
because their paths and recipe names do not match the runner. The imported v2
does not produce wrinkle maps. The private POST photo/layers endpoint verifies
the current staff account and record ownership before loading a white capture.
The application returns ephemeral maps; they are not yet persisted in history.

Deployment: nixpacks.toml installs the isolated Python 3.11 runtime and executes
check_runtime.py during the build. SKIN_LAYERS_PYTHON selects that executable;
an empty value disables the feature. One analysis at a time runs per process.
Temporary photos/results are deleted on success and failure. The CPU operation
has a 195-second deadline. No third-party image processing API is called.
