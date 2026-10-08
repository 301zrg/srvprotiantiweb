# 天梯官网的录像与卡组一键打开调研

2026-10-08 当前进展：录像首版与官网配套已按用户后续授权实现。实际交接使用小文件同标签页内容链接、较大文件先读取后显式点击消息交接，不要求立即加 Nginx 文件代理。最新范围、限额和部署顺序以 [录像接收契约](replay-import.md) 和 [录像说明](replay-usage.md) 为准。以下内容保留为施工前调研，不代表仍在等待授权。

核查日期：2026-10-07；进展更新：2026-10-08。范围是 `srvprotianti` 官网增加入口、把已有下载内容送入 `srvprotiantiweb`。卡组接收已单独获授权并实现，实际契约见 [卡组接收说明](deck-import.md)；官网 HTML／按钮、下载接口和正式部署本轮未改，第二期录像仍待用户确认开工。下文官网及录像改造保持施工前方案。

## 1. 结论与建议顺序

| 入口 | 可行性 | 网页版接收后的行为 | 前置条件 |
| --- | --- | --- | --- |
| 录像下载旁的「网页版播放」 | 可行 | 导入原始 YRP → 本地录像库 → 校验兼容性 → 打开播放器 | 第二期标准 YRP Core、Lua／旧裁定资源及播放器完成；当前 `.yrp3d` 解析器不能替代 |
| YDK 文件下载旁的「网页版编辑」 | 接收端已实现 | 读取 YDK → 保留 main／extra／side → 保存本地卡组并选中编辑 | 下一步接官网按钮；不依赖录像 Core |
| deckbuffer 下载旁的「网页版编辑」 | 接收端已实现 | 解码原生 UPDATE_DECK 数据 → 用卡库区分主卡组／额外 → 保留备牌 → 同一编辑入口 | 下一步接官网按钮并修复当前下载转换遗漏额外区的问题 |

建议先完成卡组入口与统一导入模块，再按 [第二期录像计划](replay-phase2-plan.md) 完成标准播放，最后开放官网播放按钮。用户不必先把文件存进「下载」再选一次文件；原有下载按钮继续可用。导入／播放不连接对战 WSS，不自动进房或准备，也不修改桌面助手的原生打开功能。

## 2. 当前源码的两类数据路径

### 2.1 录像

[官网录像页](../../srvprotianti/plugins/ladder-web/web/replays.html) 从 `GET /api/public/replays` 取得文件名，每行下载指向 `GET /api/public/replay/:filename`。
[公开录像插件](../../srvprotianti/plugins/public-replay-web/index.js) 读取固定录像目录里的原始 `.yrp` 字节，限制为单个文件名；没有数据库关联的历史文件也可能存在，不能据此隐藏播放入口。

新增按钮读取相同文件即可，不需要转换成视频、不需要新上传接口，也不需要让天梯服务器运行网页重放。文件取到后保留原始字节，播放运算在浏览器的匹配 Core 中进行。Match 的 G1／G2／G3 是各自的录像，不因文件名相似自动合并成一份。

2026-10-08 的 [路由](../src/ui/NeosRouter.tsx) 已增加卡组专用 `/import`，未增加标准录像播放入口；[replay.ts](../src/api/ocgcore/replay.ts) 处理的是 `.yrp3d` 消息记录。**现在只加超链接，不能使标准 `.yrp` 自动播放。** 文件来源也不能证明运行环境已兼容，仍需第二期的版本、脚本和 `special.lua` 初始化验收。

### 2.2 文件响应，包括由服务端生成的 YDK

| 官网位置 | 当前取得内容的方法 | 一键编辑的处理 |
| --- | --- | --- |
| [介绍页示例卡组](../../srvprotianti/plugins/ladder-web/web/intro.html) | `GET /example_decks/:filename`，读取现存 YDK 文件 | 官网读取文本，或通过允许的 HTTPS 下载入口读取，送入 YDK 导入器 |
| [卡组详情模板](../../srvprotianti/plugins/ladder-web/web/deck-detail.html) | `GET /api/ladder/deck-template?deckTypeId=...&filename=...` | 同一 YDK 导入器；明确这是识别模板，可能不是完整、可参战的卡组 |
| [玩家战绩卡组](../../srvprotianti/plugins/ladder-web/web/player-stats.html) | `POST /api/ladder/player/deck`，请求体含 player／password／matchId／side；返回 YDK | 由官网继续调用原接口及权限验证，只把验证通过的卡组内容传给网页版 |

