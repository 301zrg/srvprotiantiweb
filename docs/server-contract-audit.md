# SRVPro 接入契约核查（2026-09-28）

本记录只确认本地源码与公开配置默认值，不代表生产运行配置或真实客户端联调结果。
未读取 `config/config.json`、`config/admin_user.json`、插件本地 `config.json`、日志、录像或数据库账户。
未启动服务、创建 TT 账户、修改服务端文件或访问生产接口。

核查时本地 Git HEAD：

| 仓库 | HEAD |
| --- | --- |
| `srvprotianti` | `f253da853bf15c2742b1effafe222bbb54fc3813` |
| `srvprotianti/ygopro` | `5e63f18fb6b9a6ddc651bc2e8847eec9689ccbff` |
| `srvprotianti/ygopro/ocgcore` | `e04144d62499c17d0cfa8313f9742434ef99c3a7` |

工作树存在原有改动，尤其 `ygopro/lflist.conf`；上述提交号不能替代资源文件 hash，
也不能推断生产二进制一定由这些提交编译。以下行号按本次核查时的本地源码。

## 1. WSS 与原始协议

- [ygopro-server.coffee](../../srvprotianti/ygopro-server.coffee) 第 688–697 行为独立的
  `modules.neos` WebSocket 服务。SSL 使用 `modules.http.ssl` 的证书设置；未启用 SSL 时为 WS。
  [data/default_config.json](../../srvprotianti/data/default_config.json) 第 209–212 行默认禁用 Neos、端口为 7977。
  7911 是默认游戏 TCP，7922 是既有部署文档的 Web/API；两者都不能直接当作 Neos WSS 地址。
- 处理器第 4515–4523 行设置 `client.isWs` 后进入通用 `netRequestHandler`。
  第 2411–2428 行分别监听 WS `message` / TCP `data`，共享协议处理链。
- [YGOProMessages.ts](../../srvprotianti/YGOProMessages.ts) 第 194–214 行确认 WS 和 TCP
  发送同一种原始二进制封包：`uint16LE(payload.length + 1) + uint8 opcode + payload`。
  没有额外 JSON、Base64 或 Protobuf 外壳。第 242–267 行按长度重组拆包/粘包。
- [gframe/config.h](../../srvprotianti/ygopro/gframe/config.h) 第 29 行为 `PRO_VERSION = 0x1362`；
  默认配置的 4945 为 `0x1351`。宿主第 456–463 行优先从该源码读取版本，失败才回退配置。
  第 2507–2544 行处理版本拒绝和 alternative version；前端不能只改版本号便宣称兼容。
- [gframe/network.h](../../srvprotianti/ygopro/gframe/network.h) 第 75–97 行定义
  `PLAYER_INFO.name` 为 20 个 `uint16_t`，`JOIN_GAME` 为 48 字节，包含 version、padding、gameid、
  20 个 `uint16_t` 的 pass。前端应按 UTF-16 代码单元限制文本并预留终止符，禁止静默截断凭据。

尚未知：生产 Neos 开关、端口、WSS URL、可信证书、反代路径与空闲超时、实际运行协议版本。
HTTPS 静态站对接可信 WSS 是上线门槛；现有 HTTP 部署草案不能证明它已经具备。

## 2. 真实 IP 与入口防护

- 宿主第 4519–4520 行读取物理来源和 `settings.modules.neos.trusted_proxy_header`；
  默认配置却提供 `neos.ip_header`。这是已确认的配置键不一致，未发现这两个键之间的迁移。
- 第 1409–1424 行只对 `modules.trusted_proxies` 中的物理来源采用代理头，并取逗号列表第一项。
  第 1437–1447 行据此判定本机连接和连接数，第 2872–2874 行还按 IP 限制进房数量。
  代理未正确传递真实 IP 会影响限流、配对和无密码连接的重连身份。
- 第 695 行创建的 WS Server 未配置 Origin allowlist 或显式 `maxPayload`；
  Neos 连接处理器将 `setTimeout` 替换为无操作。不能把 TCP 的两秒入场超时视为 WS 也有的保护。

上线前需要单独验收代理对头部的覆盖、可信来源白名单、真实 IP、WS Origin 策略、握手限速和
空闲/消息大小边界。仅修改前端 URL 或配置 CORS 不会完成这些服务端入口工作。

## 3. TT 身份、Match 与房间命令

- [ladder-core/index.js](../../srvprotianti/plugins/ladder-core/index.js) 第 9 行用
  `trim().toLowerCase()` 作为账户键；第 41–60 行首次天梯认证创建账户，已有账户验证密码。
  [config.default.json](../../srvprotianti/plugins/ladder-core/config.default.json) 默认
  `mode=TT`、`requirePassword=true`。无新账号后端/无 SSO 不等于 TT 无需账户密码。
