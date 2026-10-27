# 网页对局掉线与换备状态排查

排查日期：2026-10-11。反馈为对手多次掉线重连，可能来自日本、使用网页版。
尚无发生时间、浏览器/设备、实际房间或生产日志，因此不能据此认定日本线路或某次事故的根因。
本轮只修改网页项目，保留工作区既有修改；不改服务端生产配置、不读取服务端私密配置。
本地修复验收后，用户于 2026-10-11 授权发布；发布从最新 `deploy/cloudflare` 独立合入，
保留已有操作确认、宣言历史、连接诊断及公开迁址配置，生产验证结果另行记录。

## 已定位的代码问题

| 问题 | 证据与影响 | 本轮处理 |
| --- | --- | --- |
| 计时/心跳确认排在界面队列后面 | `service/onSocketMessage.ts` 逐个等待动画、选择或结果弹窗，原 `service/duel/timeLimit.ts` 才发送 `TIME_CONFIRM`。隔离测试堵住消费队列后，旧代码不能确认已收到的完整计时包 | `infra/connectionControl.ts` 在网络到达时按完整包、玩家身份及当前局先后手确认；界面继续按原顺序更新计时，不重复确认 |
| 前台探测误判慢连接 | `ui/Match/util.ts` 原先仅探测一次，5 秒无数据就换连接。浏览器替身延迟 6.5 秒回复时，旧代码可复现主动重连 | 5 秒时复探一次，总等待最多 12 秒；收到任何网络数据即保留原连接，仍无回复才恢复。探测按连接隔离，重复事件不并发探测，离线时不启动检查 |
| 把 `DUEL_START` 当成自己的换备完成 | `service/room/duelStart.ts` 原先无条件将已有 Side 阶段设为 `SIDE_CHANGED`。宿主重连和 Core 换备阶段最终离场也会发送这个前缀；合成浏览器样本复现未点击确定却被禁用 | 已有 Side 阶段保持不变；本人有效发送 `UPDATE_DECK` 才进入已提交状态，`SELECT_TP`/`MSG_START` 推进下一阶段，`CHANGE_SIDE` 重新开放编辑 |
| 观战等待包覆盖玩家编辑状态 | 原 `waitingSide.ts` 不检查身份 | `WAITING_SIDE` 只改变观战者状态，玩家的草稿、布局和滚动不变 |
| Side 页面收到最终胜负时没有结果弹窗 | Core 在换备中最终移除玩家，可发 `DUEL_START → MSG_WIN → DUEL_END`；旧 Side 页面未挂载 `EndModal`，消息处理会等一个不可见的弹窗 | Side 也挂载结果弹窗，并在服务器确认整场结束后返回联机页；普通断线通知不结束换备 |

仅只读核对服务端公开源码 `srvprotianti/ygopro-server.js` 和 `data/default_config.json`：
心跳默认**关闭**；若部署开启，默认 `interval=20000 ms`、`wait_time=10000 ms`，
未按时收到 `TIME_CONFIRM` 会执行 `client.destroy()`，已有网页恢复机制随后尝试接续。
因此心跳排队是一个已复现的客户端风险，但是否解释此次生产事故取决于实际部署是否开启心跳。
不开启心跳时，迟迟不确认计时仍可能阻碍 Core 继续发送选择。

即时确认只处理完整、合法的双人计时包，跨 WebSocket 消息的半包不提前确认，
新一局按收到的 `MSG_START` 更新实际 controller，观战者与已取消连接不发确认。
Tag 保留原确认路径，其完整队友轮换仍未适配。恢复的场面应用确认继续在消费队列内执行，
不因提前发送连接确认而提前允许操作，不重发旧选择或换备提交。
服务器拒绝换备的 `SIDEERROR` 会重新开放同一草稿；已提交时停止重复提交和继续修改。

## 仍可能造成真实掉线的因素与解决办法

