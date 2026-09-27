# Third-party notices

The project's own code is licensed under BSD-3-Clause. Third-party components retain their original licenses. They are not relicensed by the project's LICENSE file.

- Decky plugin template: Steam Deck Homebrew, BSD-3-Clause. The original template license is reproduced in LICENSE.
- `@decky/api` 1.1.3: Steam Deck Homebrew, LGPL-2.1. Source: https://github.com/SteamDeckHomebrew/loader-api and https://www.npmjs.com/package/@decky/api/v/1.1.3. Full license: `licenses/decky-api-LGPL-2.1.txt`. The library is bundled without modifications; the public source and locked build scripts allow rebuilding the bundle with a modified library.
- `@decky/ui` 4.11.0: Steam Deck Homebrew, LGPL-2.1. Source: https://github.com/SteamDeckHomebrew/decky-frontend-lib. UI components are supplied by Decky at runtime. Full license: `licenses/decky-ui-LGPL-2.1.txt`.
- `react-icons` 5.3.0: Copyright 2018 kamijin_fanta, MIT. Its complete distributed notices are retained in `licenses/react-icons.txt`.
- The `FaSun` icon is from Font Awesome Free 5 by Fonticons, Inc., CC BY 4.0. Source: https://github.com/FortAwesome/Font-Awesome/tree/5.15.4. License: https://creativecommons.org/licenses/by/4.0/. It is rendered as SVG through react-icons with no artwork modifications.
- `tslib` 2.8.1: Microsoft Corporation, 0BSD. Full license: `licenses/tslib-0BSD.txt`.

Dependency versions and integrity hashes are recorded in the lockfiles. Development tooling keeps its own package licenses and is not shipped as an installed runtime dependency on the Deck.
