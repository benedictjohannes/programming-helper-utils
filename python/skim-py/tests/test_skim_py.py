import unittest
from unittest.mock import patch
import io
import sys
import tempfile
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

from skim_py.cli import main
from skim_py.parser import parse_source_file


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


class TestSkimPyParser(unittest.TestCase):
    def test_comment_inside_long_broken_header_block(self):
        code = (
            "def before():\n    return 1\n\ndef broken(x,\n# comment\n"
            + "".join(f"    x{i} = {i}\n" for i in range(110))
            + "\ndef after():\n    return 2\n"
        )
        parsed = parse_source_file("example.py", code)
        self.assertEqual([it.name for it in parsed.items], ["before", "broken", "after"])
        self.assertEqual(len(parsed.syntax_errors), 1)
        self.assertEqual(parsed.masked_lines, list(range(4, 116)))

    def test_recovered_method_in_excluded_test_class(self):
        code = "class TestSuite:\n    def broken(self, x,\n        return 1\n"
        parsed = parse_source_file("example.py", code)
        self.assertEqual(parsed.items, [])
        self.assertEqual(parsed.test_ranges, [(1, 3)])
        included = parse_source_file("example.py", code, include_tests=True)
        self.assertEqual([it.name for it in included.items[0].children], ["broken"])

    def test_user_mask_stub_name_is_preserved(self):
        code = (
            "def __skim_masked__():\n    return 1\n"
            "class Normal:\n    def __skim_masked__(self):\n        return 2\n"
        )
        for suffix in ("", "\nx =\n"):
            with self.subTest(recovery=bool(suffix)):
                parsed = parse_source_file("example.py", code + suffix)
                self.assertEqual([it.name for it in parsed.items], ["__skim_masked__", "Normal"])
                self.assertEqual(parsed.items[1].children[0].name, "__skim_masked__")

    def test_mask_only_statement_preserves_suite_and_neighbor(self):
        for header, statement in (
            ("def broken():", "return ("),
            ("class Broken:", "x = ["),
            ("def broken(\n    x,\n):", "return ("),
        ):
            with self.subTest(header=header):
                code = f"{header}\n    {statement}\n\ndef after():\n    return 2\n"
                parsed = parse_source_file("example.py", code)
                self.assertEqual(len(parsed.items), 2)
                self.assertEqual(len(parsed.syntax_errors), 1)
                self.assertEqual(parsed.masked_lines, [len(header.splitlines()) + 1])
                self.assertEqual(parsed.items[1].raw_header, "def after()")

    def test_recovered_class_and_method_ranges_include_original_body(self):
        code = "class Outer:\n    def broken(self, x,\n        return 1\n"
        parsed = parse_source_file("example.py", code)
        self.assertEqual(parsed.items[0].end_line, 3)
        self.assertEqual(parsed.items[0].children[0].end_line, 3)

    def test_recovered_header_without_body(self):
        parsed = parse_source_file("example.py", "def broken(x,\n")
        self.assertEqual([it.name for it in parsed.items], ["broken"])
        self.assertEqual(parsed.masked_lines, [1])

    def test_recovered_method_attaches_to_correct_repeated_class(self):
        code = (
            "class Outer:\n    pass\n\n"
            "class Outer:\n    def broken(self, x,\n        return 1\n"
        )
        parsed = parse_source_file("example.py", code)
        self.assertEqual(parsed.items[0].children, [])
        self.assertEqual([it.name for it in parsed.items[1].children], ["broken"])

    def test_masking_summary_and_clean_source(self):
        parsed = parse_source_file("example.py", "x =\ny =\n")
        self.assertEqual(parsed.masked_lines, [1, 2])
        self.assertEqual(parsed.masking_warning, "# parsed with 2 lines masked (L1, L2)")
        self.assertEqual(parse_source_file("example.py", "x = 1\n").masking_warning, "")

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

    def test_broken_header_cascade_resilience(self):
        code = """def valid_before():
    return 1

def broken_header(x,
    y = 1
    return y

def valid_after():
    return 2
"""
        parsed = parse_source_file("test.py", code)
        names = [it.name for it in parsed.items]
        self.assertIn("valid_before", names)
        self.assertIn("broken_header", names)
        self.assertIn("valid_after", names)
        # Verify it didn't cascade into eating lines one-by-one with IndentationErrors
        self.assertEqual(len(parsed.syntax_errors), 1)
        self.assertEqual(parsed.syntax_errors[0].line, 4)
        self.assertIn("masked", parsed.syntax_errors[0].message)

        # Check salvaged item properties
        broken_item = next(it for it in parsed.items if it.name == "broken_header")
        self.assertEqual(broken_item.start_line, 4)
        self.assertEqual(broken_item.end_line, 6)
        self.assertIn("syntax error", broken_item.raw_header)

    def test_unclosed_bracket_cascade_resilience(self):
        code = """def valid_before():
    return 1

items = [
    1,
    2,

def valid_after():
    return 2
"""
        parsed = parse_source_file("test.py", code)
        names = [it.name for it in parsed.items]
        self.assertIn("valid_before", names)
        self.assertIn("valid_after", names)
        self.assertEqual(len(parsed.syntax_errors), 1)
        self.assertEqual(parsed.syntax_errors[0].line, 4)
        self.assertIn("(L4-L6 masked)", parsed.syntax_errors[0].message)

    def test_error_inside_dict_recovers(self):
        code = 'config = {\n    "a": 1,\n    "b": ,\n    "c": 3,\n}\ndef valid(): ...\n'
        parsed = parse_source_file("test.py", code)
        self.assertIn("valid", [it.name for it in parsed.items])

    def test_stray_indent_recovers(self):
        code = "def a(): ...\n    x = 1\ndef valid(): ...\n"
        parsed = parse_source_file("test.py", code)
        names = [it.name for it in parsed.items]
        self.assertIn("valid", names)

    def test_bad_parameter_in_multiline_def_recovers(self):
        code = "def bad(\n    a,\n    1b,\n):\n    return a\n\ndef valid(): ...\n"
        parsed = parse_source_file("test.py", code)
        self.assertIn("valid", [it.name for it in parsed.items])

    def test_multiline_decorator_is_salvaged(self):
        code = """@foo(
    a,
    b,
)
def broken(x,
    return x

class K(Base):
    @bar(
        1,
    )
    def broken_m(self,
        return 1

def valid(): ...
"""
        parsed = parse_source_file("test.py", code)
        item = next(it for it in parsed.items if it.name == "broken")
        self.assertEqual(item.start_line, 1)
        self.assertIn("@foo( a, b, )", item.raw_header)
        self.assertIn("valid", [it.name for it in parsed.items])

    def test_salvaged_broken_class_methods(self):
        code = """class BrokenClass(Base,
    def method_one(self):
        return 1

    def method_two(self):
        return 2

def valid_after():
    return 2
"""
        parsed = parse_source_file("test.py", code)
        names = [it.name for it in parsed.items]
        self.assertIn("BrokenClass", names)
        self.assertIn("valid_after", names)

        cls_item = next(it for it in parsed.items if it.name == "BrokenClass")
        self.assertEqual(cls_item.start_line, 1)
        self.assertEqual(cls_item.end_line, 6)
        ch_names = [ch.name for ch in cls_item.children]
        self.assertEqual(ch_names, ["method_one", "method_two"])

    def test_syntax_error_cascade_fixture(self):
        cascade_path = str(FIXTURES_DIR / "syntax_error_cascade.py")
        with open(cascade_path, "r", encoding="utf-8") as f:
            content = f.read()
        parsed = parse_source_file(cascade_path, content)
        self.assertEqual(len(parsed.syntax_errors), 1)
        self.assertEqual(parsed.syntax_errors[0].line, 5)
        self.assertIn("(L5-L7 masked)", parsed.syntax_errors[0].message)
        names = [it.name for it in parsed.items]
        self.assertIn("valid_before", names)
        self.assertIn("broken_header", names)
        self.assertIn("valid_after", names)

    def test_decorator_leak_prevention(self):
        code = """@app.route("/x")
def broken(x,
    return 1

def valid_after():
    return 2
"""
        parsed = parse_source_file("test.py", code)
        items = {it.name: it for it in parsed.items}
        self.assertIn("broken", items)
        self.assertIn("valid_after", items)
        # Decorator belongs to broken, NOT valid_after
        self.assertEqual(items["broken"].start_line, 1)
        self.assertEqual(items["broken"].end_line, 3)
        self.assertIn("@app.route", items["broken"].raw_header)

        self.assertEqual(items["valid_after"].start_line, 5)
        self.assertEqual(items["valid_after"].end_line, 6)
        self.assertNotIn("@app.route", items["valid_after"].raw_header)

    def test_salvaged_test_filtering(self):
        code = """def test_broken(x,
    return 1

def valid_after():
    return 2
"""
        # include_tests=False should skip test_broken
        parsed_no_tests = parse_source_file("test.py", code, include_tests=False)
        self.assertEqual([it.name for it in parsed_no_tests.items], ["valid_after"])
        self.assertEqual(parsed_no_tests.test_ranges, [(1, 2)])

        # include_tests=True should include test_broken
        parsed_with_tests = parse_source_file("test.py", code, include_tests=True)
        self.assertIn("test_broken", [it.name for it in parsed_with_tests.items])

    def test_tab_indented_salvage(self):
        code = "def broken(x,\n\treturn 1\n\ndef valid_after():\n\treturn 2\n"
        parsed = parse_source_file("test.py", code)
        items = {it.name: it for it in parsed.items}
        self.assertIn("broken", items)
        self.assertIn("valid_after", items)
        self.assertEqual(items["broken"].start_line, 1)
        self.assertEqual(items["broken"].end_line, 2)
        self.assertEqual(items["valid_after"].start_line, 4)
        self.assertEqual(items["valid_after"].end_line, 5)

    def test_broken_method_with_column0_comment(self):
        code = """class Outer:
# comment at col 0
    def broken_m(self, x,
        return 1

    def after(self):
        return 2
"""
        parsed = parse_source_file("test.py", code)
        items = {it.name: it for it in parsed.items}
        self.assertIn("Outer", items)
        outer = items["Outer"]
        ch_names = [ch.name for ch in outer.children]
        self.assertIn("broken_m", ch_names)
        self.assertIn("after", ch_names)


