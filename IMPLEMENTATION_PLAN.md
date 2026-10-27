# 剩余工作与验收入口

更新：2026-10-10。已实现能力和已测证据统一在 [当前状态](docs/PROJECT_STATUS.md)。本文件只列真实未完成的实现或验收，不表示用户已授权执行所有项目。

## 当前仍需验收

| 项目 | 要补的证据 | 方法／入口 |
| --- | --- | --- |
| 正式房间规则与禁表 | 正式文件替换后新房 HostInfo hash、MR2 与卡池拒绝；不能沿用修改前老房 | [禁表诊断](docs/banlist-diagnosis.md)、[正式服测试](docs/current-server-online-test.md) |
| 正式 TT 完整比赛与后台恢复 | G1–G3／两次换备／结算；实际断线、同身份恢复失败与成功的边界 | [会话恢复](docs/session-recovery.md)、[WSS 联调](docs/wss-integration.md) |
| Android／iOS 真机 | 横竖屏完整比赛、触屏选择与换备、输入法、文件导入／下载／分享、后台与音频 | [移动复测](docs/mobile-ui.md)、[录像使用](docs/replay-usage.md) |
| 录像来源与旧裁定兼容 | 更多获授权的生产样本，与实际 Core／Lua／special 指纹和原生查询比较 | [录像计划](docs/replay-phase2-plan.md)、[规则维护](docs/replay-script-maintenance.md) |
| 官网交接的实际上线 | 前端版本先到位，再核对官网按钮、精确 Origin、卡组可见性和原件下载 | [卡组接收](docs/deck-import.md)、[录像接收](docs/replay-import.md) |
| 长期 WSS 与性能 | 固定入口、真实 IP／Origin、延迟和资源占用；当前包体／首屏／首播按对应提交实测 | [WSS 证书交接](docs/wss-certificate-handoff.md)、[自动部署](docs/cloudflare-ci.md) |

本地通过项不重复标为“待实现”；新增验收记录应包含源码版本、样本、环境与日期。历史 Quick Tunnel 地址会变化，不能从旧截图或记录推断当前地址。

## 尚未纳入完成范围

完整 Tag 双打（不等于已有四席准备页）、其他版本／格式的标准录像播放、多环境选择、云同步与 PWA 均需单独需求和兼容方案。BiliToy 真实平台上传与账号／域名权限仍按其专题验证。

累计在线队列上限（B）已由用户决定暂不实施，接受慢设备／长时间后台的积压现状；不把这项重新加入自动施工。未来若需求改变，先确认动画取消、状态恢复和录像原件边界。

## 历史施工记录

原 P0–P5、R0–R4 清单及早期基线保留在 [整理前施工记录](docs/archive/IMPLEMENTATION_PLAN_2026-10-10.md)。其中“未开工”“未合入”和旧子模块描述只反映当时阶段；当前架构以 [实装说明](docs/ARCHITECTURE.md) 为准。历史证据可继续引用，未执行项目不能因后续上线授权而补勾。
