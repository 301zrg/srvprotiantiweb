# 页面资源加载与失败恢复

更新：2026-10-07。本次处理一期在线页面的故障，不实现第二期录像播放器。

## 反馈与边界

用户在 iOS Safari 点击加入后看到“环境资源加载失败 / unexpected end of script”，普通刷新仍失败。这表示 JavaScript 解析未完成；可能涉及响应截断、缓存或脚本本身，不能仅凭这一行就认定生产服务器的具体原因。本机曾无法读取当前 Workers 站点，因此未声称检查过其线上文件内容。

本地用真实 HTTP 服务器返回一个不完整的房间页面模块，并允许浏览器缓存，复现“首次入房失败、普通刷新仍读取损坏模块”。Playwright 路由会禁用 HTTP 缓存，所以该用例没有通过请求拦截伪造缓存命中。

还查到两条独立的恢复缺陷：SQLite 初始化失败后进度仍大于零，后续调用直接跳过；sql.js 自己缓存初始化 Promise，WASM 下载失败可能永久污染本次页面。等待房、决斗、换备页直接刷新时，原 WebSocket 不存在，过去也把读取会话失败误报成资源失败。

## 当前行为

- 卡库、WASM、strings 和禁表最多尝试三次，单次网络读取超时 20 秒。失败重试绕过旧 HTTP 缓存；资源错误显示文件路径及原因。
- 卡库检查 SQLite 文件头及数据库完整性；WASM 检查文件头；strings 和禁表检查必要内容。HTTP 200 的 HTML 错误页也会被拒绝并重试。下载进度处理缺失／压缩后的 Content-Length，不会产生 Infinity，且不复制一份无人消费的响应流。
- 先下载并验证 WASM，再初始化 sql.js。SQLite 加载通过共享 Promise 合并并发调用；失败将进度归零，允许在同一页面重新尝试。
- 页面模块的网络错误和意外结束的语法错误标为资源失败；其他组件／会话错误显示“页面未能正常打开”，保留具体错误。
- 点击“重试”时，页面模块故障会按 `assets-manifest.json` 重新获取本次发布的 JS/CSS 文件，覆盖损坏的 HTTP 缓存，检查长度及 SHA-256（支持 Web Crypto 时）。随后打开新文档，重置本页失败的路由与初始化状态。解析错误后的后续 import 可能重试，但仍可能读到同一份坏 HTTP 缓存；不能把 HTTP 缓存和模块运行状态混为一谈。恢复时不删除 IndexedDB、卡组或其他玩家存档；获取失败则显示具体文件并允许再次尝试。
- 不依赖决斗状态的本地存档继续保留。等待房、决斗和换备页刷新后返回联机表单，用户重新入场；不会用不存在的连接渲染决斗页。
- 音频上下文不再在模块导入时创建。没有 Web Audio 的浏览器仍能打开页面，音效失败不阻止对局。
- 决斗菜单和棋盘的尺寸观察延后到下一渲染帧，数值未变不重复写样式，避免 WebKit 的 ResizeObserver 循环通知错误。

恢复资源清单由 `scripts/copy_assets.mjs` 在标准／BiliToy 发布包中生成，路径只允许本站 `assets/` 下的 JS/CSS，不支持任意远端文件。清单仅在错误恢复时读取，正常首页不额外下载全部页面。站点必须完整上传同一份构建包；若托管端持续返回坏文件或网络不可达，客户端会报告失败，不能凭刷新凭空修复托管内容。

## 观战过程

已撤掉积压消息和后台状态下的自动快进。每局开场等待对应卡片组件挂载，再按协议顺序播放历史；后台暂停，返回继续。异常前台动画的三秒兜底只释放当前动画，不丢弃后续动作。历史 Match 胜负不弹出必须观众确认的玩家弹窗，下一局继续播放。主动退出会取消挂载／前台等待，旧会话不再影响下一次入房。

这仍是服务端观战历史，不是本地 Core 标准录像播放。

## 验证及更新

回归命令：

```powershell
npm run build
npm run test:resource-recovery
node scripts/room_link_ui.mjs
node scripts/room_link_ui.mjs --built
```

可额外使用 Playwright 官方 WebKit（不是 iPhone 真机）：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = '.audit-tmp/tools/playwright-browsers'
node node_modules/playwright/cli.js install webkit
node scripts/resource_recovery_ui.mjs --webkit
node scripts/room_link_ui.mjs --webkit --built
```

测试检查：不完整脚本在真实 HTTP 缓存中导致重复失败；修复缓存后重新入房；WASM/CDB/strings/禁表短暂失败；三次失败后重试；卡组保留；无会话时刷新三种页面；慢速观战历史、前后台切换及跨局继续。实际结果在交付时列明，WebKit 和手机视口模拟不等于 iOS Safari 真机验证。

本轮已通过 Chromium 与 WebKit 的上述资源恢复用例，以及两种引擎构建版的桌面／手机观战链接回归。开发版另外验证了积压时仍等待动画、后台超过三秒也不快进、返回前台继续、同页面卡库失败复位及并发重试；类型、lint、构建及桌面／手机横竖屏对局反馈回归通过。iPhone 真机与生产站点文件复验留给更新后的现场测试。

上线只需替换完整静态网页发布包，保留正确的 `duel-config.js` 固定 WSS 地址。Nginx、隧道和游戏服务器不需要因此重启。部署完成后，iOS Safari 重新打开网页；若遇到错误，使用页面“重试”按钮，并核对已取得新版 `assets-manifest.json`。旧版页面没有这一恢复按钮逻辑时，重新打开带不同查询值的站点入口取得新入口文件；不要求玩家删除站点数据。

浏览器依据：[Fetch 缓存模式](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache)、[动态 import 的缓存行为](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import)。
