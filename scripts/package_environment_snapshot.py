"""Lock the reviewed generated environment for Python-free static CI builds.

Run build_environment_assets.py and check_environment_assets.py first. Source
files and generation rules are fingerprinted so CI cannot publish stale cards.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVISION = "1103-201103-v1"
LOCALES = ("zh-CN", "en-US", "ja-JP", "ko-KR")
SOURCE = ROOT / "resources-staging" / "1103"
OUTPUT = ROOT / "public" / "environment"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def input_sha(path: str) -> str:
    data = (ROOT / path).read_bytes()
    if path.startswith(("docs/", "scripts/")):
        data = data.replace(b"\r\n", b"\n")
    return sha(data)


def main() -> None:
    for script in ("build_environment_assets.py", "check_environment_assets.py"):
        subprocess.run([sys.executable, str(ROOT / "scripts" / script)], check=True)
    inputs = ["docs/1103-resource-audit.json", "scripts/build_environment_assets.py",
              "scripts/check_environment_assets.py"]
    inputs += [f"resources-staging/1103/{locale}/{name}" for locale in LOCALES
               for name in ("cards.cdb", "strings.conf")]
    inputs += ["resources-staging/1103/lflist.conf"]
    paths = ["current.json", f"{REVISION}/manifest.json", f"{REVISION}/lflist.conf"]
    paths += [f"{REVISION}/{locale}/{name}" for locale in LOCALES
              for name in ("cards.cdb", "strings.conf")]
    files, body = [], bytearray()
    for path in paths:
        data = (OUTPUT / path).read_bytes()
        files.append({"path": path, "bytes": len(data), "sha256": sha(data)})
        body.extend(data)
    manifest = json.loads((OUTPUT / REVISION / "manifest.json").read_text(encoding="utf-8"))
    if manifest["revision"] != REVISION or manifest["cardCount"] != 5267:
        raise ValueError("Build and verify the reviewed environment before packaging")
    for locale in LOCALES:
        for name, field in (("cards.cdb", "cardsSha256"), ("strings.conf", "stringsSha256")):
            if sha((OUTPUT / REVISION / locale / name).read_bytes()) != manifest["locales"][locale][field]:
                raise ValueError(f"Generated resource hash mismatch: {locale}/{name}")
    if sha((OUTPUT / REVISION / "lflist.conf").read_bytes()) != manifest["banlistSha256"]:
        raise ValueError("Generated banlist hash mismatch")
    compressed = gzip.compress(bytes(body), compresslevel=9, mtime=0)
    lock = {
        "version": 1,
        "revision": REVISION,
        "inputs": {path: input_sha(path) for path in inputs},
        "archive": {"file": "environment-v1.data", "bytes": len(compressed),
                    "sha256": sha(compressed), "decodedBytes": len(body)},
        "files": files,
    }
    previous = SOURCE / "environment-v1.json"
    if previous.exists() and json.loads(previous.read_text(encoding="utf-8")) != lock:
        raise ValueError("Immutable snapshot changed: use a new resource revision before repackaging")
    (SOURCE / "environment-v1.data").write_bytes(compressed)
    (SOURCE / "environment-v1.json").write_text(
        json.dumps(lock, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )
    print(f"Locked {REVISION}: {len(files)} files, {len(compressed):,} compressed bytes")


if __name__ == "__main__":
    main()
