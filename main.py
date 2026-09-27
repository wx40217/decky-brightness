import decky

from brightness_floor_backend import Environment, Settings


class Plugin:
    def initialize(self):
        if not hasattr(self, "settings"):
            if not decky.DECKY_PLUGIN_SETTINGS_DIR:
                raise RuntimeError("Decky 未提供插件配置目录")
            self.settings = Settings(decky.DECKY_PLUGIN_SETTINGS_DIR)
            self.environment = Environment()

    async def _main(self):
        self.initialize()

    async def get_state(self):
        self.initialize()
        return {**self.settings.snapshot(), "environment": self.environment.inspect()}

    async def save_minimum(self, value):
        self.initialize()
        environment = self.environment.inspect()
        if not environment["allowed"]:
            raise ValueError(environment["reason"])
        return await self.settings.save(value)

    async def _unload(self):
        # No hardware writes, processes, timers, or backend listeners to undo.
        pass
