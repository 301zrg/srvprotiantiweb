# 四语言入口与文案

网页版支持 `lang=zh|en|ja|ko`，分别为中文、英文、日文和韩文。例如：

```text
https://ocg1103nexus.com/?lang=en
https://ocg1103nexus.com/?lang=ja#/match?room=公开房名&spectate=1
https://ocg1103nexus.com/?lang=ko#/import?（原卡组参数）
https://ocg1103nexus.com/?lang=zh#/replay-import?（原录像参数）
```

`lang` 可放在网页查询参数或 hash 路由的查询参数中。有效 hash 值优先于有效网页值，
随后才使用保存的偏好、浏览器语言和英文默认值。不支持的值忽略；兼容 `cn`、
`zh-CN`、`en-US`、`ja-JP`、`ko-KR`，大小写不敏感。对外新链接统一生成短代码。

在路由捕获并清理卡组／录像内容参数**之前**读取语言，因此接收页面、首次卡库和
系统 strings 采用同一语言。成功进入界面后保存语言偏好；受限存储下仍保留本标签页
选择。手动切换会更新当前 URL 已有的 `lang`，刷新不会重新恢复链接的旧语言；普通
导航继续沿用当前偏好。仅用于初始化显示，不改变房间、玩家身份、卡号、规则或 WSS。
已有房间参数、卡组来源限制、密码不进 URL 等约束继续有效。

天梯官网的 `L=ja|en|ko` 是官网自己的参数。`SrvproWeb.clientEntry()` 将官网当前语言
转换为网页版的 `lang`，中文也明确发送 `lang=zh`，覆盖网页版之前保存的其他语言。
顶部开玩、房间观战、公开卡组、认证卡组交接、录像链接和大文件交接共用此入口；
在官网菜单切语言后，后续点击采用新语言。域名仍只配置在官网的 `web-client-config.js`。

## 本轮文案修正

- 补全韩语 UI 词库，以及日语缺失的观战／历史文案和三语恢复默认设置文案。
- Ant Design 与 Pro Components 的分页、空数据、弹窗等内置文字随语言切换。
- 加载、筛选提示、宣言、确认／取消、指示物、排序、胜负和换备先后攻支持四语。
- 非法卡组、换备失败与决斗操作提示支持四语；切换语言时重绘当前操作提示，
  不清空局面或发送决斗响应。
- 录像库说明、导入／存储／错误提示、回放进度和操作历史支持四语。保留动作数据，
  切语言时重新生成旧历史及卡名；旧文件保存的格式原因和 Worker 诊断按当前语言显示。
- 卡片详情类型缓存、表示形式弹窗、语言选择器与辅助朗读文案随当前界面更新。
- 官网介绍页复制成功／失败提示，以及房间列表更新时间采用选定语言。

服务器发来的聊天、玩家昵称、房间名、卡组名、文件名和作者／群名称保留原内容。
收到的服务端历史消息不会追溯翻译；入房及手动切语言继续发送 `/zh /en /ja /ko`。
原始外部异常保留诊断内容，不把系统错误当作玩家文字自动翻译。

## 验证

```powershell
node --experimental-strip-types scripts/test_language_links.mjs
node scripts/test_language_hints.mjs
node scripts/language_link_ui.mjs
node scripts/language_dialog_ui.mjs
```

后两条使用现有 `dist`，需先构建。弹窗测试通过隔离 WebSocket 输入原生
STOC，检查四语表示形式、确认／取消、卡片宣言及胜负，同时校验 CTOS 响应。
官网真实卡组／录像交接由相邻项目的
`plugins/ladder-web/tests/deck-web-open-ui.mjs --rooms` 与
`plugins/ladder-web/tests/replay-web-open-ui.mjs` 验证。测试只用本地脱敏样本与隔离服务器；
桌面及触屏尺寸回归不替代真实 iOS Safari 验收。

2026-10-09 已通过 TypeScript、修改文件 ESLint、最终 Cloudflare 静态构建、
四语词库／插值完整性、55 种录像诊断、非法卡组和换备提示、桌面及 390px 触屏
语言入口／卡库／导入／手动切换刷新回归、录像存储回归。官网八页及两个别名的
四语界面、真实卡组／录像交接及下载亦已在本地通过。
桌面及触屏四语决斗弹窗回归已通过：32 个弹窗显示检查及 24 个原生响应校验，
覆盖表示形式、确认／取消、卡片宣言和胜负；每个用例只入房一次。

隔离 SRVPro 的真实 WSS 联调已验证四语指令、服务端回复、再次入房及手动准备；
运行 `python scripts/make_local_cert.py .audit-tmp/local-cert` 后执行
`node scripts/local_wss_integration.mjs --languages --built` 可复查。
未对正式服务器发起测试入房，也未做 iOS 真机挂起／换网验收。
