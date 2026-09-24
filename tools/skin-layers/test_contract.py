import unittest
from report_contract import build_report


class ContractTests(unittest.TestCase):
    def test_scores_do_not_escape(self):
        result = build_report({"poros": {"conteo": 1891, "puntaje_provisional": 8}}, ["blanca"])
        self.assertIsNone(result["score"])
        self.assertNotIn("puntaje_provisional", str(result))
        self.assertEqual(result["layers"]["poros"]["candidateCount"], 1891)
        self.assertIsNone(result["layers"]["poros"]["confirmedCount"])

    def test_missing_spectral_captures_are_explicit(self):
        result = build_report({}, ["blanca", "polarizada"])
        self.assertEqual(result["unavailableModalities"], ["uv", "wood"])

    def test_invalid_count(self):
        for value in (-1, True, 1.5):
            with self.assertRaises(ValueError):
                build_report({"poros": {"conteo": value}}, ["blanca"])

    def test_white_capture_required(self):
        with self.assertRaises(ValueError):
            build_report({}, ["wood"])


if __name__ == "__main__":
    unittest.main()
