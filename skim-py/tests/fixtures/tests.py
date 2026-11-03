import unittest


def normal_helper() -> int:
    return 42


def test_helper_not_test() -> str:
    return "test"


class NormalClass:
    def regular_method(self) -> None:
        pass

    def test_like_method(self) -> None:
        pass


class TestSuite(unittest.TestCase):
    def test_example(self) -> None:
        self.assertEqual(normal_helper(), 42)

    def test_another(self) -> None:
        pass


def test_standalone_func() -> None:
    assert True
