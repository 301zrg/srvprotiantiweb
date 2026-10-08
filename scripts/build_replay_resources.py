"""Freeze the effective 706 Lua tree and native CardReader table for playback.

The supplied server and specials repositories are read-only inputs. Normal
Cloudflare builds verify and serve these artifacts; they never need this tool.
"""
from __future__ import annotations
import argparse
import gzip
import hashlib
import json
import sqlite3
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/replay/706-v1"
BASE_COMMIT = "5864b6f6e58d49738e0996b94e96655b51f420bf"
SPECIAL_COMMIT = "d6008e9832e5666e665a84dca2e8e59810b3cdfa"

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def head(path: Path) -> str:
    return subprocess.check_output(["git", "-C", str(path), "rev-parse", "HEAD"], text=True).strip()

def card_table(path: Path) -> bytes:
    with sqlite3.connect(path.resolve().as_uri() + "?mode=ro&immutable=1", uri=True) as conn:
        rows = conn.execute("SELECT id,alias,setcode,type,atk,def,level,race,attribute FROM datas ORDER BY id").fetchall()
    cards = {}
    for code, alias, series, kind, attack, defense, level, race, attribute in rows:
        rule = 0
        if code == 5405695 or (alias and not kind & 0x4000 and not abs(code - alias) < 20):
            rule, alias = alias, 0
        codes = [((series & ((1 << 64) - 1)) >> shift) & 0xffff for shift in range(0, 64, 16)]
        codes = [value for value in codes if value] + [0] * 16
        if code in (8512558, 55088578):
            codes[:5] = [0x8f, 0x54, 0x59, 0x82, 0x13a]
        link = defense if kind & 0x4000000 else 0
        cards[code] = [code, alias, codes[:16], kind, level & 0xff, attribute, race,
                       attack, 0 if link else defense, level >> 24 & 0xff, level >> 16 & 0xff, link, rule]
    for card in cards.values():
        if card[1] and not card[-1] and not card[3] & 0x4000 and card[1] in cards:
            card[-1] = cards[card[1]][-1]
    return b"".join(struct.pack("<II16H4I2i4I", c[0], c[1], *c[2], *c[3:]) for c in cards.values())

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server-root", required=True, type=Path)
    parser.add_argument("--specials-root", required=True, type=Path)
    args = parser.parse_args()
    base = args.server_root.resolve() / "ygopro/script"
    specials = args.specials_root.resolve()
    if head(base) != BASE_COMMIT or head(specials) != SPECIAL_COMMIT:
        raise ValueError("Replay script commits do not match the fixed profile")
    for path in (base, specials):
        if subprocess.check_output(["git", "-C", str(path), "status", "--porcelain", "--untracked-files=no"], text=True).strip():
            raise ValueError("Replay script input has tracked modifications")
    effective = {p.relative_to(base).as_posix(): p.read_bytes() for p in base.rglob("*.lua")}
    expansion = args.server_root / "ygopro/expansions/script"
    for p in sorted(expansion.rglob("*.lua")):
        effective[p.relative_to(expansion).as_posix()] = p.read_bytes()
    overrides = specials / "706"
    # Published 706 scripts have the same priority as the production specials tree.
    for p in sorted(overrides.rglob("*.lua")):
        effective[p.relative_to(overrides).as_posix()] = p.read_bytes()
    special = effective["special.lua"]
    original = (base / "utility.lua").read_bytes()
    utility = effective["utility.lua"]
    if utility.count(b"Auxiliary={}") != 1:
        raise ValueError("Unrecognized Auxiliary initialization")
    if b"PreloadUds" in utility:
        # The audited local expansion already embeds the exact 706 hook before
        # any card scripts are loaded. Reuse it; installing twice changes rules.
        if digest(utility) != "e271049430e0f980d4ef3e5f55d92b0778ff82696bbe1fd6a5f49b64f7ce968b":
            raise ValueError("Unrecognized existing bootstrap; review before updating profile")
        if utility.count(b"function Auxiliary.PreloadUds()") != 1 or utility.count(b"\nAuxiliary.PreloadUds()") != 1:
            raise ValueError("Duplicate bootstrap installation")
    else:
        effective["utility.lua"] = utility + b"\n-- Fixed 706 replay bootstrap (once per fresh Lua state).\n" + special + b"\nAuxiliary.PreloadUds()\n"
    index, parts, offset = [], [], 0
    for name, data in sorted(effective.items()):
        if ".." in name or "\\" in name or len(data) > 1024 * 1024:
            raise ValueError("Invalid script path/size")
        index.append({"name": name, "offset": offset, "bytes": len(data), "sha256": digest(data)})
        parts.append(data)
        offset += len(data)
    encoded = json.dumps(index, separators=(",", ":")).encode()
    unpacked = struct.pack("<I", len(encoded)) + encoded + b"".join(parts)
    if len(unpacked) > 64 * 1024 * 1024:
        raise ValueError("Script package exceeds worker budget")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "scripts.data").write_bytes(gzip.compress(unpacked, compresslevel=9, mtime=0))
    cards_path = ROOT / "resources-staging/1103/zh-CN/cards.cdb"
    table = card_table(cards_path)
    (OUT / "cards.data").write_bytes(table)
    (OUT / "scripts-LICENSE.md").write_bytes((base / "LICENSE").read_bytes())
    engine = json.loads((OUT / "engine.json").read_text())
    profile = {"revision": "706-v1", "core": engine["source"]["coreCommit"],
               "baseScripts": BASE_COMMIT, "overrides": SPECIAL_COMMIT,
               "cardDatabaseSha256": digest(cards_path.read_bytes()), "cardCount": len(table) // 80,
               "baseUtilitySha256": digest(original), "specialSha256": digest(special),
               "bootstrapSha256": digest(effective["utility.lua"]),
               "scriptCount": len(index), "unpackedScriptBytes": len(unpacked),
               "provenance": "fixed-local-server-candidate; imported replay provenance is unknown",
               "files": engine["files"]}
    for name in ("scripts.data", "cards.data", "scripts-LICENSE.md"):
        data = (OUT / name).read_bytes()
        profile["files"][name] = {"bytes": len(data), "sha256": digest(data)}
    (OUT / "profile.json").write_text(json.dumps(profile, indent=2) + "\n", encoding="utf-8")
    (ROOT / "src/replay/profile.json").write_text(json.dumps(profile, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"scriptCount": len(index), "unpackedBytes": len(unpacked),
                      "downloadBytes": sum(v["bytes"] for v in profile["files"].values()),
                      "cardCount": profile["cardCount"]}))

if __name__ == "__main__":
    main()
