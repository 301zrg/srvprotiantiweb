# 项目开发入口

适用范围：本目录及子目录。先读本文件和任务对应的一个专题，再核对目标源码与测试；无需递归阅读所有文档。当前实现见 [架构](docs/ARCHITECTURE.md)，项目级验收状态见 [当前状态](docs/PROJECT_STATUS.md)。

## 长期约束

- 默认修改限于本项目，保留用户未提交修改。跨项目改动须有任务授权，并遵守目标项目的 AGENTS 与契约。
- 在线裁定在服务端执行，浏览器在线流程不加载 OCGCore／Lua。sql.js SQLite WASM 与离线 Replay Core WASM 是两个不同依赖，不能混淆或误删。
- 原始网络协议是 YGOPro 二进制包；protobuf 只用于内部对象和生成代码。固定协议来源位于 `protocol-source/`，日常构建不依赖旧子模块。
- 配置集中于 `src/variant/`，保持 UI／service／adapter／store 边界。不能只隐藏功能却继续初始化 SSO、请求云卡组或下载不需要的资源。
- TT 沿用 `昵称$密码` 身份认证，`TT` 是另一个房间字段。`JOIN_GAME.pass` 原样取玩家输入；普通房按实际 HostInfo 运行，不自动改成 TT 或强制 Match。
- 冻结已连接会话的身份、房间和 G1 卡组；后续输入修改只影响下一次主动入场。保留 epoch／取消与旧连接隔离，不重放旧操作响应。
- 按用户要求，完整联机输入保存于当前标签页 sessionStorage，localStorage 仅存公开部分；复制按钮不复制密码。一键观战结束清空两类联机缓存，普通输入主动清空后刷新仍为空。
- 2026-10-10 用户决定暂不实施累计在线队列上限（审查项 B），以保留连续动画；不将其当作默认待办。单包和半包限制仍在，接受长时间后台或慢消费导致积压的现状，详见当前架构。
- `resources-staging/1103/` 是用户确认的四语裁剪原件，保持字节不变。中文库统一 ID／datas，其他语言提供文本；清洗仅写生成物。更改生成规则须同步资源审计、revision 和快照。
- 显示语言不改变卡号、协议和规则；对局中切语言不得重连或重置选择。静态资源与前端构建放在天梯服务器之外。
- 只读 Replay 与在线 store／响应 handler 隔离。动作队列仅控制展示，每批末回到 Core 完整查询；播放格式不等于来源 Core／Lua 已完全一致。
- 密码、证书、Token、私密配置、真实玩家未授权的卡组／录像／抓包不得提交。不读取相邻项目私密配置来推断部署状态。
- 文档中的历史授权不授权未来发布；用户当前指令及本会话已明确授权优先。区分代码已实现、本地验证、生产验证和真机验证，不补造通过项。

## 按任务选择入口

| 任务 | 先读 |
| --- | --- |
| 联机协议、WSS、HostInfo | [WSS 联调](docs/wss-integration.md)，按需 [服务端契约](docs/server-contract-audit.md) |
| 联机输入、后台／断线恢复 | [会话恢复](docs/session-recovery.md) |
| 卡组／录像接收、跨窗口权限 | [卡组接收](docs/deck-import.md) 或 [录像接收](docs/replay-import.md) |
| 观战参数、语言参数 | [房间链接](docs/room-spectator-links.md) 或 [语言入口](docs/language-links.md) |
| 卡库、禁表、加载失败 | [资源架构](docs/ARCHITECTURE.md#资源构建与发布)，再读 [资源恢复](docs/resource-recovery.md) |
| 录像 Core、场地、原件存储 | [录像使用](docs/replay-usage.md)，再选 [场地](docs/replay-field-preview.md) 或 [脚本维护](docs/replay-script-maintenance.md) |
| 手机布局、准备页、换备 | [移动界面](docs/mobile-ui.md) 或 [准备页](docs/waitroom-ui.md) |
| 静态构建／发布、托管 | [自动部署](docs/cloudflare-ci.md)，按需 [BiliToy](docs/bilitoy-feasibility.md) |

文档改动检查链接、事实与 diff；协议／状态／权限／卡池改动使用能区分正确与错误行为的样本。UI 改动按模块运行浏览器脚本，类型检查、lint 与构建。没有做真机或正式服验证时如实记录。

历史轮次记录见 [归档](docs/archive/README.md)。只维护受本次改动影响的契约与状态，不把每次局部修复追加为新的长期要求。
