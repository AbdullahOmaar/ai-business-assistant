"""Unit tests for the zero-budget agent ledger validator."""
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "agent" / "validate_ledger.py"
SPEC = importlib.util.spec_from_file_location("validate_ledger", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def sample():
    return {
        "schema_version": 1,
        "agent": {
            "status": "not_deployed",
            "budget_mode": "controlled",
            "monthly_spend_limit_usd": 0,
            "paid_resource_creation": False,
            "paid_plan_upgrade": False,
            "stop_on_unknown_cost": True,
            "stop_on_budget_limit": True,
            "hard_stop_on_budget_limit": True,
        },
        "tasks": [
            {"id": "A", "title": "First", "status": "completed", "depends_on": [], "attempts": 1},
            {"id": "B", "title": "Second", "status": "queued", "depends_on": ["A"], "attempts": 0},
        ],
    }


class LedgerValidationTests(unittest.TestCase):
    def test_valid_ledger_passes(self):
        self.assertEqual(MODULE.validate(sample()), [])

    def test_nonzero_budget_fails_closed(self):
        data = sample()
        data["agent"]["monthly_spend_limit_usd"] = 1
        self.assertTrue(any("$0" in error for error in MODULE.validate(data)))

    def test_paid_resources_are_forbidden(self):
        data = sample()
        data["agent"]["paid_resource_creation"] = True
        self.assertTrue(any("paid_resource_creation" in error for error in MODULE.validate(data)))

    def test_unknown_dependency_fails(self):
        data = sample()
        data["tasks"][1]["depends_on"] = ["MISSING"]
        self.assertTrue(any("unknown dependency" in error for error in MODULE.validate(data)))

    def test_dependency_cycle_fails(self):
        data = sample()
        data["tasks"][0]["depends_on"] = ["B"]
        self.assertTrue(any("cycle" in error for error in MODULE.validate(data)))

    def test_duplicate_ids_fail(self):
        data = sample()
        data["tasks"][1]["id"] = "A"
        self.assertTrue(any("unique" in error for error in MODULE.validate(data)))

    def test_invalid_attempt_count_fails(self):
        data = sample()
        data["tasks"][0]["attempts"] = -1
        self.assertTrue(any("attempts" in error for error in MODULE.validate(data)))


if __name__ == "__main__":
    unittest.main()
