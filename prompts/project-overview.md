# srvprotiantiweb 项目摘要

更新：2026-10-10。用于协作者／工具快速定位，权威模块图与数据流见 [当前架构](../docs/ARCHITECTURE.md)，验收范围见 [当前状态](../docs/PROJECT_STATUS.md)，开发约束见 [AGENTS](../AGENTS.md)。

这是基于 Neos 的 1103／706 历史环境静态网页客户端。React、TypeScript、Ant Design 和 HashRouter 提供四语界面、卡组编辑、Single／Match 联机与换备、观战链接、本地录像保存与固定环境重演。当前功能不包括上游 MyCard SSO／匹配、AI、多环境选择或新的账号后端。

## 实际边界

- 在线：`src/ui/Match/` 冻结会话；`src/infra/stream.ts` 建立 WSS；`src/api/ocgcore/ocgAdapter/` 解析原生 YGOPro 包，`src/service/` 更新 Valtio 在线状态。服务端 SRVPro 的 Core／Lua 裁定，网页只展示与响应。
- 协议：线上为 `uint16LE length + uint8 opcode + payload`，不是 protobuf。`src/api/ocgcore/idl/` 的生成对象仅用于内部适配；固定协议源见 `protocol-source/`。
- 卡库：`src/middleware/sqlite/` 用 sql.js 读取当前语言 CDB，`src/variant/` 管理固定环境、资源、语言与部署配置；SQLite WASM 不是决斗 Core。
- 卡组：`src/service/deck.ts` 与 `deckImport.ts` 管理 IndexedDB 和接收解析，UI 不承担交接权限判断。
- 录像：`src/replay/capture.ts` 在网络到达时独立保存原始包，`library.ts` 管理独立 IndexedDB；`worker.ts`／`engine.ts` 使用固定 Core WASM／Lua 只读重演，独立于在线 store 和选择响应。
- 静态构建：原始四语输入在 `resources-staging/1103/`，环境生成物在 `public/environment/`，固定录像资源在 `public/replay/706-v1/`。`build:static` 从锁定快照还原，不需要 Python／子模块／内核编译；修改资源时走专门维护路径。
- 服务器和官网：身份、房间、计分、数据库属于 `srvprotianti`；静态前端在其外部托管。官网通过 Hash 内容或受限 postMessage 交接卡组／录像／观战参数，客户端不提供任意 URL 或 TCP 代理。

账号 `昵称$密码` 与房间 `房名$房间密码` 保持独立。完整输入存当前标签页 sessionStorage，localStorage 仅存公开部分。已连接会话冻结输入，旧连接不得污染新状态。用户决定暂不改变累计在线消息队列，保留连续动画并接受积压限制。

先按任务路由读一个专题，再查实际源码。不要把 [上游摘要归档](../docs/archive/UPSTREAM_PROJECT_OVERVIEW.md) 中的功能当作本项目现状，不把实现存在或用户上线许可当作生产／真机验证。
