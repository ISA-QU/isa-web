"""Loads the rebuild-dashboard Lambda's own code (never a copy) for its name maps and reader."""

import importlib.util
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LAMBDA_PATH = os.path.join(ROOT, "backend", "lambdas", "rebuild-dashboard", "lambda_function.py")

_module = None


def lambda_module():
    """The Lambda module, imported from its file. It needs only the standard library."""
    global _module
    if _module is None:
        spec = importlib.util.spec_from_file_location("rebuild_dashboard_lambda", LAMBDA_PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _module = module
    return _module
