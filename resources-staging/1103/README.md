# 1103 四语资源原件

这里保留从 `F:/MyCardLibrary/koishipro/KoishiPro-master-win32-zh-CN/locales/1103_*` 复制的四份裁剪 CDB 与对应 `strings.conf`，以及用户指定的 `expansions/lflist.conf`。这些文件是只读构建输入；网页发布库由 `scripts/build_environment_assets.py` 生成在 `public/environment/1103-201103-v1/`，不会覆盖原件。

| 语言 | 原件 | 源 CDB SHA-256 | 原始行数 |
| --- | --- | --- | ---: |
| 简体中文 | `zh-CN/cards.cdb` | `fd5931455abab8cdf38febc00f2ef4296de4bb69f0b9bb702f5ff37412fddc83` | 5,267 |
| English | `en-US/cards.cdb` | `da653c64b3eb344db42ae5a72127da4ae390ace20bdb256271576cf164c54ea8` | 5,240 |
| 日本語 | `ja-JP/cards.cdb` | `64b7c595d3ab765d89d85bfd1c6a3d55c7ecfda568ebcf647689a56728e7f90c` | 5,267 |
| 한국어 | `ko-KR/cards.cdb` | `c68e4052a79fcd539aec6eb7eda9824e019f6818242bf8b163a85072d2331074` | 5,267 |

发布副本统一采用中文库的 5,267 个卡号与 datas；英文缺失的 27 个异画文本从同语言 alias 原卡补齐；仅精确移除中文／英文描述末尾经审计的 706 搜索标记，并修复五张英文卡的列表符。四语发布库均通过 SQLite 完整性检查且 datas 完全相同。2011.3.1 禁表共 134 项，协议 hash 为 `0x73ec4051`。原件与处理规则详见 [资源审计](../../docs/1103-resource-audit.json)；`npm run check:environment` 会复核输出与首发示例卡组。

当前四份原 CDB 合计约 7.78 MiB，无需 Git LFS。任何资源或规则变更必须提升环境 revision，避免同一静态 URL 对应不同字节。构建产物上传外部静态托管，天梯服务器不承载这些文件。