- 宿主第 2470–2490 行从 `PLAYER_INFO.name` 的 `nickname$password` 解析虚拟密码，
  会先删除全部反斜杠、再 `split('$')`，只取第二段作为密码。按后续明确的产品设计，
  昵称框兼容这一原版登录串；应校验额外分隔符、反斜杠、NUL 等有歧义输入，完整串受名字字段限制。
  密码不得进入公开昵称、URL、日志、遥测或 localStorage。2026-10-10 用户要求网页刷新保留密码，
  完整输入改存当前标签页 sessionStorage；一键观战入房或取消后清空。
- `JOIN_GAME.pass` 是另一个字段。按当前设计，统一联机页把玩家填写的房间名原样放入该字段；
  输入 `TT` 进入天梯，其他输入按宿主普通房名／命令语义处理。账号凭据不能混入房间字段，
  也不能在普通房或天梯重连失败后悄悄加入新房或自动改成 TT。
- 宿主第 2547 行对 `info.pass` 执行 trim，第 790 行模式识别使用 toUpperCase；
  因而 `tt` 等也可能触发 TT。第 789–807 行处理同名房加入／不存在创建，第 907–917 行
  保留 `房名$房间密码` 语法。前端不得把昵称的分隔符限制套到房间字段；房间串可能有密码，
  默认不持久化或记日志。特殊命令／空值沿用服务端开关，不能自动补 TT。
- 插件第 284–290 行注册双人、`M#` 前缀的 TT 随机模式；宿主第 1521–1522 行将其设为
  `hostinfo.mode=1`（Match）。G1–G3、换备、换备确认/错误和完整 Match 结束是首版必需验收。
- 插件第 298–307 行禁止通过具体 TT 房名选对手：等待阶段拒绝，开局后转为观战。
  第 311–328 行处理同名席位、认证和匿名/重连策略。不能把 TT 房间列表的“加入”做成指定对战入口。
- [public-room-web/README.md](../../srvprotianti/plugins/public-room-web/README.md) 定义
  `GET /api/public/rooms` 为脱敏接口；`users` 可含观战席，`roommode` 不是 TT 模式标识。
  不应调用管理员 `/api/getrooms`。首版若不做房间列表，可完全不依赖这类 HTTP API。

## 4. 规则、卡池与禁卡表

- 默认 `hostinfo.duel_rule=5`，TT 插件没有将其改为 2。
  [single_duel.cpp](../../srvprotianti/ygopro/gframe/single_duel.cpp) 第 586 行把
  `host_info.duel_rule << 16` 传入 core，不能从“706”名字推断生产已运行 MR2。
- [game.cpp](../../srvprotianti/ygopro/gframe/game.cpp) 第 109–115 行的服务器入口读取
  `cards.cdb` 及 expansions。`plugins/card-catalog/databases` 是卡片目录插件的输入，
  不能仅凭它存在便证明与决斗 core 实际加载数据库一致。
- [deck_manager.cpp](../../srvprotianti/ygopro/gframe/deck_manager.cpp) 第 82–151 行使用
  `hostinfo.rule` 映射 `AVAIL_OCG/TCG/SC/CUSTOM/OCGTCG`，通过 `(ot & avail) == avail` 判断可用性，
  并按 `get_duel_code()` 合并同名/alias 的总张数、检查禁限卡。
  `single_duel.cpp` 第 360–364 行仅在 `no_check_deck=false` 时执行合法性检查。
- `deck_manager.cpp` 第 155–199 行按数据库卡片 type 拆分主卡/额外，未知卡和 Token 报错；
  第 226–239 行还约束换备前后各区数量。客户端不能仅按前端显示列表决定可投入或可换备规则。
- 宿主第 464–467 行加载 expansions 与根目录禁卡表；core `deck_manager.cpp` 第 55–64 行
  按同类顺序加载。核心按内容生成 YGOPro LF hash（第 28、49–50 行）。文件 SHA-256 与 LF hash
  解决不同问题，发布应同时固定资源身份和实际房间选中的规则身份。

尚未知：生产实际 MR2、`rule`、`no_check_deck`、生效 LF hash、实际 core CDB 及 expansions
合并结果、卡池如何通过 OT/数据库/额外校验限制。必须以脱敏配置摘要与真实房间握手验收，
包括服务器拒绝池外卡、Token、禁卡超量和非法换备，不能只验证卡组编辑器隐藏卡片。

## 5. 手机断线与重连

