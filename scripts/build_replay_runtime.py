"""Build the locked, single-threaded historical replay engine with Emscripten.

Ordinary frontend/Cloudflare builds serve these fixed artifacts and do not run
this compiler. No server files or global tool configuration are modified.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "third-party" / "replay"
OUTPUT = ROOT / "public" / "replay" / "706-v1"
BUILD = ROOT / ".audit-tmp" / "replay-build"
LZMA_FILES = (
    "check/crc32_fast.c", "common/common.c", "common/filter_common.c",
    "common/filter_buffer_encoder.c", "common/filter_encoder.c", "common/filter_flags_encoder.c",
    "common/filter_buffer_decoder.c", "common/filter_decoder.c", "common/filter_flags_decoder.c",
    "lzma/lzma_encoder_presets.c", "lzma/lzma_encoder.c", "lzma/lzma_encoder_optimum_fast.c",
    "lzma/lzma_encoder_optimum_normal.c", "lzma/lzma_decoder.c", "lzma/fastpos_table.c",
    "lz/lz_encoder.c", "lz/lz_encoder_mf.c", "lz/lz_decoder.c", "rangecoder/price_table.c",
)
DEFINES = (
    "HAVE_INTTYPES_H=1", "HAVE_STDINT_H=1", "HAVE_STDBOOL_H=1", "HAVE_STRING_H=1",
    "HAVE_STDLIB_H=1", "HAVE_STDIO_H=1", "HAVE_CHECK_CRC32=1", "HAVE_ENCODERS=1",
    "HAVE_ENCODER_LZMA1=1", "HAVE_DECODERS=1", "HAVE_DECODER_LZMA1=1",
    "HAVE_MF_HC3=1", "HAVE_MF_HC4=1", "HAVE_MF_BT2=1", "HAVE_MF_BT3=1", "HAVE_MF_BT4=1",
    "HAVE_VISIBILITY=0", "LZMA_API_STATIC",
)
EXPORTS = (
    "malloc", "free", "replay_clear_resources", "replay_add_cards", "replay_add_script",
    "replay_error", "replay_clear_error", "replay_create", "replay_has_special", "replay_evaluate", "replay_state",
    "replay_decode_lzma", "start_duel", "end_duel", "set_player_info", "new_card", "process",
    "get_message", "set_responseb", "query_card", "query_field_card", "query_field_count", "preload_script",
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--emsdk", type=Path, required=True)
    args = parser.parse_args()
    sdk = args.emsdk.resolve()
    emcc = sdk / "upstream" / "emscripten" / "emcc.py"
    empp = emcc.with_name("em++.py")
    environment = dict(os.environ, EM_CONFIG=str(sdk / ".emscripten"))
    lock = json.loads((SOURCE / "source-lock.json").read_text(encoding="utf-8"))
    for path, digest in lock["files"].items():
        if sha(SOURCE / path) != digest:
            raise ValueError(f"Locked runtime source changed: {path}")
    version = subprocess.check_output([sys.executable, str(empp), "--version"], env=environment, text=True)
    if "4.0.23" not in version:
        raise ValueError("Use the locked Emscripten 4.0.23 toolchain")
    BUILD.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    objects = []
    core_includes = ["-I" + str(SOURCE / "ocgcore"), "-I" + str(SOURCE / "lua" / "src")]
    lzma_includes = ["-I" + str(SOURCE / "lzma" / "src" / part) for part in (
        "common", "liblzma/api", "liblzma/common", "liblzma/check", "liblzma/lzma",
        "liblzma/lz", "liblzma/rangecoder", "liblzma/simple", "liblzma/delta",
    )]
    common = ["-O2", "-fexceptions", "-DNDEBUG"]
    files = [(path, False) for path in sorted((SOURCE / "ocgcore").glob("*.cpp"))]
    files += [(path, False) for path in sorted((SOURCE / "lua" / "src").glob("*.c"))
              if path.name not in ("lua.c", "luac.c")]
    files += [(SOURCE / "lzma" / "src" / "liblzma" / path, True) for path in LZMA_FILES]
    files += [(ROOT / "runtime" / "replay" / "core_bridge.cpp", False)]
    for index, (path, c_language) in enumerate(files):
        name = str(index) + "-" + path.stem
        output = BUILD / (name + ".o")
        includes = lzma_includes if c_language else [*core_includes, *lzma_includes]
        fingerprint = hashlib.sha256((sha(path) + sha(SOURCE / "source-lock.json")
                                      + json.dumps(common + includes) + json.dumps(DEFINES)
                                      + str(c_language) + version).encode()).hexdigest()
        stamp = output.with_suffix(".sha256")
        if not output.exists() or not stamp.exists() or stamp.read_text() != fingerprint:
            command = [sys.executable, str(emcc if c_language else empp), *common, *includes,
                       *(["-std=gnu11", *["-D" + item for item in DEFINES]] if c_language else ["-x", "c++", "-std=c++17"]),
                       "-c", str(path), "-o", str(output)]
            print(f"Compile {index + 1}/{len(files)}: {path.name}", flush=True)
            subprocess.run(command, env=environment, check=True)
            stamp.write_text(fingerprint)
        objects.append(str(output))
    command = [sys.executable, str(empp), *objects, "-O2", "-fexceptions",
               "-sMODULARIZE=1", "-sEXPORT_ES6=1", "-sEXPORT_NAME=create706Core",
               "-sENVIRONMENT=web,worker,node", "-sALLOW_MEMORY_GROWTH=1",
               "-sINITIAL_MEMORY=67108864", "-sMAXIMUM_MEMORY=268435456", "-sSTACK_SIZE=2097152",
               "-sDISABLE_EXCEPTION_CATCHING=0", "-sFILESYSTEM=0",
               "-sEXPORTED_FUNCTIONS=" + json.dumps(["_" + item for item in EXPORTS]),
               '-sEXPORTED_RUNTIME_METHODS=["UTF8ToString","HEAPU8"]', "-o", str(OUTPUT / "ocgcore.js")]
    subprocess.run(command, env=environment, check=True)
    artifact = {"source": {key: value for key, value in lock.items() if key != "files"},
                "bridgeSha256": sha(ROOT / "runtime" / "replay" / "core_bridge.cpp"),
                "memoryLimitBytes": 268435456, "singleThreaded": True,
                "files": {name: {"sha256": sha(OUTPUT / name), "bytes": (OUTPUT / name).stat().st_size}
                          for name in ("ocgcore.js", "ocgcore.wasm")}}
    (OUTPUT / "engine.json").write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print("Built historical replay engine: " + json.dumps(artifact["files"]), flush=True)


if __name__ == "__main__":
    main()
