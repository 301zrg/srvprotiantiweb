"""Build four display databases from the reviewed 1103 source snapshots.

Only files below public/environment are generated. The staged CDBs are immutable inputs.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "resources-staging" / "1103"
AUDIT = ROOT / "docs" / "1103-resource-audit.json"
REVISION = "1103-201103-v1"
OUTPUT = ROOT / "public" / "environment"
REVISION_DIR = OUTPUT / REVISION
LOCALES = ("zh-CN", "en-US", "ja-JP", "ko-KR")
TEXT_FIELDS = ("id", "name", "desc", *(f"str{i}" for i in range(1, 17)))
SUFFIXES = {
    "zh-CN": "★706环境",
    "en-US": "★706 nexus environment",
}
ENGLISH_BROKEN_BULLETS = {17032740, 33900648, 52675689, 63485233, 73853830}
EXPECTED_INPUT_ROWS = {"zh-CN": 5267, "en-US": 5240, "ja-JP": 5267, "ko-KR": 5267}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_only(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path.as_uri() + "?mode=ro&immutable=1", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def source_rows(path: Path, table: str) -> dict[int, tuple]:
    with read_only(path) as conn:
        if conn.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise ValueError(f"SQLite check failed: {path}")
        return {row[0]: tuple(row) for row in conn.execute(f"SELECT * FROM {table} ORDER BY id")}


def strip_reviewed_suffix(description: str, locale: str) -> tuple[str, bool]:
    suffix = SUFFIXES.get(locale)
    if not suffix:
        return description, False
    cleaned, count = re.subn(r"(?:\r?\n){2}" + re.escape(suffix) + r"\Z", "", description)
    return cleaned, count == 1


def corrected_english_bullets(description: str, card_id: int) -> tuple[str, int]:
    if card_id not in ENGLISH_BROKEN_BULLETS:
        return description, 0
    # The five reviewed source descriptions contain U+FFFD pairs at list starts.
    corrected, count = re.subn(r"(?m)^(?:\ufffd){2}", "• ", description)
    return corrected, count


def verify_banlist(path: Path) -> None:
    if digest(path) != "ea375c0874c8674aac515e6020aa7db85b372608eebeb15e6896fc108143a1cc":
        raise ValueError("Banlist source SHA does not match the reviewed 2011.3.1 file")
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    if lines.count("!2011.3.1") != 1:
        raise ValueError("Expected exactly one !2011.3.1 banlist")
    counts = {0: 0, 1: 0, 2: 0}
    for line in lines:
        match = re.fullmatch(r"(\d+)\s+([012])(?:\s+.*)?", line)
        if match:
            counts[int(match.group(2))] += 1
    if counts != {0: 50, 1: 66, 2: 18}:
        raise ValueError(f"Unexpected banlist counts: {counts}")


def main() -> None:
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    source_cdb = {locale: SOURCE / locale / "cards.cdb" for locale in LOCALES}
    for locale, path in source_cdb.items():
        if path.read_bytes()[:16] != b"SQLite format 3\0":
            raise ValueError(f"Not a SQLite database (possibly an LFS pointer): {path}")
        if digest(path) != audit["databases"][locale]["sha256"]:
            raise ValueError(f"Source CDB changed since audit: {path}")

    # A published revision is immutable. Verify it and stop before opening any
    # output database for writing; an altered generator requires a new revision.
    existing_manifest = REVISION_DIR / "manifest.json"
    if existing_manifest.exists():
        saved = json.loads(existing_manifest.read_text(encoding="utf-8"))
        if saved.get("revision") != REVISION or saved.get("source") != {
            locale: digest(path) for locale, path in source_cdb.items()
        }:
            raise ValueError("Existing resource revision does not match reviewed sources")
        for locale in LOCALES:
            record = saved["locales"][locale]
            if digest(SOURCE / locale / "strings.conf") != record["stringsSha256"]:
                raise ValueError(f"Staged strings changed for {locale}; bump REVISION")
            if digest(REVISION_DIR / locale / "cards.cdb") != record["cardsSha256"]:
                raise ValueError(f"Published CDB changed for {locale}")
            if digest(REVISION_DIR / locale / "strings.conf") != record["stringsSha256"]:
                raise ValueError(f"Published strings changed for {locale}")
        if digest(SOURCE / "lflist.conf") != saved["banlistSha256"] or digest(REVISION_DIR / "lflist.conf") != saved["banlistSha256"]:
            raise ValueError("Banlist changed; bump REVISION")
        (OUTPUT / "current.json").write_text(
            json.dumps({"revision": REVISION, "manifest": f"./{REVISION}/manifest.json"}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Verified immutable {REVISION}: four databases with {saved['cardCount']} matching cards")
        return

    canonical_data = source_rows(source_cdb["zh-CN"], "datas")
    if len(canonical_data) != 5267:
        raise ValueError("Chinese source no longer contains the reviewed 5267 cards")
    source_texts = {locale: source_rows(path, "texts") for locale, path in source_cdb.items()}
    for locale, texts in source_texts.items():
        if len(texts) != EXPECTED_INPUT_ROWS[locale]:
            raise ValueError(f"Unexpected {locale} source text count")

    missing_en = set(canonical_data) - set(source_texts["en-US"])
    reviewed_en = {item["id"]: item["alias"] for item in audit["englishMissingAliasRecovery"]}
    if missing_en != set(reviewed_en) or len(missing_en) != 27:
        raise ValueError("English alternative art set changed")
    for card_id, alias in reviewed_en.items():
        if canonical_data[card_id][2] != alias or alias not in source_texts["en-US"]:
            raise ValueError(f"English alternative art alias changed for {card_id}")
    for locale in ("ja-JP", "ko-KR"):
        if set(source_texts[locale]) != set(canonical_data):
            raise ValueError(f"Unexpected {locale} card ID set")

    banlist = SOURCE / "lflist.conf"
    verify_banlist(banlist)
    prospective = {"environment": "1103-706", "revision": REVISION, "poolCutoff": "2011-08-31",
                   "banlist": "2011.3.1", "banlistProtocolHash": "0x73ec4051", "cardCount": len(canonical_data),
                   "source": {locale: digest(path) for locale, path in source_cdb.items()}, "locales": {}}
    REVIEWED_SUFFIX_COUNT = {"zh-CN": 5267, "en-US": 5267}
    for locale in LOCALES:
        target_dir = REVISION_DIR / locale
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / "cards.cdb"
        shutil.copyfile(source_cdb["zh-CN"], target)
        missing_texts = []
        suffix_count = bullet_count = 0
        with sqlite3.connect(target) as conn:
            conn.execute("DELETE FROM texts")
            placeholders = ",".join("?" for _ in TEXT_FIELDS)
            query = f"INSERT INTO texts ({','.join(TEXT_FIELDS)}) VALUES ({placeholders})"
            for card_id in sorted(canonical_data):
                text_row = source_texts[locale].get(card_id)
                if text_row is None and locale == "en-US":
                    text_row = source_texts[locale][reviewed_en[card_id]]
                    missing_texts.append(card_id)
                if text_row is None:
                    raise ValueError(f"No reviewed {locale} text for {card_id}")
                text_row = (card_id, *text_row[1:])
                description, removed = strip_reviewed_suffix(text_row[2] or "", locale)
                if removed:
                    suffix_count += 1
                if locale == "en-US":
                    description, corrected = corrected_english_bullets(description, card_id)
                    bullet_count += corrected
                if "\ufffd" in description:
                    raise ValueError(f"Unreviewed replacement character in {locale} card {card_id}")
                conn.execute(query, (text_row[0], text_row[1], description, *text_row[3:]))
            conn.commit()
            conn.execute("VACUUM")
        if locale in REVIEWED_SUFFIX_COUNT and suffix_count != REVIEWED_SUFFIX_COUNT[locale]:
            raise ValueError(f"Unexpected {locale} suffix count: {suffix_count}")
        if locale == "en-US" and bullet_count != 13:
            raise ValueError(f"Unexpected English bullet repair count: {bullet_count}")
        output_data = source_rows(target, "datas")
        output_texts = source_rows(target, "texts")
        if output_data != canonical_data or set(output_texts) != set(canonical_data):
            raise ValueError(f"Generated {locale} CDB failed canonical checks")
        for card_id, row in output_texts.items():
            if strip_reviewed_suffix(row[2] or "", locale)[1]:
                raise ValueError(f"Remaining search suffix in {locale} card {card_id}")
        strings = SOURCE / locale / "strings.conf"
        shutil.copyfile(strings, target_dir / "strings.conf")
        prospective["locales"][locale] = {
            "cards": f"./{locale}/cards.cdb", "cardsSha256": digest(target), "cardsBytes": target.stat().st_size,
            "strings": f"./{locale}/strings.conf", "stringsSha256": digest(strings),
            "recoveredAlternativeArtTextCount": len(missing_texts),
            "removedSearchSuffixCount": suffix_count, "correctedBulletCount": bullet_count,
        }

    shutil.copyfile(banlist, REVISION_DIR / "lflist.conf")
    prospective["banlistSha256"] = digest(banlist)
    manifest_path = REVISION_DIR / "manifest.json"
    if manifest_path.exists():
        old = json.loads(manifest_path.read_text(encoding="utf-8"))
        if old != prospective:
            raise ValueError("Immutable resource revision has changed; bump REVISION")
    manifest_path.write_text(json.dumps(prospective, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT / "current.json").write_text(
        json.dumps({"revision": REVISION, "manifest": f"./{REVISION}/manifest.json"}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Built {REVISION}: four databases with {len(canonical_data)} matching cards")


if __name__ == "__main__":
    main()