1. **浏览器后台/网络切换**：iOS/Safari 可以挂起页面或保留失活 OPEN 状态，已有
   [WebKit 问题记录](https://bugs.webkit.org/show_bug.cgi?id=247943)。本轮即时确认能绕过等待中的界面队列，
   不能在系统停止执行 JavaScript 时保活。继续保留现有前台探测与冻结 G1 的恢复；真机分别测
   切应用、锁屏、Wi-Fi/蜂窝切换。对局期间保持页面前台、使用稳定网络是临时缓解办法。
2. **跨境链路/隧道**：日本玩家到入口的线路、隧道源站侧的丢包都可能断开长连接，
   单次 101 握手通过不能证明整场稳定。Cloudflare 官方说明网络更新会关闭 WebSocket，
   空闲连接也可能被关闭，并建议 keepalive 与检查超时；见
   [WebSocket 官方说明](https://developers.cloudflare.com/network/websockets/)。
   若实际仍使用 `trycloudflare.com`，将临时入口迁到固定的受管 Tunnel；
   [Quick Tunnel 官方说明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)将其定位于测试和开发。
   固定 Tunnel 本身不保证跨境线路稳定，需要从日本与国内各测至少 30 分钟完整比赛、重连和并发。
   只有测得丢包/高延迟后，再比较香港/日本 WSS 入口或迁移对战服务的成本与效果。
3. **超时/缺少空闲保活**：当前 Windows 反代模板的读写超时为 86400 秒，
   无法证明生产实例采用同一配置。应核对实际反代、Tunnel 和 Neos。
   长期建议在 Neos 的 WebSocket 层做 ping/pong 并记录超时原因，独立于游戏操作；
   不用定时 `/ja` 聊天刷屏，也不重发 `RESPONSE` 或换备包充当保活。
   先上线即时确认，再根据实测 RTT/丢包调心跳阈值；必要时将 10 秒等待放宽到 20–30 秒，
   同时保持 interval 大于 wait_time，避免当前服务端的定时注册不断重置超时。
   调大阈值会延迟发现真正失联，不能代替修复线路或后台恢复。

日语选择只改变资源文字与服务器语言命令，不另建日本专用连接，也不会因切语言重连。
累计在线动画队列仍保持用户 2026-10-10 的决定，本轮未加入队列上限或丢弃动画。

## 下次事故如何区分原因

- 网页控制台 `Websocket closed.` 增加无凭据字段：关闭码、是否正常关闭、连接时长、
  最后收包距今时长、待处理消息/包数量、是否后台、浏览器 online 标志、解析失败和恢复标志。
  不记录昵称、房间/密码、原始包或服务器关闭文本。
- 以准确时间对齐宿主 `reconnect_registration_opened`、重连/超时记录和 Tunnel 的连接重建日志。
  如果大量玩家同一时刻掉线，优先检查隧道/服务进程；单个设备切后台后掉线，优先检查生命周期；
  长动画/未关闭弹窗后出现超时且队列积压，优先核对心跳。关闭码 1006 本身不能判断哪一端出错。
- 服主检查心跳是否实际开启、当前 wait_time、重连窗口，以及客户端真实 IP 是否被代理头正确转发。
  网页不读取私密生产配置；服务器当前未单独记录 heartbeat timeout，建议后续加入明确原因字段。
- 核对当前部署提交再复测。同一时段使用日语/中文、同设备/同网络对照，分别验证普通房、TT G1–G3、
  未提交/已提交换备、原生客户端互通。反馈语言不能代替网络测量或设备信息。

## 验证入口

```powershell
npm run test:connection-health
npm run test:connection-resume
npm run test:side-ui
npm run build:static
node scripts/room_link_ui.mjs --built
npm run test:session-resume -- --built
npx tsc --noEmit
npm run lint
```

`connection-health` 使用真实 `WebSocketStream`、隔离 WebSocket 替身与被堵住的消费器，
覆盖提前确认、半包/粘包、G2 先后手变化、未开始/换备、观战、取消连接、无身份和 Tag 回退。
`room_link_ui --built` 在桌面与触控尺寸检查 6.5 秒延迟回复、首次回复丢失后的复探、
重复前台事件，以及持续失活 OPEN 连接仍可恢复；它使用 WebSocket 替身，不模拟日本公网。
`side-ui` 使用合成卡组与实际封包 handler，检查四语 × 四种尺寸的草稿、编辑区尺寸/滚动、
确认按钮及精确卡组提交，另外覆盖换备拒绝、观战等待和 Side 期间最终离场结果。
`session-resume` 使用隔离 SRVPro、真实 Core、本地 TLS 与合成身份，新增检查对手重连时
另一个尚未提交玩家的编辑草稿和尺寸保留，不自动提交。
本机浏览器模拟不等于日本公网、Android/iOS 真机或生产对局验收。

2026-10-11 本轮本地结果：连接确认回归、原有 18 组恢复认证回归、封包回归、
换备 16 组及拒绝/观战/第二席位终局结果通过；类型检查、完整 lint 和静态构建通过。
追加前台探测修复后，最终静态包在 Chromium 桌面/触控尺寸通过慢回复、首次回复丢失、
重复事件及失活 OPEN 恢复，原有房间/历史回归通过；类型检查和完整 lint 通过，
隔离真实 Core 的下列恢复样本亦在该最终静态包重新通过。
隔离真实 Core 通过 Single 场面恢复、网页与原生格式 TCP 双向接续、移动观战恢复、
对手断线时保留另一玩家未提交换备、已提交换备无重复提交、刷新后手动恢复换备及 TT G1–G3。
本机找到的按日服务器日志为 `2026-09-02.log`、`2026-09-06.log`、`2026-09-14.log`，
连同 `monitor.log` 未匹配用户提供的目标昵称；这些本机文件不能代替当前生产服务器的日志。
没有对生产连接、日本线路或手机真机作通过声明。

## 动画与消息等待审计（2026-10-25）

以本地工作树为准，保留既有未提交修改。本轮未连接生产服务器、未部署，也未改服务端、
判负／积分规则、Cloudflare Tunnel 或 Nginx。此次玩家事故尚无准确时间、iPhone／iOS 版本、
网络对照结果或对应服务日志，以下代码缺陷不能直接视为事故根因。

### 实际调用链

1. `infra/stream.ts` 在 `ws.onmessage` 到达时，用独立 framer 执行录像捕获、生命周期识别和
   `ConnectionControl.receive`。Single／Match 属于本玩家的完整合法 `STOC_TIME_LIMIT` 立即发送
   `CTOS_TIME_CONFIRM`；观战不发，Tag 保留原消费路径。
2. 同一消息入 `ReadableStream`，`execute → service/executor.ts → onSocketMessage.ts` 按序等待。
   `onSocketMessage` 的 framer 和 Promise 链以 Container 为键；新连接创建新 Container。
3. `STOC_GAME_MSG → duel/gameMsg.ts → draw/move/attack/chaining/confirmCards/...` 先应用状态，
   再等待 `callCardMove/Focus/Attack → eventbus.call(Task, uuid)`。
4. `Card/index.tsx` 将请求排入当次挂载的串行队列，`springs/* → asyncStart` 等待前台及 spring。
   缺失卡片不等待；卸载或原连接取消释放任务；前台卡住 3 秒只提交该段终态，后台不快进历史。
5. `duel/timeLimit.ts` 在消费时更新显示计时，已提前确认的双人连接不会再次确认；恢复的场面确认
   仍在消费时执行。显示计时可受积压影响，收包时确认不代表玩家已看到选择或获得额外操作时间。

### 已证实的代码问题与修复

| 问题 | 代码证据／复现 | 最小修复 |
| --- | --- | --- |
| 已完成动画的取消反应持续保留 | 原 `Promise.race([run, disposed])` 给同一个直到卸载才完成的 `disposed` Promise 反复添加反应；卡片不卸载时随调用量增长。Node WeakRef／显式 GC 对照中，修复前保留 100/100 个已完成结果，修复后 0/100。当前版本不存在此前所述的全局动画 EventEmitter 监听器未注销问题 | 保留现有按 Task／UUID 的 Map，改为只保存仍未完成调用的释放函数，正常／异常完成立即删除 |
| 动画引擎错误关闭对局连接 | `api.start` 抛错或返回拒绝，穿过 eventbus、gameMsg、消息 Promise 链，触发 `execute` 的 `protocolFailed` 并关闭连接；故障注入可复现 | 仅在 spring 引擎边界停止并提交当前段终态；状态计算／协议错误仍向上传播，不笼统吞掉错误 |
| 截止回调抛错留下永久等待 | 原 `finish` 先标记 settled 并清理，再调用 `api.set`；若停止／终态提交抛错，定时器向外抛出且原 Promise 既不 resolve 也不 reject | 将停止、终态设置和 Promise 结算放在同一错误边界；无法提交终态时 reject，走现有传输失败路径 |
| 卸载只停止当前段，后续段仍可执行 | 原 `api.stop(true)` 释放当前段后，focus／attack 继续下一段；各段从全局 UI Container 重新取 signal，可使用新连接。后台时还可留下 visibility 等待 | 每次 effect 拥有独立 AbortController 和队列，绑定原连接；将同一 signal 贯穿所有动画段，取消时注销并释放处理器，后续段不再启动 |
| 多 controller 时提前结束 | 原向每个 controller 注入 `onResolve`，首个完成即可释放整个段；双 controller 合成样本可复现，普通卡片当前通常只有一个 controller | 以 `Promise.all(api.start(...))` 为完成边界，不以单个 controller 回调提前结束 |
| 洗切处理遗漏等待 | `shuffleSetCard.ts` 启动 `Promise.all` 后直接返回；素材移动尚未完成，下一包已开始，拒绝也脱离正常错误边界 | 补回 `await`，保留各卡并发及消息间保序 |

本地原实现已经支持：卡片卸载注销、缺失目标立即返回、覆盖注册释放旧任务、旧清理不删除新处理器、
同类动画按目标独立完成，以及单卡队列捕获拒绝防止后续动画链被污染。本轮保留并扩大回归覆盖。
`onSocketMessage` 的链若拒绝会保持拒绝，但外层会明确标记协议失败并关闭该连接；新连接不复用它。
不将所有协议错误捕获后继续消费，以免在状态已不可信时继续发操作。

参考了 [neos-ts eventbus](https://github.com/DarkNeos/neos-ts/blob/main/src/infra/eventbus.ts)
的注销、AbortSignal 和同类任务独立完成思路，以及
[上游 Card](https://github.com/DarkNeos/neos-ts/blob/main/src/ui/Duel/PlayMat/Card/index.tsx) 的生命周期清理；
保留本地按 UUID 直接寻址机制，未整段移植上游。原生
[duelclient.cpp](https://github.com/Fluorohydride/ygopro/blob/master/gframe/duelclient.cpp)
也在部分展示中调用 `WaitFrameSignal`；本轮未删除必要 `await` 或全面并行化协议。

### 验证及剩余风险

新增 `npm run test:animation-lifecycle` 通过受控 spring 故障验证引擎同步／异步错误、终态设置错误、
后台取消、原连接取消后切换连接、多 controller、前台截止、后台保留历史及洗切等待。
最初 6 个针对缺陷的新增用例在修复前全部失败、修复后通过；事件总线测试另覆盖同类并发完成互不影响。
`npm run test:animation-ui` 使用真实 React Card／StrictMode，反复挂载后分别卸载／取消连接，
检查零残留动画注册和 visibility 等待，并通过真实 `SELECT_YESNO → NEW_TURN` 封包检查玩家操作仍阻塞后包。
本轮验证结果：

- `test:duel-animation` 7 项、`test:animation-lifecycle` 8 项通过；缺失目标、卸载、覆盖注册、
  异常、同类并发、完成结果释放均有回归。
- `test:animation-ui` 的 Chromium 1280×800 与触控尺寸 390×844 通过，每尺寸 8 轮；
  额外断言 48 次注册，确认确实运行了 React StrictMode 的 effect 替换，而非仅包裹了标签。
- `node scripts/room_link_ui.mjs --built` 的桌面／触控尺寸通过，覆盖慢入场观战历史、跨局连续展示、
  后台恢复、慢／丢失探测回复和失活 OPEN 恢复。`test:packet`、18 个 `test:connection-resume`
  样本和 `test:connection-health` 通过。
- TypeScript、全量源码 ESLint、`build:static` 和 `build:cloudflare` 通过。Cloudflare 构建使用合成
  `wss://animation-validation.invalid/neos`，只用于验证构建包装，当前 `dist` 不是生产发布包。
  构建保留既有 sql.js 浏览器外部化、protobuf eval／包体积告警，未为本次修复更改打包架构。
- WebKit 试跑因缺少本机 `webkit-2272` 可执行文件在启动时失败，未执行断言；没有安装或替换浏览器。
  两次早期开发模式运行在页面就绪前超时，隔离构建补齐资源复制后，最终 Chromium 运行通过。
  iOS Safari 真机、生产部署和真实完整对局均未验收。

- **仍有充分依据的风险：** JS 主线程慢、长展示或长时间后台仍会积压消息；没有累计队列上限，
  也不会因积压跳过观战历史。提前计时确认不能消除本地显示／交互落后。部分交互弹窗仍使用模块级
  resolver；其统一取消／跨会话所有权不属于本次动画修复，不能据此宣称所有旧 UI 任务均已消除。
- **需要真实数据：** iOS 挂起、内存压力、实际帧率／长任务、Wi-Fi／蜂窝差异、日本到 Tunnel／Neos
  的延迟或丢包，以及服务端实际超时原因。不能从代码审查或 `1006` 关闭码判定其中任何一项为根因。
- **诊断边界：** 保留已有无凭据关闭摘要和 pendingMessages／pendingPackets，不新增持续逐帧日志。
  引擎失败只在开发模式给出固定警告，不记录卡号、房间、玩家身份或原始异常内容。
- **下一步数据：** 收集发生时间及其时区、iPhone 型号／iOS／浏览器、保持前台或切后台、三种网络／设备
  对照结果和关闭摘要。若仍需线上核对，再另行申请在该时间窗只读查询宿主超时／重连、Neos／Tunnel
  进程日志、重启／资源指标和实际心跳／恢复／反代超时配置；授权前不连接服务器。

2026-10-11 本轮本地结果：连接确认回归、原有 18 组恢复认证回归、封包回归、
换备 16 组及拒绝/观战/第二席位终局结果通过；类型检查、完整 lint 和静态构建通过。
追加前台探测修复后，最终静态包在 Chromium 桌面/触控尺寸通过慢回复、首次回复丢失、
重复事件及失活 OPEN 恢复，原有房间/历史回归通过；类型检查和完整 lint 通过，
隔离真实 Core 的下列恢复样本亦在该最终静态包重新通过。
隔离真实 Core 通过 Single 场面恢复、网页与原生格式 TCP 双向接续、移动观战恢复、
对手断线时保留另一玩家未提交换备、已提交换备无重复提交、刷新后手动恢复换备及 TT G1–G3。
本机找到的按日服务器日志为 `2026-09-02.log`、`2026-09-06.log`、`2026-09-14.log`，
连同 `monitor.log` 未匹配用户提供的目标昵称；这些本机文件不能代替当前生产服务器的日志。
没有对生产连接、日本线路或手机真机作通过声明。

## 发布与线上加载验证

2026-10-11：[PR #27](https://github.com/301zrg/srvprotiantiweb/pull/27) 已合入 `deploy/cloudflare`，
发布提交为 `7fc4698576c7630c382e2b526ad763a7d4973d28`。基于生产 `7e3a37db` 的独立修复提交
`cb2d2194` 保留已有操作确认、宣言历史、连接诊断与公开迁址配置；合并后代码树与已验证版本一致。
该合并版本 Cloudflare 构建检查为 success，线上 `deployment-info.json.sourceCommit` 已匹配。

18:53（Asia/Shanghai）线上独立 Edge 检查通过：桌面 1280×800、触控模拟 390×844 的首页、
联机表单、示例卡组；桌面四语切换；使用网站原有公开配置及真实 origin 的 WSS 握手。
浏览器握手耗时分别为 1395 ms、778 ms，没有提交玩家登录或创建生产对局。
未覆盖或修改线上配置，公开入口仍为 `wss://exports-cake-wanting-operational.trycloudflare.com/neos`。
此记录确认版本上线、页面加载与握手，不代表日本公网、完整生产比赛或手机真机验收。


### Production release adaptation (2026-10-25)

After the local audit, the user authorized a web-only release. The release worktree starts at current production
`7cd4321461104c6d40ece790ee89686acf8b4b4d`, preserving its card details, layout updates, overlays, reversed decks
and reveal hold. Only animation stability, regressions and the affected documentation are included.
The original local audit and its synthetic dist remain distinct from this production candidate.
The candidate uses the saved production public WSS, not the synthetic endpoint mentioned above.
Reveal hold now responds to both its caller and the owning mount: dismissing returns the card normally;
unmounting cancels the hold and prevents another animation stage. Two added regression cases cover these paths,
bringing release lifecycle tests to 10 (plus 7 eventbus tests). See this release's metadata and verification record
for actual deployment status; local tests are not device or full live duel acceptance.
