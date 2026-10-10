# 文档索引

三项目的 Linux 部署、数据库/录像恢复与换机交接见服务端仓库中的 [统一运维指南](https://github.com/301zrg/srvprotianti/blob/restructure2/ops/README.md)。

更新：2026-10-10。项目介绍与最短本地运行见 [根 README](../README.md)。
项目级现状只维护在 [PROJECT_STATUS](PROJECT_STATUS.md)；专题记录具体契约、操作和证据，
历史清单不能替代当前状态。下面的主题按任务选读，无需通读全部资料。

| 目的 | 入口 |
| --- | --- |
| 接手项目、理解实际模块与数据归属 | [当前架构与四张数据流图](ARCHITECTURE.md)、[当前状态与验收矩阵](PROJECT_STATUS.md) |
| 开发规则、设计取舍、未完成工作 | [AGENTS](../AGENTS.md)、[设计](../YGOPro_706_Web_Client_Design.md)、[剩余工作](../IMPLEMENTATION_PLAN.md) |
| 联机配置、封包与服务端兼容 | [WSS 联调](wss-integration.md)、[服务端契约](server-contract-audit.md)、[会话与后台恢复](session-recovery.md) |
| 通过官网打开卡组、录像或观战 | [卡组接收](deck-import.md)、[录像接收](replay-import.md)、[观战链接](room-spectator-links.md)、[语言参数](language-links.md) |
| 使用录像库、检查播放范围 | [录像使用](replay-usage.md)、[完整场地展示](replay-field-preview.md)、[录像设计及兼容验收](replay-phase2-plan.md) |
| 维护卡库、禁表、加载失败、旧裁定 | [1103 资源审计](1103-resource-audit.json)、[原件说明](../resources-staging/1103/README.md)、[资源恢复](resource-recovery.md)、[禁表诊断](banlist-diagnosis.md)、[录像脚本维护](replay-script-maintenance.md) |
| 手机布局与操作、等待与换备、对局反馈 | [手机界面](mobile-ui.md)、[准备页与双打范围](waitroom-ui.md)、[反馈修复](duel-feedback-fixes.md) |
| 当前外部静态站点发布与 WSS 运维 | [公开配置与迁址](public-deployment-config.md)、[自动部署](cloudflare-ci.md)、[现有服务器上线测试](current-server-online-test.md)、[证书交接](wss-certificate-handoff.md)、[PM2 临时隧道](pm2-quick-tunnel.md) |
| 其他托管平台的可行性 | [BiliToy](bilitoy-feasibility.md)、[微信](wechat-feasibility.md) |
| 上游、早期审查与历史施工 | [上游审计](upstream-audit.md)、[官网交接调研](website-replay-deck-handoff-research.md)、[归档索引](archive/README.md) |

`protocol-source/README.md` 是 [固定协议来源](../protocol-source/README.md) 的唯一说明；
普通构建不要求旧子模块。相邻服务端的字段、权限和数据库契约由服务端仓库维护，
本文不复制第二份。当前设计与交接入口链接到各仓库的公开源码与运维文档；
部分旧专题仍保留用于同级检出工作区的相对路径说明。
单独检出网页项目也能阅读本文、架构页、状态页和客户端接收契约。

增加模块时给出对应源码和专题入口；修改现状时更新状态页及受影响专题。
不要把旧验证失败删去，也不要在多个入口复制一份随时间变化的“当前进度”。