class TestSkimPyCLI(unittest.TestCase):
    def test_recovered_async_method_is_visible(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.py"
            path.write_text("class Broken(Base,\n    async def fetch(self):\n        return 1\n")
            stdout = io.StringIO()
            with redirect_stdout(stdout):
                result = main(["glance", "-s", str(path)])
            self.assertEqual(result, 0)
            self.assertIn("async def fetch", stdout.getvalue())
            self.assertIn("# parsed with 3 lines masked (L1, L2, L3)", stdout.getvalue())

    def test_raw_block_preserves_original_source_and_warns_on_stderr(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.py"
            original = "def broken():\n    x =\n    return 1\n"
            path.write_text(original)
            stdout, stderr = io.StringIO(), io.StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr):
                result = main(["block", str(path), "broken", "--raw"])
            self.assertEqual(result, 0)
            self.assertEqual(stdout.getvalue(), original)
            self.assertIn("# parsed with 1 line masked (L2)", stderr.getvalue())

    def test_block_warns_about_masking_outside_requested_range(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            result = main(["block", str(FIXTURES_DIR / "syntax_error.py"), "valid_after"])
        self.assertEqual(result, 0)
        self.assertIn("# parsed with 1 line masked (L7)", stderr.getvalue())

    def test_raw_class_includes_last_broken_method_body(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.py"
            original = "class Outer:\n    def broken(self, x,\n        return 1\n"
            path.write_text(original)
            stdout, stderr = io.StringIO(), io.StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr):
                result = main(["block", str(path), "Outer", "--raw"])
            self.assertEqual(result, 0)
            self.assertEqual(stdout.getvalue(), original)
            self.assertIn("# parsed with 2 lines masked (L2, L3)", stderr.getvalue())

    def test_python_version_guard(self):
        err = io.StringIO()
        with patch.object(sys, "version_info", (3, 9, 7)):
            with redirect_stderr(err):
                result = main(["glance", "foo.py"])
        self.assertEqual(result, 1)
        self.assertIn("Error: skim-py requires Python 3.10+", err.getvalue())

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
