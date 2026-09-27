# Brightness Floor

English · [简体中文](README.md)

A Decky plugin for Steam Deck OLED that remembers a minimum brightness you have checked and limits its own controls to that minimum. Version **0.1.5** supports manual adjustment and reads the system adaptive brightness switch.

[Download the ZIP](https://github.com/wx40217/decky-brightness/releases) · [Report an issue](https://github.com/wx40217/decky-brightness/issues)

> **The default 44% comes only from the author's personal testing on their own Steam Deck OLED. It is not a universal flicker-free threshold.** Other units, SDR/HDR modes, refresh rates and individual perception may differ. 44% does not guarantee comfort or eliminate flicker. Check an acceptable brightness on your own device in the display modes you use, then save your own minimum.

## Install and use

1. Install Decky Loader. Copy `decky-brightness-floor-0.1.5.zip` to the Deck; do not extract it.
2. In Gaming Mode, open Decky settings, enable Developer Mode and select **Install Plugin from ZIP**.
3. Turn off Steam's adaptive brightness and open the plugin. It reads the switch automatically; controls become available when **Adaptive: Off** is shown.
4. Use the slider and ±0.01 / ±0.1 percentage point buttons. **Return to minimum** returns to the saved floor; the default is 44% until you save a custom value.
5. Select **Save current as minimum** to save the exact reported value. To recalibrate below an existing minimum, use Steam's controls to reach a level you have checked, then save it in the plugin. If brightness is unavailable, adjust Steam's brightness slightly to obtain a fresh reading.

Custom values retain their original precision and survive panel closure, restarts and normal updates. Updates do not replace your custom minimum with 44%. The plugin does not change brightness on startup.

The UI and status/error messages support Simplified Chinese and English. Steam's UI language takes priority: Chinese uses Simplified Chinese; other languages use English. If that API is unavailable, the browser's preferred language is used, then English. Reload the plugin or restart Steam after changing Steam's language. Its internal name remains `亮度下限` to preserve plugin identity and settings during updates.

## Scope and limitations

The floor applies **only to controls inside this plugin**. Steam's slider, brightness shortcuts and adaptive brightness can still go below it. Adaptive brightness must be off to use the controls; an enabled or unknown state pauses adjustments. The plugin does not restore brightness after a low-value event or claim global protection.

Only the built-in display in SteamOS Gaming Mode on Steam Deck OLED is supported. An external display, Desktop Mode, another model or an unavailable internal display pauses control. Unloading cleans up listeners and leaves brightness and the adaptive switch as they are.

Displayed percentages are Steam control values, not physical luminance or flicker measurements. Adjustments require a matching system notification before success is confirmed; the hardware determines how many distinct levels are possible. No display driver changes, root flag, dimming overlay or replacement adaptive algorithm are used.

On one Steam Deck OLED running SteamOS 3.8.28, Decky 3.2.9 and Gamescope 3.16.23.6, adjustment and return to the exact floor were verified with the panel closed in Cyberpunk 2077's dynamic 3D benchmark: SDR and HDR10 PQ, at actual 60 and 90 Hz. Actual 45 Hz, sleep/resume, restart and external-display pausing still need verification. The same 44.08136% control value produced different backlight readings in SDR and HDR; these tests do not demonstrate elimination of physical flicker. The MAKO wrapper was temporarily bypassed for HDR and restored afterward; HDR with MAKO remains unverified.

A separate changing-light test reduced native adaptive brightness from 75% to about 58.2% without passing through the frontend `SetBrightness` hook. Native adaptive min/max values could be read, but test writes had no effect. This release therefore does not expose a system adaptive floor. These findings apply to the tested Steam/SteamOS versions.

## Development and distribution

Based on the [official Decky template](https://github.com/SteamDeckHomebrew/decky-plugin-template), using TypeScript, `@decky/api`, `@decky/ui` and Python's standard library. The backend reads device status and persists configuration.

```sh
npm ci
npm run typecheck
npm test
npm run test:python
npm run build
npm run verify:bundle
npm run package
```

GitHub Actions also verifies and builds with pnpm 9 and the committed lockfile. The installation ZIP contains a `decky-brightness-floor/` root and compiled frontend; Node.js is not needed on the Deck. UI translations, including legacy backend messages, live in `src/i18n.ts` and are applied at the display boundary without changing brightness control logic.

This is a development preview distributed independently through GitHub Releases, with no current plan to submit it to the Decky store. Most code was written using generative AI, then checked with tests, builds and real-device validation. The project uses the BSD-3-Clause license; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for third-party licenses.
