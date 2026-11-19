import copy
import json
import unittest
from pathlib import Path

from tools.build_data import validate_and_build


ROOT = Path(__file__).resolve().parents[1]


class LiteratureModelTests(unittest.TestCase):
    def setUp(self):
        self.model = json.loads((ROOT / "data/models/facto.json").read_text())

    def test_provisional_unknowns_are_accepted(self):
        model = copy.deepcopy(self.model)
        model["arch"]["strictlyLocal"] = None
        built, errors = validate_and_build(model, {}, set())
        self.assertEqual(errors, [])
        self.assertIsNone(built["scores"])
        self.assertIsNone(built["arch"]["strictlyLocal"])

    def test_unknowns_do_not_weaken_full_model_validation(self):
        model = copy.deepcopy(self.model)
        del model["reviewStatus"]
        model["arch"]["strictlyLocal"] = None
        _, errors = validate_and_build(model, {}, set())
        self.assertTrue(any("scores required" in error for error in errors))
        self.assertTrue(any("strictlyLocal must be bool" in error for error in errors))
        self.assertTrue(any("arch.forces" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