- 宿主第 964–970 行：在无 MyCard 时，有 vpass 的授权键为精确 `name_vpass`，
  普通无密码连接通常为 `IP:name`。账户查询的小写键不意味着重连允许改变昵称大小写。
- 第 1057–1062、1137–1150、3870–3871 行：断线登记保存 G1 起始 `UPDATE_DECK` 原始 payload，
  重连须按字节相等校验。只保存排序后的卡 ID 集合或使用当前换备后的卡组不足以重连。
- 第 1166–1206 行先发 `JOIN_GAME` / `TYPE_CHANGE` / 玩家信息，再按猜拳、先后攻、换备、对战状态恢复。
  第 3841–3857 行收到初始卡组后完成重连；对战中向后端 `REQUEST_FIELD` 并恢复当前选择/计时确认。
  需确认 Neos 能处理场面重载和重发的提示/选择，不可仅重新建立 WebSocket。
- 默认重连窗口为 90000 ms（`data/default_config.json` 第 128–132 行）；这是默认值，非线上承诺。
  TT 插件开启并发重连以及双方均超时不计分策略；服务器是否启用重连仍依赖部署配置。

客户端应保存精确入场昵称、初始卡组 payload 与房间命令的恢复快照；2026-10-10 普通表单改用当前标签页 sessionStorage 保留完整昵称／房名，刷新后回填密码，但仍需手动入房和选择 G1 卡组。
须区分主动退出/投降、网络中断、服务器拒绝和结束，禁止对旧 RESPONSE 做自动重发。
验收必须含后台切换、锁屏、Wi-Fi/蜂窝切换、刷新保留两种密码、换备中断、旧 socket 未关闭与多标签页。

## 6. STOC_REPLAY 与对战隐私

- `network.h` 第 296 行定义 `STOC_REPLAY=0x17`。
  `single_duel.cpp` 第 553–568 行创建 `YRP2`、`REPLAY_UNIFORM`、多值随机种子头，
  第 1829–1845 行把 `ExtendedReplayHeader + compressed bytes` 发给双方/允许的观战席。
  [replay.h](../../srvprotianti/ygopro/gframe/replay.h) 第 28–45 行给出头结构，
  [replay.cpp](../../srvprotianti/ygopro/gframe/replay.cpp) 第 119–139 行采用 LZMA 压缩。
  因此应区分“文件扩展名 .yrp”与“内部 YRP1/YRP2 格式”，不能只实现旧的单 seed YRP1。
- 宿主第 4151–4158 行已捕获并按设置拦截即时录像；默认 `replay_delay=true`。
  第 3431–3445 行在完整 Match `DUEL_END` 前发送积累的逐局录像，
  第 1334–1344 行可能连续发出多份录像。不是每局 WIN 后都立刻收到一份。
- 保存内容应仅为 `0x17` payload（不含 uint16 长度和 opcode），保留原字节与 hash，
  按接收顺序/Match 标识区分 G1–G3，并在路由离开前排空保存队列。
  捕获不到完整 Match 录像时显示“未收到”，不能伪造成功或把 Neos 自有格式改名 .yrp。
- 不得用公开录像接口提前获取当前 Match 的对手卡组，不得把对战中的隐藏卡从完整 CDB、
  Replay 或历史消息推算补显。TT 等待匿名要原样保留服务端发送的掩码名字。

源码已证明该能力和格式，但生产是否发包、延迟策略、二进制与源码版本一致性仍需用授权测试对局确认。
Replay WASM 必须兼容此 core 的 API、PRNG/seed、Lua、CDB 和脚本版本，换用任意 WASM core 不能保证复现。

## 7. 四语边界

宿主第 2492–2504 行按默认语言/GeoIP 设置服务器聊天语言，不读取浏览器 locale。
第 3651–3678 行支持 `CTOS_CHAT` 命令 `/zh`、`/en`、`/ja`、`/ko`，并取消向其他玩家广播这些命令。
客户端在入房和用户切换语言后可同步发送对应命令；入房前拒绝文本仍可能是服务器默认语言，
已经收到的聊天也不会重新翻译。UI/system strings/卡片文本四语切换不能被写成“所有服务器消息实时重译”。

## 8. 施工前留存的联调证据

联调按施工清单分期推进：P0 验证可信 WSS、TT 身份与版本握手、HostInfo 和换备路径；
P2/P3 完成双客户端完整 Match 与断线恢复；P4 验证逐局 `0x17` 捕获。
记录服务器版本、脱敏 HostInfo、资源 hash、平台与复现步骤，
抓包样本删除昵称密码及其他私密内容。UI 瘦身、四语和卡组编辑可并行准备；P0–P3 在线验收
未通过时不能宣称已达到“手机打开即玩”的上线条件，录像捕获单独按 P4 验收。
