"""Load main.py as Decky does, without depending on the project working directory."""

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class LoaderTests(unittest.TestCase):
    def test_isolated_decky_load(self):
        root = Path(__file__).resolve().parents[1]
        code = '''
import asyncio, importlib.util, json, sys, types
decky = types.ModuleType("decky")
decky.DECKY_PLUGIN_SETTINGS_DIR = sys.argv[2]
sys.modules["decky"] = decky
spec = importlib.util.spec_from_file_location("_", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
plugin = module.Plugin()
async def check():
    await plugin._main()
    state = await plugin.get_state()
    assert state["minimum_brightness"] == 0.44
    assert state["minimum_is_default"] is True
    assert "allowed" in state["environment"]
    await plugin._unload()
asyncio.run(check())
'''
        with tempfile.TemporaryDirectory() as directory:
            env = dict(os.environ)
            env["PYTHONPATH"] = str(root / "py_modules")
            completed = subprocess.run([sys.executable, "-c", code, str(root / "main.py"), directory],
                                       cwd=directory, env=env, capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0, completed.stderr)


if __name__ == "__main__":
    unittest.main()
