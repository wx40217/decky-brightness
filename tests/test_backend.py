import asyncio
import json
import tempfile
import unittest
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py_modules"))
from brightness_floor_backend import Environment, Settings, validate_brightness


class SettingsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def test_first_launch_and_exact_roundtrip(self):
        settings = Settings(self.directory)
        self.assertEqual(settings.minimum, 0.44)
        self.assertTrue(settings.snapshot()["minimum_is_default"])
        self.assertFalse(settings.path.exists())
        value = 0.2345678912345678
        asyncio.run(settings.save(value))
        self.assertEqual(Settings(self.directory).minimum, value)
        self.assertFalse(Settings(self.directory).snapshot()["minimum_is_default"])
        self.assertEqual(json.loads(settings.path.read_text())["minimum_brightness"], value)

    def test_invalid_values_never_replace_file(self):
        settings = Settings(self.directory)
        asyncio.run(settings.save(0.5))
        before = settings.path.read_bytes()
        for value in [True, False, None, "0.5", -1, 2, float("nan"), float("inf")]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                asyncio.run(settings.save(value))
            self.assertEqual(settings.path.read_bytes(), before)

    def test_failed_replace_preserves_last_good_value_and_cleans_temp(self):
        settings = Settings(self.directory)
        asyncio.run(settings.save(0.4))
        with patch("brightness_floor_backend.os.replace", side_effect=OSError("disk failure")):
            with self.assertRaises(OSError):
                asyncio.run(settings.save(0.6))
        self.assertEqual(settings.minimum, 0.4)
        self.assertEqual(Settings(self.directory).minimum, 0.4)
        self.assertEqual(len(list(self.directory.iterdir())), 1)

    def test_corruption_and_unknown_versions_preserved_until_explicit_calibration(self):
        for content in ["broken", '{"version":2,"minimum_brightness":0.5}',
                        '{"version":1,"minimum_brightness":true}',
                        '{"version":1,"minimum_brightness":NaN}', "[]"]:
            path = self.directory / "brightness-floor.json"
            path.write_text(content)
            settings = Settings(self.directory)
            self.assertEqual(settings.minimum, 0.44)
            self.assertTrue(settings.snapshot()["minimum_is_default"])
            self.assertIsNotNone(settings.error)
            self.assertEqual(path.read_text(), content)
            asyncio.run(settings.save(0.51))
            self.assertEqual(Settings(self.directory).minimum, 0.51)

    def test_zero_and_one_are_valid(self):
        self.assertEqual(validate_brightness(0), 0)
        self.assertEqual(validate_brightness(1), 1)

    def test_legacy_unconfigured_file_uses_default_without_rewriting_it(self):
        path = self.directory / "brightness-floor.json"
        contents = '{"version":1,"minimum_brightness":null}'
        path.write_text(contents)
        settings = Settings(self.directory)
        self.assertEqual(settings.minimum, 0.44)
        self.assertTrue(settings.snapshot()["minimum_is_default"])
        self.assertEqual(path.read_text(), contents)

    def test_existing_custom_floor_is_not_replaced_by_default(self):
        settings = Settings(self.directory)
        asyncio.run(settings.save(0.4408136010169983))
        restored = Settings(self.directory)
        self.assertEqual(restored.minimum, 0.4408136010169983)
        self.assertFalse(restored.snapshot()["minimum_is_default"])


class EnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.probe = Environment(self.root / "sys", self.root / "proc", self.root / "os-release")
        self.write("sys/class/dmi/id/product_name", "Galileo")
        self.write("proc/100/comm", "gamescope")
        self.write("os-release", 'VERSION_ID="3.7.0"')
        self.write("sys/class/drm/card1-eDP-1/status", "connected")
        self.write("sys/class/drm/card1-eDP-1/enabled", "enabled")
        self.linux = patch("brightness_floor_backend.platform.system", return_value="Linux")
        self.linux.start()
        self.addCleanup(self.linux.stop)

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def test_internal_oled_game_mode(self):
        state = self.probe.inspect()
        self.assertTrue(state["allowed"])
        self.assertEqual(state["steamos_version"], "3.7.0")

    def test_gamescope_main_thread_name_still_identifies_game_mode(self):
        self.write("proc/100/comm", "gamescope-wl")
        state = self.probe.inspect()
        self.assertTrue(state["allowed"])
        self.assertEqual(state["gamescope_process"], "gamescope-wl")

    def test_executable_identity_survives_other_thread_names(self):
        self.write("proc/100/comm", "renamed-thread")
        with patch.object(Path, "readlink", return_value=Path("/usr/bin/gamescope")):
            self.assertTrue(self.probe.inspect()["allowed"])
        with patch.object(Path, "readlink", return_value=Path("/usr/bin/steam")):
            self.assertFalse(self.probe.inspect()["allowed"])

    def test_gamescope_prefix_alone_does_not_enable_control(self):
        self.write("proc/100/comm", "gamescope-helper")
        self.assertFalse(self.probe.inspect()["allowed"])

    def test_external_connected_blocks_even_if_not_enabled(self):
        self.write("sys/class/drm/card1-HDMI-A-1/status", "connected")
        self.write("sys/class/drm/card1-HDMI-A-1/enabled", "disabled")
        self.assertFalse(self.probe.inspect()["allowed"])
        self.write("sys/class/drm/card1-HDMI-A-1/status", "disconnected")
        self.assertTrue(self.probe.inspect()["allowed"])

    def test_sleep_desktop_unknown_and_lcd_block(self):
        for name, value in [("sys/class/drm/card1-eDP-1/enabled", "disabled"),
                            ("proc/100/comm", "steam"),
                            ("sys/class/dmi/id/product_name", "Jupiter")]:
            path = self.root / name
            old = path.read_text()
            self.write(name, value)
            self.assertFalse(self.probe.inspect()["allowed"])
            self.write(name, old)
        with patch("brightness_floor_backend.platform.system", return_value="Windows"):
            self.assertFalse(self.probe.inspect()["allowed"])


if __name__ == "__main__":
    unittest.main()
