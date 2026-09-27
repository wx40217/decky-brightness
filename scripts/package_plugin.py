"""Create the layout accepted by Decky's Install Plugin from ZIP."""

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


root = Path(__file__).resolve().parents[1]
package = json.loads((root / "package.json").read_text(encoding="utf-8"))
files = ["plugin.json", "package.json", "main.py", "py_modules/brightness_floor_backend.py", "dist/index.js", "dist/index.js.map", "LICENSE", "README.md", "THIRD_PARTY_NOTICES.md"]
files.extend(str(path.relative_to(root)).replace("\\", "/")
             for path in sorted((root / "licenses").glob("*.txt")))
for name in files:
    if not (root / name).is_file():
        raise SystemExit(f"Missing {name}; run npm run build first")
output = root / "artifacts" / f"decky-brightness-floor-{package['version']}.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, f"decky-brightness-floor/{name}")
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert all(item.filename.startswith("decky-brightness-floor/") for item in archive.infolist())
print(output)
