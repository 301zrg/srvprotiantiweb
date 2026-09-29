# Neos 上游核查

核查日期：2026-09-28；整理日期：2026-09-29。通过公开 Git ref 与固定提交源码核查，未安装依赖或运行上游构建。

基线：`DarkNeos/neos-ts@a84c443674f82d6d47969915e6cb8656660be364`。
neos-protobuf gitlink：`81291cac39ba7c726ef817166c41e028bd0a4e8b`。

| 范围 | 源码事实 | 实施影响 |
| --- | --- | --- |
| `src/api/ocgcore/ocgAdapter/packet.ts` | serialize 为 uint16LE 长度、uint8 opcode、payload；deserialize 循环拆粘包但用 getInt16/getInt8 | WS 是原生二进制；补无符号长度、完整性、上限与必要的半包缓冲 |
| `src/api/ocgcore/ocgHelper.ts` | 构造内部消息对象，再经 adapter serialize | protobuf 是内部模型，不是 WS 的另一层 wire format |
| `neos.config.json` | version=4962，即 0x1362 | 与本地 core 源码相符，生产版本仍须握手验证 |
| `src/infra/stream.ts` | URL 拼接 wss://；close 未完整结束消息读取链 | 支持完整 ws/wss URL，补生命周期与取消 |
| `src/middleware/sqlite/index.ts` | 使用 sql.js / sql-wasm.wasm | 在线允许 SQLite WASM，不应把它当 Replay Core 删除 |
| `src/api/ocgcore/replay.ts` | yrp3d 的 func/length/data 转 STOC_GAME_MSG | 没有现成的标准 YRP Core 播放能力 |
| `src/middleware/socket.ts` | 静态引用现有 Replay 路径 | 仅隐藏按钮不保证录像运行时被拆包，需检查 bundle 图 |
| `src/hook/useAdaptiveViewportScale.ts` | 对桌面基准尺寸整体缩放，最小比例可到 0.3 | 有适配基础，但不证明手机控件足够可用 |
| 卡组编辑交互 | 有 HTML5toTouch，也有右键删除／中键换区 | 补显式触控按钮，不能只测拖拽 |
| `index.html` | 缺少 viewport meta | 补移动视口并实测浏览器工具栏、软键盘 |
| `src/ui/Layout/index.tsx` | waitroom/duel/side 隐藏 Header | 全局语言按钮不能只放 Header |
| `src/service/room/joinGame.ts` | 主要标记已加入，没有落实完整 HostInfo 规则展示 | 展示实际规则；TT核对MR2／禁表／Match，普通房按HostInfo运行Single／Match，不强制TT参数 |
| `playwright.config.ts` | 桌面 Chrome 项目 | 增加移动设备／WebKit 回归，另做 Android／iOS 真机 |
| `package.json` | build 有 cp -r，e2e 有 POSIX 环境变量／sh | 不直接宣称 PowerShell 下可用，先建立明确环境基线 |
| `src/api/ocgcore/idl/ocgcore.ts` | 生成代码已提交 | 未改协议时构建不必强制重新运行 protoc |
| `LICENSE` | GPL-3.0 | 保留许可、版权及对应源码；其他素材单独记录来源 |

源码入口（均应按上述 SHA 查看）：

- [完整固定版本](https://github.com/DarkNeos/neos-ts/tree/a84c443674f82d6d47969915e6cb8656660be364)。
- [Packet adapter](https://github.com/DarkNeos/neos-ts/blob/a84c443674f82d6d47969915e6cb8656660be364/src/api/ocgcore/ocgAdapter/packet.ts)。
- [响应式缩放](https://github.com/DarkNeos/neos-ts/blob/a84c443674f82d6d47969915e6cb8656660be364/src/hook/useAdaptiveViewportScale.ts)。
- [房间加入](https://github.com/DarkNeos/neos-ts/blob/a84c443674f82d6d47969915e6cb8656660be364/src/service/room/joinGame.ts)。
- [构建脚本与依赖](https://github.com/DarkNeos/neos-ts/blob/a84c443674f82d6d47969915e6cb8656660be364/package.json)。

本次 git clone 未完成，临时目录不可用于证明构建通过。没有对上游源代码作功能修改，也没有运行真实联网 e2e。