玩家战绩接口虽然底层读取数据库 buffer，但 [ladderAnalytics.profileDeck](../../srvprotianti/plugins/ladder-analytics/index.js) 已经在服务器生成 YDK，外部导入按「文件内容」处理。它取的是比赛初始 `startDeckBuffer`；录像列表用的是该局 `currentDeckBuffer`，换备后的 G2／G3 两者可能不同。按钮标签和来源记录必须保留这一区别，不能用战绩初始牌组替换录像中的当局牌组。

密码仍只在官网页面内存与原 POST 请求体中，不送到新标签页、链接、日志或本地库。新增按钮不能通过公开 GET 绕过原有访问范围。

### 2.3 浏览器把 deckbuffer 转换后下载

录像列表已经返回 `players[].deckbuffer`（Base64），点卡组下载时在浏览器里解码，再生成 YDK。这个 buffer 是原生 `CTOS_UPDATE_DECK` payload，**不是** YDK，也不是三段式 `ydke://`：

```text
uint32LE mainPlusExtraCount
uint32LE sideCount
uint32LE cardIds[mainPlusExtraCount]  // 主卡组与额外卡组的合并区
uint32LE sideIds[sideCount]          // 备牌区
总长度 = 8 + 4 × (mainPlusExtraCount + sideCount)
```

当前官网 `downloadDeck()` 把合并区全部写进 `#main`，并写入空 `#extra`。所以有融合／同调／超量卡时，生成文件的区块不正确。一键打开应传**原 buffer** 或正确分区的结构，不能复用这份有问题的 YDK。

网页版已有 `ygopro-deck-encode@1.0.14`，其 `fromUpdateDeckPayload(buffer, predicate)` 能按 predicate 分区。predicate 收到的是**卡号**，而 [isExtraDeckCard](../src/common.ts) 接收的是**type 位掩码**；必须先查 `fetchCard(id).data.type`，不能把卡号直接传入类型判断。侧牌里的额外怪兽继续留在 side；不去重、不排序、不按当前禁表删卡，也不把异画号换成另一个 ID。

建议给现有 [录像增强插件](../../srvprotianti/plugins/ladder-replay-enrichment/index.js) 增加可选的 `deck: {main, extra, side}` 字段，复用并声明 `cardCatalog` 服务依赖，由正确分区的数据同时生成官网 YDK 下载和编辑链接；保留原 deckbuffer 字段。基础公开录像插件继续可以独立工作，不强加天梯依赖。增强字段不可用时，网页版可用自身卡库解码原 buffer；官网不能继续默默导出区块错误的文件。

遇到卡库不识别的合并区卡号，buffer 本身没有主／额外分界，无法可靠推断。保留原件和全部 ID，显示待核对状态，不把未知卡静默认作已正确分区的主卡。已有分区的 YDK 则按原区块保留未知卡。

## 3. 当前部署下怎样把内容送过去

官网目前通过 `http://121.4.34.71:7922/` 访问，网页版在另一处 HTTPS 静态站点。HTTPS 客户端直接 `fetch(http://121.4.34.71:7922/...)` 会受到混合内容阻拦；端口、文件下载公开与否不改变这一点。[MDN 混合内容](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content)。

本地 [宿主 HTTP 处理](../../srvprotianti/ygopro-server.coffee) 已在插件分发前设置 `Access-Control-Allow-Origin: *` 并处理 OPTIONS。因此不能把问题归结为「完全没配 CORS」；它仍不能解除混合内容限制，且正式代理返回的响应头必须另验。公开 HTTPS 文件接口可使用不携带浏览器凭据的 GET；认证卡组仍走官网既有验证流程。[MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)。

现有 [隧道网关模板](../deployment/windows/neos-tunnel.conf) 只代理 `/neos`，其余路径返回 404。WSS 对战通道不等于 HTTPS 文件下载接口；不可把 `.yrp` 地址简单换成这个域名就认为能用。

