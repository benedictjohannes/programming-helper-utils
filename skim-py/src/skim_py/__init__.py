"""skim_py package root."""

from importlib.metadata import PackageNotFoundError, version

from .cli import main

try:
    __version__ = version("skim-python")
except PackageNotFoundError:
    __version__ = "unknown"

__all__ = ["main", "__version__"]
