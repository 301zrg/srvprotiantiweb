#!/bin/bash
set -euo pipefail
# 更新PB代码
protoc -I=./protocol-source/neos-protobuf --ts_out=./src/api/ocgcore ./protocol-source/neos-protobuf/idl/ocgcore.proto
npx eslint --ext .ts --ext .tsx src --fix