| 方案 | 适用内容 | 优点与限制 | 本次建议 |
| --- | --- | --- | --- |
| URL 的 hash 携带小卡组 | 已公开的 YDK、deckbuffer 或三分区结构 | 接收方不回读 HTTP、不等待原标签页；地址长度要限制，内容进入浏览历史／可被复制 | 公开小卡组优先；手机同标签页跳转更稳 |
| 官网同源读取 + `postMessage` | 录像字节、YDK、buffer；权限验证通过的卡组 | 不必新配下载代理；需要两个窗口可通信，iOS 原页暂停和平台 iframe 需验收 | 当前普通浏览器的候选方案；受限卡组不放入 URL |
| HTTPS 公开下载代理 + 文件标识参数 | 公开录像、公开 YDK | 不依赖原页继续执行，地址短；需增加少数只读代理路径 | 录像的一键播放优先方案，尤其针对 iOS |

### 3.1 公开卡组使用内容参数

以下 HashRouter 卡组契约已实现（另支持 `deck-json-base64url`），详情及限制见 [接口说明](deck-import.md)：

```text
<网页版入口>#/import?v=1&kind=deck&format=ydk-utf8-base64url&data=<内容>&title=<标题>
<网页版入口>#/import?v=1&kind=deck&format=ygopro-update-deck-base64url&data=<原buffer>&title=<标题>
```

文件类：官网先同源读取 YDK，再生成链接并跳转；手机默认同标签页，避免等 fetch 后再 `window.open()` 被拦截。buffer 类：列表已有原数据，可点击时直接生成链接。统一使用 Base64url，先校验／去除 YDK BOM；format 区分清楚，不把通用 Base64 当作 YDKE。标题、语言和来源只是显示元数据，不影响卡号或权限。

建议最终 URL 初始限制为 4 KiB，这是项目限制而非浏览器通用上限。常见 90 张以内的卡组足够小；注释很多、名字过长或异常内容超过限额时使用消息传递／文件导入。hash 不随 HTTP 请求发给静态服务器，但会留在浏览历史且页面脚本能读取，因此这条路径只用于原本公开的卡组；读取后移除内容参数，不向埋点发送完整地址。[MDN URI fragment](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment)。

构造 URL 时保留配置中的完整入口路径，只替换 hash；不能把 BiliToy 的 `/toy/.../index.html` 改成站点根路径。若平台外壳不转发 hash 给内容 iframe，此方案也需平台适配；不得宣称普通站点链接已验证就等于 Toy 可用。

### 3.2 消息传递及接收时序

官网在用户点击时同步创建一个新标签页，并注册回信监听；同源读取已有下载接口，受限卡组继续走原 POST。HTTP 页向另一个 HTTPS 窗口传递 ArrayBuffer／文本符合 `postMessage` 的跨来源通信能力；消息本身不是 HTTPS 页向 HTTP 发起文件请求。[MDN postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)。

卡组已实现的交接协议如下；录像的消息交接暂未实现：

```text
官网 → 新页：打开 #/import?v=1&bridge=1&kind=deck&origin=<官网精确origin>&request=<随机标识>
新页 → 官网：ready(request, version=1, kind=deck, channel)
官网 → 新页：payload(request, version=1, kind=deck, channel, format, title, bytes或text或deck)
新页 → 官网：result(request, version=1, kind=deck, channel, status=received|imported|memory-only|failed|cancelled)
新页：导入完成后进入编辑器，释放交接监听与窗口引用
```

ready 表示轻量接收器已安装，可以保存收到的内容；不等待大包 Core 下载完再传。卡库、存储、播放器的初始化使用明确状态推进，不再用固定「等一秒」判断就绪。消息接收成功、写入 IndexedDB 成功和播放成功分开记录；接收后尽早完成导入，Core 播放加载可在交接结束后继续。

两端检查固定允许的 origin、对应 WindowProxy、request、协议版本、类型和尺寸，并指定精确 targetOrigin。HTTP 来源的随机标识用 `crypto.getRandomValues()`，不依赖仅安全环境可用的便捷 API；来源参数不能自行扩大允许列表。[MDN getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)。

