# 706 天梯 YGOPRO 网页客户端

基于 [DarkNeos/neos-ts](https://github.com/DarkNeos/neos-ts) 的 1103 历史环境客户端，支持手机和桌面。玩家填写昵称与房间名：`TT` 进入天梯，其他房名沿用服务器规则。对战地址由站方固定；网页、卡库和录像资源放在外部 HTTPS 静态站点，在线裁定由 SRVPro 执行。

当前提供四语卡库与界面、卡组编辑和 YDK 导入／导出、Single／Match 联机与换备、房间链接观战、后台恢复、本地录像库和固定环境的只读录像重演，以及官网卡组／录像接收入口。录像播放仅支持已确认的格式与固定资源；完整双打、其他 Core 版本和云同步不属于已完成能力。具体范围和已测证据见 [当前状态](docs/PROJECT_STATUS.md)，模块与数据流见 [架构图](docs/ARCHITECTURE.md)。

首次未保存房名时预填 `TT`，仍需手动连接。账号 `昵称$密码` 与 `房名$房间密码` 分开处理；完整输入保存在当前标签页 sessionStorage，公开部分保存在 localStorage。玩家主动清空的输入继续保持为空，一键观战结束后清空联机输入。详见 [输入与会话恢复](docs/session-recovery.md)。

## 本地静态试用

安装 Node.js 和 npm；这条路径使用仓库内固定资源，不需要 Python、Emscripten 或初始化 git submodule：

```sh
npm ci --include=dev
npm run build:static
npm run preview:static
```

打开命令输出的本机地址。没有对战配置时仍可组卡和使用录像库，联机页会提示未配置。需要联机时，将 [.env.example](.env.example) 复制为不入库的 `.env.local`，设置 `VITE_DUEL_WS_URL=wss://实际地址/neos`，再构建。公开的站方 `duel-config.js` 可以覆盖构建入口，不能包含密码或 Token；详见 [WSS 配置](docs/wss-integration.md)。

服务器迁址时，自动构建与手工包可一同传入 WSS、官网地址及卡组／录像来源白名单；完整输入、原有缺省值和空白名单行为见 [公开发布配置](docs/public-deployment-config.md)。

修改卡库生成规则或使用 Vite 开发服务器时，需要 Python 3，并执行 `npm run dev`；修改原生录像资源才需要额外的内核编译工具。两类资源的来源锁与维护路径见 [资源架构](docs/ARCHITECTURE.md#资源构建与发布)。日常构建不重新编译 Core 或 protobuf。

## 文档与开发

- [文档索引](docs/README.md)：按使用、架构、接口、资源、发布和验收查找专题。
- [当前状态与验证边界](docs/PROJECT_STATUS.md)：唯一项目级现状入口。
- [当前架构与数据流](docs/ARCHITECTURE.md)：实际目录、四张图、配置和存储归属。
- [开发约束与任务入口](AGENTS.md)、[设计理由](YGOPro_706_Web_Client_Design.md)、[剩余工作](IMPLEMENTATION_PLAN.md)。
- [录像使用](docs/replay-usage.md)、[卡组接收](docs/deck-import.md)、[录像接收](docs/replay-import.md)、[观战链接](docs/room-spectator-links.md)。
- [外部静态站点自动发布](docs/cloudflare-ci.md)：`deploy/cloudflare` 是已配置的发布分支，更新它会触发上线；普通工作分支不会自动发布。

按改动选检查：文档检查链接与事实；协议改动运行相应封包／会话回归；资源改动核对 SHA 与 revision；UI 改动运行对应浏览器脚本、类型检查、lint 和构建。浏览器模拟不代替 Android／iOS 真机。原始输入与私密配置保持不变，未授权卡组、录像和凭据不入库。

上游介绍和原施工记录见 [历史归档](docs/archive/README.md)。原在线首版约 12.7 MB 的数字仅是录像资源加入前的历史测量，不能作为当前完整包体或首屏流量。

## 版权声明 / Copyright notice

**中文：** 本网页项目为开源、非盈利的爱好者项目。游戏王相关名称、卡图等素材的版权归各自权利人所有。如相关权利人提出要求，本网页可能随时调整或下架，敬请理解。

**English:** This is an open-source, non-profit fan project. Yu-Gi-Oh! names, card artwork and other materials belong to their respective rights holders. This website may be changed or taken offline at any time at their request. Thank you for your understanding.

**日本語：** 本サイトはオープンソース・非営利のファンプロジェクトです。遊戯王の名称、カード画像などの権利は各権利者に帰属します。権利者からの要請により、予告なく変更または公開を終了する場合があります。ご了承ください。

**한국어:** 이 웹사이트는 오픈 소스 비영리 팬 프로젝트입니다. 유희왕 명칭, 카드 이미지 등 자료의 권리는 각 권리자에게 있습니다. 권리자의 요청에 따라 언제든지 사이트를 변경하거나 운영을 중단할 수 있으니 양해 부탁드립니다.

源码许可证见 [LICENSE](LICENSE)。第三方代码及素材的权利和许可分别适用其原有声明，本说明不更改现有许可证。
