"""Run the local detector with explicit original captures and a bounded runtime."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

from report_contract import build_report


def main():
    parser = argparse.ArgumentParser()
    for mode in ("blanca", "polarizada", "uv", "wood"):
        parser.add_argument("--" + mode, required=mode == "blanca", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    if args.out.exists():
        parser.error("Usa una carpeta nueva para no mezclar sesiones")
    command = [sys.executable, str(Path(__file__).parent / "vendor/skin_layers_v2.py")]
    modalities = []
    for mode in ("blanca", "polarizada", "uv", "wood"):
        path = getattr(args, mode)
        if path is not None:
            if not path.is_file() or path.stat().st_size > 25000000:
                parser.error("Captura inexistente o mayor de 25 MB")
            modalities.append(mode)
            command.extend(["--" + mode, str(path.resolve())])
    command.extend(["--out", str(args.out.resolve())])
    subprocess.run(command, check=True, timeout=180, stdout=subprocess.DEVNULL)
    raw = json.loads((args.out / "reporte.json").read_text())
    result = build_report(raw, modalities)
    result["images"] = sorted(p.name for p in args.out.glob("*.jpg"))
    (args.out / "manifest.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
