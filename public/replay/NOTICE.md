# 录像内核与脚本来源

网页客户端修改自 [DarkNeos/neos-ts](https://github.com/DarkNeos/neos-ts)。
录像重演采用固定的历史 YGOPro Core（MIT）、Lua 5.4.8（MIT）及 liblzma 5.8.3（0BSD）。
对应 C/C++ 源文件、原许可证、修改后的桥接代码及编译脚本位于本项目仓库 `third-party/replay`、`runtime/replay` 和 `scripts`。

卡片 Lua 来自固定的 YGOPro 基础脚本与 [301zrg/specials](https://github.com/301zrg/specials) 的 706 覆盖；保留 [脚本 GPL v2 许可证](706-v1/scripts-LICENSE.md)。
`706-v1/scripts.data` 是完整的对应 Lua 源码包（gzip：4 字节小端索引长度、JSON 索引、依次连接的源码字节），包括实际使用的旧裁定 utility。没有下载新版脚本覆盖录像环境。

固定版本与各文件摘要见 `706-v1/profile.json`。导入录像文件本身不证明其来自这些脚本版本；播放不一致时保留原件并报告错误。
