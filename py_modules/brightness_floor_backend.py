"""Persistent calibration and read-only device checks; never writes to hardware."""

import asyncio
import json
import math
import os
import platform
import tempfile
from pathlib import Path


DEFAULT_MINIMUM_BRIGHTNESS = 0.44


def validate_brightness(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("亮度必须是数字")
    if not math.isfinite(value) or not 0 <= value <= 1:
        raise ValueError("亮度必须在 0 到 1 之间")
    return value


class Settings:
    def __init__(self, directory):
        self.path = Path(directory) / "brightness-floor.json"
        self.minimum = DEFAULT_MINIMUM_BRIGHTNESS
        self.is_default = True
        self.error = None
        self.lock = asyncio.Lock()
        self.load()

    def load(self):
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(data, dict) or data.get("version") != 1:
                raise ValueError("不支持的配置格式")
            minimum = data["minimum_brightness"]
            self.is_default = minimum is None
            self.minimum = DEFAULT_MINIMUM_BRIGHTNESS if self.is_default else validate_brightness(minimum)
            self.error = None
        except FileNotFoundError:
            self.minimum = DEFAULT_MINIMUM_BRIGHTNESS
            self.is_default = True
            self.error = None
        except (OSError, ValueError, KeyError, TypeError):
            self.minimum = DEFAULT_MINIMUM_BRIGHTNESS
            self.is_default = True
            self.error = "无法读取已保存的下限，暂用默认 44%。原文件已保留，请重新校准并保存。"

    def snapshot(self):
        return {"minimum_brightness": self.minimum, "minimum_is_default": self.is_default,
                "settings_error": self.error}

    async def save(self, value):
        value = validate_brightness(value)
        async with self.lock:
            # Commit in memory only after an atomic replacement succeeds.
            self.path.parent.mkdir(parents=True, exist_ok=True)
            descriptor, temporary = tempfile.mkstemp(
                prefix=".brightness-floor-", suffix=".tmp", dir=self.path.parent
            )
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                    json.dump({"version": 1, "minimum_brightness": value}, stream,
                              ensure_ascii=False, allow_nan=False)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, self.path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
            self.minimum = value
            self.is_default = False
            self.error = None
            return self.snapshot()


class Environment:
    def __init__(self, sys_root="/sys", proc_root="/proc", os_release="/etc/os-release"):
        self.sys = Path(sys_root)
        self.proc = Path(proc_root)
        self.os_release = Path(os_release)

    @staticmethod
    def read(path):
        try:
            return path.read_text(encoding="utf-8").strip()
        except (OSError, UnicodeError):
            return ""

    def gamescope_process(self):
        try:
            processes = self.proc.iterdir()
            for process in processes:
                if not process.name.isdigit():
                    continue
                name = self.read(process / "comm")
                # wlserver_run renames the main thread, and /proc/<pid>/comm
                # reports that thread name rather than the executable name.
                if name in ("gamescope", "gamescope-wl"):
                    return name
                try:
                    if (process / "exe").readlink().name == "gamescope":
                        return name or "gamescope"
                except OSError:
                    pass
        except OSError:
            pass
        return ""

    def inspect(self):
        dmi = self.sys / "class/dmi/id"
        model = self.read(dmi / "product_name") or self.read(dmi / "board_name")
        release = {}
        for line in self.read(self.os_release).splitlines():
            key, separator, value = line.partition("=")
            if separator:
                release[key] = value.strip('"')
        result = {
            "model": model or "未知",
            "steamos_version": release.get("VERSION_ID", "未知"),
            "kernel": platform.release(),
            "allowed": False,
            "reason": "",
            "gamescope_process": "",
        }
        if platform.system() != "Linux":
            result["reason"] = "仅支持 Steam Deck OLED 的 SteamOS 游戏模式。"
            return result
        if model != "Galileo" and self.read(dmi / "board_name") != "Galileo":
            result["reason"] = "未识别为 Steam Deck OLED，亮度控制已停用。"
            return result
        result["gamescope_process"] = self.gamescope_process()
        if not result["gamescope_process"]:
            result["reason"] = "未检测到游戏模式，亮度控制已停用。"
            return result
        internal_active = False
        for connector in (self.sys / "class/drm").glob("card*-*"):
            if not (connector / "status").exists():
                continue
            connected = self.read(connector / "status") == "connected"
            internal = "-eDP-" in connector.name or "-DSI-" in connector.name
            if connected and not internal:
                result["reason"] = "检测到外接显示器，插件调光已暂停。"
                return result
            if internal and connected and self.read(connector / "enabled") == "enabled":
                internal_active = True
        if not internal_active:
            result["reason"] = "内置屏幕未启用或无法确认，插件调光已暂停。"
            return result
        result["allowed"] = True
        return result
