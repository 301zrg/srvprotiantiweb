"""Vendor the audited C/C++ inputs and lock their exact bytes for replay builds.

Only the web project is written. Pass the read-only SRVPro source directory;
script data is separately packaged by build_replay_resources.py.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE_COMMIT = "e04144d62499c17d0cfa8313f9742434ef99c3a7"
DESTINATION = ROOT / "third-party" / "replay"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server-root", type=Path, required=True)
    args = parser.parse_args()
    game = args.server_root.resolve() / "ygopro"
    core = game / "ocgcore"
    commit = subprocess.check_output(["git", "-C", str(core), "rev-parse", "HEAD"], text=True).strip()
    if commit != CORE_COMMIT:
        raise ValueError("Core revision differs from the audited candidate")
    if subprocess.check_output(["git", "-C", str(core), "status", "--porcelain", "--untracked-files=no"], text=True).strip():
        raise ValueError("Do not vendor a dirty Core tree")
    selected = [(path, Path("ocgcore") / path.name) for path in sorted(core.iterdir())
                if path.suffix in (".cpp", ".h") or path.name in ("LICENSE", "README.md")]
    selected += [(path, Path("lua") / "src" / path.name)
                 for path in sorted((game / "lua" / "src").iterdir()) if path.suffix in (".c", ".h")]
    selected += [(game / "lua" / "doc" / "readme.html", Path("lua") / "readme.html")]
    selected += [(path, Path("lzma") / path.relative_to(game / "lzma"))
                 for path in sorted((game / "lzma" / "src" / "liblzma").rglob("*"))
                 if path.is_file() and path.suffix in (".c", ".h")]
    selected += [(path, Path("lzma") / path.relative_to(game / "lzma"))
                 for path in sorted((game / "lzma" / "src" / "common").rglob("*"))
                 if path.is_file() and path.suffix in (".c", ".h")]
    selected += [(game / "lzma" / name, Path("lzma") / name)
                 for name in ("COPYING", "COPYING.0BSD")]
    files = {}
    for source, relative in selected:
        target = DESTINATION / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        files[relative.as_posix()] = hashlib.sha256(target.read_bytes()).hexdigest()
    lock = {"version": 1, "coreCommit": CORE_COMMIT, "luaVersion": "5.4.8", "lzmaVersion": "5.8.3",
            "emscriptenVersion": "4.0.23", "emsdkCommit": "c0bb220cb6e6f4e0fabb6f6db9efd53390ef5e56",
            "files": files}
    (DESTINATION / "source-lock.json").write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")
    print(f"Vendored {len(files)} source/license files; Core {CORE_COMMIT}, Lua 5.4.8, liblzma 5.8.3")


if __name__ == "__main__":
    main()
