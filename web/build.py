#!/usr/bin/env python3
"""Builds web/index.html from index.src.html.

Injects the built-in sheets exported by the core tests (core/build/builtins.json, produced by
`CORE_ONLY=1 ./gradlew :core:test`) and the site version from VERSION.
Run with --bump to increase the version before a new publish.
"""
import datetime, json, pathlib, sys

here = pathlib.Path(__file__).resolve().parent
version_file = here / "VERSION"
version = int(version_file.read_text().strip())
if "--bump" in sys.argv:
    version += 1
    version_file.write_text(f"{version}\n")

src = (here / "index.src.html").read_text()
builtins = (here.parent / "core" / "build" / "builtins.json").read_text()
json.loads(builtins)  # fail early on a bad export
label = f"גרסת אתר {version} · {datetime.date.today():%d.%m.%Y}"

for marker in ("/*BUILTINS*/[]", "/*VERSION*/\"\""):
    if marker not in src:
        sys.exit(f"marker {marker} missing from index.src.html")
out = src.replace("/*BUILTINS*/[]", builtins.replace("</", "<\\/")).replace("/*VERSION*/\"\"", json.dumps(label, ensure_ascii=False))
(here / "index.html").write_text(out)
print(label)
