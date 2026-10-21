"""Runs the real detector on a public-domain portrait; no patient photos."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HEAVY = all(importlib.util.find_spec(name) for name in ("cv2", "mediapipe", "skimage"))


@unittest.skipUnless(HEAVY, "requires the isolated skin-layers runtime")
class WrinkleLayerTests(unittest.TestCase):
    def test_runner_emits_wrinkle_candidates_by_zone(self):
        import cv2
        from skimage import data
        with tempfile.TemporaryDirectory() as tmp:
            white = Path(tmp) / "white.png"
            cv2.imwrite(str(white), cv2.cvtColor(data.astronaut(), cv2.COLOR_RGB2BGR))
            out = Path(tmp) / "result"
            subprocess.run([sys.executable, str(Path(__file__).parent / "run.py"),
                            "--blanca", str(white), "--out", str(out)],
                           check=True, timeout=300, stdout=subprocess.DEVNULL)
            manifest = json.loads((out / "manifest.json").read_text())
            self.assertIn("arrugas.jpg", manifest["images"])
            layer = manifest["layers"]["arrugas"]
            self.assertIs(type(layer["candidateCount"]), int)
            self.assertIsNone(layer["confirmedCount"])
            self.assertTrue(layer["reviewRequired"])
            self.assertTrue(set(layer["candidatesByZone"]) <= {"frente", "nariz", "menton", "mejilla_izq", "mejilla_der"})
            self.assertIsNone(manifest["score"])


if __name__ == "__main__":
    unittest.main()
