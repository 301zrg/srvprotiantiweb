# Fixed upstream protocol source

`neos-protobuf/idl/ocgcore.proto` and its license are copied byte-for-byte from
`https://code.mycard.moe/mycard/neos-protobuf.git`, commit
`81291cac39ba7c726ef817166c41e028bd0a4e8b`. SHA-256 fingerprints are in
`neos-protobuf/source.json`. This replaces the old Git submodule so a fresh clone
and Cloudflare checkout do not depend on reaching that separate upstream host.

Generated TypeScript remains tracked in `src/api/ocgcore/idl/` and is unchanged.
Normal static/Cloudflare builds do not run protoc. Only protocol maintenance
needs the existing protoc/TypeScript generator toolchain and `bash sync_proto.sh`.
When intentionally updating the schema, update the pinned source/license/lock
and generated code together, then run the adapter, packet and type checks.

An existing local `neos-protobuf` checkout is preserved and ignored; do not delete
another developer's checkout or initialize it during CI.
