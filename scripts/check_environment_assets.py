"""Check the generated environment and the bundled 1103 test deck."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "public" / "environment" / "1103-201103-v1"
MANIFEST = json.loads((BASE / "manifest.json").read_text(encoding="utf-8"))
LOCALES = ("zh-CN", "en-US", "ja-JP", "ko-KR")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rows(db: sqlite3.Connection, table: str):
    return db.execute(f"SELECT * FROM {table} ORDER BY id").fetchall()


def main() -> None:
    assert MANIFEST["revision"] == BASE.name
    assert MANIFEST["banlistProtocolHash"] == "0x73ec4051"
    banlist = BASE / "lflist.conf"
    assert sha(banlist) == MANIFEST["banlistSha256"]
    contents = banlist.read_text(encoding="utf-8-sig")
    assert "!2011.3.1" in contents
    limits = {int(card): int(count) for card, count in re.findall(r"(?m)^(\d+)\s+([012])", contents)}
    assert len(limits) == 134

    canonical = None
    for locale in LOCALES:
        folder = BASE / locale
        record = MANIFEST["locales"][locale]
        db_path = folder / "cards.cdb"
        assert db_path.read_bytes().startswith(b"SQLite format 3\0")
        assert sha(db_path) == record["cardsSha256"]
        assert sha(folder / "strings.conf") == record["stringsSha256"]
        with sqlite3.connect(db_path) as db:
            assert db.execute("PRAGMA quick_check").fetchone()[0] == "ok"
            data = rows(db, "datas")
            texts = rows(db, "texts")
            assert len(data) == len(texts) == 5267
            assert [row[0] for row in data] == [row[0] for row in texts]
            assert sum(bool(row[4] & 0x4000) for row in data) == 78
            if canonical is None:
                canonical = data
            else:
                assert data == canonical
            if locale in ("zh-CN", "en-US"):
                assert all("706 nexus environment" not in (row[2] or "") for row in texts)
                assert all("706环境" not in (row[2] or "") for row in texts)

    sample = ROOT / "neos-assets" / "structure-decks" / "1103-sample.ydk"
    ids = [int(line) for line in sample.read_text(encoding="utf-8").splitlines() if line.isdigit()]
    assert len(ids) == len(set(ids)) == 40
    with sqlite3.connect(BASE / "zh-CN" / "cards.cdb") as db:
        for card_id in ids:
            row = db.execute("SELECT alias,ot,type FROM datas WHERE id=?", (card_id,)).fetchone()
            assert row is not None and row[0] == 0 and row[1] & 1 and row[2] == 17
            assert limits.get(card_id, 3) > 0
    print("Environment verified: four identical 5267-card rulesets, 2011.3.1 banlist, valid 40-card test deck")


if __name__ == "__main__":
    main()
