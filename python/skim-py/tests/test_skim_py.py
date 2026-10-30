import unittest
import io
import sys
from pathlib import Path

from skim_py.cli import main
from skim_py.parser import parse_source_file


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


class TestSkimPyParser(unittest.TestCase):
    def test_casing_exact_precedence(self):
        casing_path = str(FIXTURES_DIR / "casing.py")
        with open(casing_path, "r", encoding="utf-8") as f:
            content = f.read()
        parsed = parse_source_file(casing_path, content)
        names = [it.name for it in parsed.items]
        self.assertIn("Item", names)
        self.assertIn("item", names)

    def test_filter_tests_default(self):
        tests_path = str(FIXTURES_DIR / "tests.py")
        with open(tests_path, "r", encoding="utf-8") as f:
            content = f.read()

        parsed_without = parse_source_file(tests_path, content, include_tests=False)
        names_without = [it.name for it in parsed_without.items]
        self.assertIn("normal_helper", names_without)
        self.assertIn("NormalClass", names_without)
        self.assertNotIn("TestSuite", names_without)
        self.assertNotIn("test_standalone_func", names_without)

        parsed_with = parse_source_file(tests_path, content, include_tests=True)
        names_with = [it.name for it in parsed_with.items]
        self.assertIn("TestSuite", names_with)
        self.assertIn("test_standalone_func", names_with)

    def test_classes_and_decorators(self):
        classes_path = str(FIXTURES_DIR / "classes.py")
        with open(classes_path, "r", encoding="utf-8") as f:
            content = f.read()
        parsed = parse_source_file(classes_path, content)
        proc = next(it for it in parsed.items if it.name == "Processor")
        methods = {m.name: m for m in proc.children}

        self.assertIn("create", methods)
        self.assertIn("@classmethod", methods["create"].raw_header)

        self.assertIn("validate_value", methods)
        self.assertIn("@staticmethod", methods["validate_value"].raw_header)

        self.assertIn("current_factor", methods)
        self.assertIn("@property", methods["current_factor"].raw_header)

        self.assertIn("compute_async", methods)
        self.assertIn("async def", methods["compute_async"].raw_header)

    def test_syntax_notice_resilience(self):
        bad_path = str(FIXTURES_DIR / "syntax_error.py")
        with open(bad_path, "r", encoding="utf-8") as f:
            content = f.read()
        parsed = parse_source_file(bad_path, content)
        self.assertGreater(len(parsed.syntax_errors), 0)
        self.assertEqual(parsed.syntax_errors[0].line, 7)
        # Verify that surrounding valid declarations are successfully parsed
        names = [it.name for it in parsed.items]
        self.assertIn("valid_before", names)
        self.assertIn("valid_after", names)


class TestSkimPyCLI(unittest.TestCase):
    def test_block_casing_resolution(self):
        casing_path = str(FIXTURES_DIR / "casing.py")

        # Exact match Item (class)
        old_out = sys.stdout
        sys.stdout = io.StringIO()
        try:
            code = main(["block", casing_path, "Item"])
            out = sys.stdout.getvalue()
        finally:
            sys.stdout = old_out
        self.assertEqual(code, 0)
        self.assertIn("class Item", out)

        # Exact match item (function)
        sys.stdout = io.StringIO()
        try:
            code = main(["block", casing_path, "item"])
            out = sys.stdout.getvalue()
        finally:
            sys.stdout = old_out
        self.assertEqual(code, 0)
        self.assertIn("def item()", out)

    def test_block_exit_codes(self):
        casing_path = str(FIXTURES_DIR / "casing.py")

        # Not found -> exit 2
        code = main(["block", casing_path, "UnknownSymbol"])
        self.assertEqual(code, 2)

    def test_glance_details(self):
        data_path = str(FIXTURES_DIR / "dataclasses_enum.py")
        old_out = sys.stdout
        sys.stdout = io.StringIO()
        try:
            code = main(["glance", "-s", "-d", data_path])
            out = sys.stdout.getvalue()
        finally:
            sys.stdout = old_out
        self.assertEqual(code, 0)
        self.assertIn("RED = 1", out)
        self.assertIn("item: T", out)


if __name__ == "__main__":
    unittest.main()