`noopener`／`noreferrer` 会切断 opener，不能照搬观战链接的这两个属性到消息交接窗口。该交接只面向配置中的受信任客户端入口，结束后解除 opener；若部署添加 `COOP: same-origin` 或平台拆开浏览上下文，也需改用内容链接／HTTPS 下载。[MDN window.open](https://developer.mozilla.org/en-US/docs/Web/API/Window/open)。

ArrayBuffer 使用 transfer 时发送侧会失去该 buffer，应保留原 Blob 或使用副本以供重试和原下载按钮使用。超时、弹窗被阻止、原页关闭、文件 404、接收页加载失败都给出可重试状态；初始交接超时建议 30 秒，允许慢设备延长。不能因发出 payload 就显示已保存。

手机上切到新标签页后原页可能暂停，消息方案不能承诺始终一次点击完成；需真机验收，失败仍可原下载后本地导入。`blob:` 地址、本地下载路径、跨来源 localStorage／BroadcastChannel 都不作为文件交接协议。

### 3.3 录像优先补 HTTPS 公开文件入口

在现有 cloudflared → Nginx → Neos 链路旁，由本机 Nginx 增加只读的公开文件路径到原 HTTP 7922 服务。例如允许 `/api/public/replay/`；公开示例和模板按需分别允许 `/example_decks/`、`/api/ladder/deck-template`。它们的原接口只处理 GET，因此首先只允许 GET，不顺便暴露全部 `/api/`、管理员接口或认证 POST。

网页版配置独立的 `publicDownloadBaseUrl`，通过固定来源标识与文件名构造 URL；不接收任意 `url=` 后不受限地抓取。校验文件名、扩展名、响应状态和大小，由服务器原插件继续限制下载根目录。代理保留实际 CORS 响应，Toy 还需批准该外部服务域名。Quick Tunnel 换域名时更新配置，不能把临时域名当永久分享地址。

拟议入口：`<网页版入口>#/import?v=1&kind=replay&source=ladder&file=<编码后的文件名>`。新页自行通过 HTTPS 下载到本地库，再进入播放器，不需要后台中的官网继续执行，也不把录像 Base64 塞进 URL。

此方案不用新增备案域名或网页上传服务器；能否稳定访问仍受当前公网隧道网络影响。只添加上述 Nginx 代理时语法检查后 reload；不需要为此重启 SRVPro。若决定修改插件响应／JS，则插件代码部署通常需要重启服务，不能与纯 HTML／Nginx 修改混为一谈。本轮没有执行这些部署动作。

## 4. 网页版统一导入行为

卡组 `/import` 入口和 [共用解析／保存模块](../src/service/deckImport.ts) 已实现，供本地文件、粘贴、官网链接和消息传递共用；[DeckSelect](../src/ui/BuildDeck/DeckSelect/index.tsx) 已接入同一模块。录像导入仍按第二期计划处理。

- YDK 必须识别 `#main`、`#extra`、`!side`，保留卡号、重复张数、分区与顺序；不自动「修复」为另一套牌组。结构问题与禁表／张数不合法分开提示，识别模板仍允许进入编辑器。
- buffer 先校验最少 8 字节、计数和精确长度，再遍历；超量、截断、尾随数据、异常 Base64 或无效卡号不得造成无界分配。初始卡组输入 64 KiB、总卡号 300 个上限，便于编辑非法／不完整牌组；URL 路径另有 4 KiB 地址限制。
- 卡号按正 uint32 检查；不因浏览器四语卡库缺卡而删除 ID。分区明确的未知卡可保存并标注，分区未知的 buffer 保留待核对内容；两者不标为可直接参战。
- 等待卡库和本地卡组库就绪，再导入、明确选中新卡组并进入 `/build`。同名加序号，不覆盖旧卡组；同内容重复操作可选中已有副本，交接 request 去重防止一条消息保存多份。
- [deckStore](../src/stores/deckStore.ts) 已改为导入事务提交后更新内存及提示已保存，并在同一事务内分配名称；失败提供临时编辑与下载，明确尚未保存，沿用 [部署命名空间](../src/variant/deployment.ts)。
- 录像原件按第二期 8 MiB 单文件／100 MiB 软预算处理，SHA-256 去重与来源信息沿用本地库；过期／不兼容仍能下载。播放不借 online store 发出 CTOS 消息，Core／脚本也不因一次卡组导入下载。
- 新页只处理本次导入，不把参数当成 TT／昵称／密码或自动入房命令；不覆盖已存在的联机草稿。打开新的编辑／播放上下文，也不在原有活跃对局标签页里跳转。

## 5. 官网修改归属与按钮

录像每行保留「下载」，旁边加「网页版播放」；两位玩家的卡组各保留原下载，旁边加「网页版编辑」。示例文件、模板和玩家战绩同理，模板标注「模板」。无 deckbuffer 时不显示假可用编辑入口；单纯缺数据库元数据的录像文件仍可播放尝试。

入口地址和交接辅助逻辑在 `ladder-web` 共用层维护，四语言文案沿用网站规范；不要每页写不同客户端地址或直接在宿主添加业务。按钮使用独立 action，保留旧下载 href／download 和桌面助手的原生下载拦截行为，桌面助手不默认改成打开浏览器。对齐窄屏布局和明确的文字按钮，避免只有难辨认的小图标。

只更新现有 HTML／已支持的静态资产时，当前路由每次读文件，刷新官网即可取得新内容；新增服务端转换或路由另行部署并验证。网页版接收入口需要重新构建和上传静态包。核心兼容未通过、接收版本不支持或下载 HTTPS 未配置时，不发布宣称已经能播放的按钮。

## 6. 本轮验证与开工验收

本轮已核对上述源码与浏览器官方资料，并执行本机隔离概念验证：HTTP 来源页同源读取合成数据，点击打开另一 HTTPS 页面，以明确 ready／回信交接。Edge 在开启默认弹窗限制的情况下通过桌面及 390×844 触控模拟，共 6 个案例（合成录像字节、YDK、deckbuffer）；1.5 秒延迟 ready 后字节逐一一致，错误 request 被拒绝，交接后 opener 解除。隔离测试使用临时自签名本机证书，浏览器仅对该测试忽略证书错误，不代表正式证书验证。

另用公开卡号构造 main 为两张 `89631139`、extra 为 `44508094`、side 含这两个卡号的 buffer，结合只读裁剪 CDB 中的 type 验证分区。默认不带 predicate 的解码得到 main 3 张、extra 0 张；按类型分区得到 main 2／extra 1／side 2，且备牌里的额外怪兽仍保留在 side。与官网当前问题一致。

2026-10-07 的 YDK 导入与这份三分区结构一致；两类内容经 Base64url 放入当时拟议 hash 并读取后字节一致，保留 Toy 式发布子路径，样本地址分别为 228／180 字符。2026-10-08 已接入正式卡组路由，并新增解析与真实编辑器回归，记录见 [卡组接收说明](deck-import.md)。

这只证明数据格式和普通浏览器的交接可行，**未验证真实 YRP 播放、正式服、iOS Safari 真机或 BiliToy 外壳传参**。测试材料和临时证书留在忽略的 `.audit-tmp`，不提交真实玩家数据。

开工后的验收覆盖：

| 范围 | 必要案例 |
| --- | --- |
| 卡组正确性 | 文件与 buffer 同牌组结果一致；融合／同调／超量、重复卡、side 额外怪兽、异画、四语言、缺卡、模板不完整、G1 与换备后 G2 数据区别 |
| 导入状态 | 冷启动、慢卡库、同名、同内容、刷新后仍存、配额／IDB 禁用、重复消息、两标签页同时导入不串内容、活跃对局不受影响 |
| 传输 | HTTP 官网 → HTTPS 客户端；hash 超长／格式错误；来源／WindowProxy／request 不匹配；弹窗阻止、关闭原页、HTTPS 文件 404、限额、代理实际 CORS、长文件名 |
| 录像 | 原下载、传入、本地导出字节一致；支持与不支持头格式；版本／特殊旧裁定；播放器正确重演与不发送在线协议 |
| 手机／平台 | iOS Safari 真机及后台页暂停；Android；Toy hash 转发、iframe／opener／CSP／外部域名；四语窄屏按钮；桌面助手原下载与原生打开保持可用 |

本轮结论可作为第二期方案补充。卡组接收入口已单独实现，官网按钮等待下一步；录像入口须随标准播放与选定传输方案完成后再上线。
