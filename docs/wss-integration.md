# SRVPro WSS 配置与本地联调

现有 `121.4.34.71:7911` 是原生 YGOPro TCP 入口，浏览器不能直接连接。网页和四语卡池继续由外部 HTTPS 静态站点托管；SRVPro 只承担对战连接和现有天梯逻辑。站方通过 `duel-config.js` 或构建变量 `VITE_DUEL_WS_URL=wss://...` 固定入口，玩家只填写昵称和房名：`TT` 进天梯，其他房名进普通房。

## 服务端源码如何提供 WSS

`srvprotianti/data/default_config.json` 中 `modules.neos.enabled` 默认是 `false`，端口默认 `7977`。`ygopro-server.coffee` 在它开启时创建独立 Neos WebSocket 服务；当 `modules.http.ssl.enabled=true` 时，Neos 监听器使用 `modules.http.ssl.cert` 和 `key` 创建 HTTPS，也就是直接提供 WSS。普通 HTTP 端口 `7922`、HTTPS 端口 `7923`、Neos 端口 `7977` 各自独立，7911 始终是原生 TCP。

要由 SRVPro 自己终止 TLS，部署配置需要包含以下字段（这里只列出相关字段，勿覆盖已有其他配置）：

```json
{
  "version": 4962,
  "hostinfo": { "lflist": 0, "rule": 0, "duel_rule": 2 },
  "modules": {
    "neos": { "enabled": true, "port": 7977 },
    "http": {
      "ssl": {
        "enabled": true,
        "port": 7923,
        "cert": "ssl/fullchain.pem",
        "key": "ssl/privkey.pem"
      }
    }
  }
}
```

上面的 `ssl/fullchain.pem` 和 `ssl/privkey.pem` 只是文件路径，开启 SSL 不会自动生成证书。仅在本机联调时，可以在 `srvprotianti` 目录运行下面的命令，生成覆盖 `localhost` 和 `127.0.0.1` 的临时自签名证书；重新生成后需重启服务器。证书有效期为一天，且普通浏览器不会默认信任，正式 WSS 必须换成覆盖实际域名的受信任证书。

```powershell
python ..\srvprotiantiweb\scripts\make_local_cert.py ssl
Copy-Item ssl\cert.pem ssl\fullchain.pem -Force
Copy-Item ssl\key.pem ssl\privkey.pem -Force
```

`version=4962` 是网页发送的协议版本 `0x1362`。服务器默认 JSON 仍写 `4945`，但启动时会尝试从 `ygopro/gframe/config.h` 读取 `PRO_VERSION` 并覆盖运行值；本机日志确认实际使用 `0x1362`。正式服要以启动日志和握手结果核对，不能只看默认 JSON；运行值不对齐会在入房时被拒绝。`hostinfo.lflist=0` 是服务端禁表**索引**，不是网页看到的 hash `0x73ec4051`。只有当 2011.3.1 禁表是服务端和 YGOPro Core 加载的第一个列表时，索引 0 才选中它。服务端的 `ygopro/lflist.conf`、Core 卡库及脚本也需与 1103 环境匹配，不能只改配置中的索引。证书必须由浏览器信任且覆盖 WSS 域名；外部 HTTPS 页面不能依赖自签名证书。

**`neos.enabled` 不支持热更新。** `config/config.json` 在进程启动时读取；Neos 监听器只在启动流程中按当时的配置创建一次。改动 JSON 文件不会让现有进程新增／关闭 Neos 端口，TLS 证书也在启动时读取。更改 `neos.enabled`、`neos.port`、`http.ssl` 或证书后，必须重启本地服务器进程。仅把 `neos.enabled` 设为 `true` 且保持 `http.ssl.enabled=false` 时，7977 提供的是明文 `ws://`，当前网页联机配置只接受 `wss://`。

也可以让现有反向代理终止 TLS：SRVPro 开启 `modules.neos.enabled`，保持 `modules.http.ssl.enabled=false`，代理将公开的 `wss://` 路径转发到服务端 `ws://127.0.0.1:7977`。当前 Neos 源码只按端口监听，没有单独的监听地址配置；必须用防火墙限制 7977 的直接访问。代理应透传 WebSocket Upgrade，将 `X-Forwarded-For` **覆盖**为真实客户端 IP。源码读取的是 `modules.neos.trusted_proxy_header`，而默认配置写的是 `ip_header`；若使用代理，需明确设置 `trusted_proxy_header: "x-forwarded-for"`，并将代理的确切地址加入 `modules.trusted_proxies`。不要信任任意客户端自报的转发头。当前源码未对 Neos Upgrade 实施 Origin 白名单、握手限流或专门的消息大小限制；公开入口应在代理层落实这些边界，或先在服务端补齐。

## 已完成的本机测试

手动试玩：在 `srvprotiantiweb` 运行 `npm run play:local-wss`，等待构建完成后会自动打开带临时证书例外的独立 Edge 窗口，同时在终端打印网页地址和临时 WSS 地址。打开第二个标签页访问同一网页地址；两名玩家填写**不同昵称**、相同普通房名即可进入同一房。测试天梯时两名玩家分别填写 `昵称$密码`，房间名都填 `TT`。测试结束后回终端按 Ctrl+C。该命令保持本地隔离实例运行，不使用实际服务器私密配置，也无需手动改 `.env.local`。如果只运行 `npm run dev`，仍须先在 `.env.local` 配置已经可用且受浏览器信任的 `VITE_DUEL_WS_URL=wss://...`。

在 `srvprotiantiweb` 运行 `npm run test:local-wss`。脚本仅从本地服务器项目读取默认配置、选定插件、Core 可执行文件和脚本，在网页项目 `.audit-tmp` 下创建临时实例；Core 的 `cards.cdb`、`strings.conf` 和禁表使用本项目生成的 1103 资源。实例使用随机 TCP/HTTP/HTTPS/WSS 端口、内存 SQL.js 数据库和临时自签名证书。测试结束会关闭进程并删除临时实例与证书。它不读取服务器私密 `config/config.json`、不连接生产数据库、不修改服务器项目，也不重启正式服。Playwright 对本机证书跳过信任检查，所以此测试不证明公网证书有效。

本机测试已通过：两个真实浏览器客户端经 WSS 进入同一普通 Single 房；另外两名带密码段的昵称以房名 `TT` 进入 Match 天梯房。两类房间均返回禁表 hash `0x73ec4051` 和 MR2；默认 40 卡测试卡组可准备，双方完成猜拳及先后手选择，两个页面都进入实际对局画面。测试还发现并修正了上游 Neos 把 Core 猜拳编号 1／2 映射反的问题。

2026-10-06 扩展隔离实例回归：普通 Single 完成弃权结束并在第一次重入时成功进新房；TT 通过交替弃权完成真实 G1–G3、两次换备提交与先后手选择、整场退出后的昵称／密码保留。测试发现并修复未打开的卡片详情层遮挡换备确认按钮的问题。它验证真实 Core 的整场生命周期，不代替正常打牌的全部卡片交互、实际换入不同备牌、生产数据库结算或手机真机验收。

正式服配置和重启由服主执行；仍需核验真实证书／域名／反代／防火墙、生产卡库及禁表顺序、外部静态站点到 WSS 的访问、手机真机、断线恢复、公网完整比赛和非法卡拒绝。没有可用 WSS URL 时，可使用本地卡组功能。

## 正式入口与当前上线阻塞（2026-10-06）

拟用连接地址为 `wss://duel.ygomatch.xyz/neos`，尚不是玩家可正常访问的正式入口。当前部署采用 Windows Nginx 在 443 终止 TLS，转发至 SRVPro 的 `ws://127.0.0.1:7977`；SRVPro 保持 `modules.http.ssl.enabled=false`，启用 Neos，并设置 `trusted_proxy_header: "x-forwarded-for"`。

- 用户在正式服务器上确认 7977 TCP 可连接；使用域名和本机地址的 HTTPS 检测通过证书校验，根路径按配置返回 404；`/neos` Upgrade 返回 `101 Switching Protocols`。检测命令随后达到设定的 5 秒超时，不代表握手失败。
- Google 与 Cloudflare 公共 DNS 查询均返回 `121.4.34.71`。常规公网域名 HTTPS／WSS 握手被关闭；公网 HTTP 返回 302，跳至 `https://dnspod.qcloud.com/static/webblock.html?d=duel.ygomatch.xyz`，目标页面标题包含备案提示。
- 用户确认服务器位于中国大陆，域名在境外，`ygomatch.xyz` 尚未备案且**当前无法办理备案**。这是当前部署约束，不能把“先完成备案”作为唯一后续步骤。当前直连入口受到腾讯云未备案域名拦截，与其官方描述的 HTTP 提示页跳转、HTTPS 阻断相符：[备案概述](https://cloud.tencent.com/document/api/243/18907)。域名在境外并不会自动消除大陆源站的接入要求；此处记录用户确认的“当前无法办理”，不推断所有境外注册域名都永久无法备案。
- 为区分证书／转发故障与域名访问限制，诊断曾省略 TLS SNI，同时严格校验 `duel.ygomatch.xyz` 的证书；公网 HTTPS 返回 404，WSS 握手成功。这只是诊断证据，不是浏览器部署方案，也不能算正式网页验收通过。
- 本地 `.env.local` 已使用上述拟用 URL，静态包已重新构建并核对包含该地址；这不证明公网链路可用。开发模式更改环境变量后需重启 Vite；静态预览／部署需使用重新生成的 `dist`。

### 服务器项目已有的相关决策

只读检查 `srvprotianti` 的开发文档，未找到明确记载“境外域名、当前无法备案”的条目。找到的相关背景是：

- [Windows HTTPS 草案](../../srvprotianti/docs/CADDY_HTTPS_DEPLOYMENT.md) 的状态日期为 2026-09-15，当时没有可用自有域名，维护者决定本期保持 HTTP；Caddy 和 Tailscale 均为未执行的未来方案。
- [天梯玩家与使用规范](../../srvprotianti/docs/LADDER_PLAYER_AND_USAGE_SPEC.md) §15.3 保留 Tailscale Funnel 备选，§15.5 记录本期使用 HTTP。

旧 Funnel 草案代理的是网站端口 **7922**，其“不影响游戏 TCP 7911 延迟”的判断只针对该架构。网页客户端需要代理 **7977 对战连接**，对局消息会经过中继；不能直接套用旧草案的性能结论。上述相邻项目链接供本地联合开发查阅，不是网页仓库单独检出必需的文件。

### 当前无法备案时的接入选择

前端和四语静态资源仍可放在 Cloudflare Pages 等外部 HTTPS 平台。Pages 只解决前端托管，不能单独解决对战 WSS 的公网访问。当前 Nginx 配置和证书通过本机测试，不需要为排查备案拦截重复申请证书或反复重启 SRVPro。

| 方案 | 接入方式 | 当前结论与代价 |
| --- | --- | --- |
| Cloudflare Tunnel | 服务器运行 `cloudflared`，经出站隧道将公开域名接到本机 Neos；前端仍放 Pages | 优先评估的技术候选。官方确认支持 WebSocket，可沿用自有域名；需要域名／Cloudflare 管理权限、Windows 服务部署，以及大陆网络到中继的实际测试。尚未部署或验证 |
| Tailscale Funnel | 为本机 Neos 提供 `wss://<设备>.<tailnet>.ts.net/...` 入口 | 服务器旧文档已有的备选。玩家无需安装客户端；需服务器端账户／设备授权，不能沿用自定义域名，且目前为 beta、有带宽限制。尚未验证 Neos WebSocket、真实 IP 或整场对局 |
| 境外部署对战服务 | 将实际提供公开 WSS 的对战服务部署在香港或其他境外区域 | 涉及新增服务器、数据库／插件及卡库同步、迁移和延迟测试；仅把反向代理搬到境外不等于大陆源站的备案问题已经解决 |

资料：[Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/)、[Tunnel WebSocket 支持](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/#does-cloudflare-tunnel-support-websockets)、[Tailscale Funnel 条件与限制](https://tailscale.com/docs/features/tailscale-funnel)。隧道是不同的网络接入架构，不是已确认的“免备案”结论；保留大陆源站时，服主仍需核对云平台对该服务形态的要求。

### 本轮已实施的上线测试方案

用户决定今年继续使用当前服务器，明年换服务器后再处理直连与备案；域名 DNS 暂不能确认可调整。已准备 [当前服务器上线测试手册](current-server-online-test.md) 和 `deployment/windows/`：用无需账号／改 DNS 的 Quick Tunnel 做临时 WSS，经过仅监听本机的 Nginx 7978 转发到 Neos 7977，保留可信客户端 IP、Origin 白名单和握手限速。网页及卡库使用外部 Workers／Pages。长期固定入口仍待后续条件确定，不以 Quick Tunnel 替代稳定部署。

本机同版本 Nginx 1.30.5 的网关回归及服务器包的 PowerShell 检查脚本已通过，覆盖 IPv4／IPv6、XFF 覆盖、二进制消息、错误 Origin／缺 IP／额外路径拒绝。已校验 Cloudflare 官方 Windows 工具 2026.10.0 的发布 SHA256，并准备启动、检查和打包工具。

2026-10-07 用户提供实际 Workers 静态入口 `https://black-surf-69e5.1627406938.workers.dev/`。开发机按常规 HTTPS 读取首页和 `duel-config.js` 均返回 200，入口文件与交付包一致，连接配置为空，响应头 `Cache-Control: no-store` 已生效。服务器包通过 `--site-origin https://black-surf-69e5.1627406938.workers.dev` 填好 Origin 白名单；这一步只确认静态托管，正式服务器 WSS 及公网对局仍待联调。

该站点 Edge 桌面／手机尺寸回归已通过，覆盖首页、四语切换、未配置时禁止联机和示例卡组编辑入口；没有跳过公网证书校验，没有向生产服务器发送登录或对局。手机真机及 WSS 实战仍待验收。

同日检查用户提供的 Nginx 主配置，发现旧手册的 `include conf/neos-tunnel.conf;` 在 `conf/nginx.conf` 布局下会读取 `conf/conf/neos-tunnel.conf`，造成配置检查失败。已修正本地配置与手册为 `include neos-tunnel.conf;`，使用 Nginx 1.30.5 在隔离的同目录布局复现旧路径失败、修正路径成功。此配置检查没有重载正式服务器；正式服务器仍须执行自己的 `nginx -t`，核对证书和实际部署文件。

服务器随后报告 Windows PowerShell 5.1.20348.4294 在两个脚本参数默认值中使用 `$PSScriptRoot` 时为空。已将默认路径解析移到脚本主体，使用 `$MyInvocation.MyCommand.Path`，并修复 Windows 上重定向日志的共享读取。`npm run test:windows-tunnel-scripts` 在开发机 PowerShell 5.1 使用真实 `-File` 调用，验证默认及显式路径、带空格目录、不同 cwd、官方二进制 SHA 与拒绝覆盖不同文件、离线模拟子进程及 endpoint/logs；全项通过。该模拟没有创建公网隧道，正式服务器 WSS 仍待服主执行新版脚本。

服主执行新版脚本后提供 `wss://districts-studios-rear-representation.trycloudflare.com/neos`。2026-10-07 开发机以 origin `https://black-surf-69e5.1627406938.workers.dev` 验证正常 SNI／受信任 TLS 和 101，约 1941 ms；从该网页的独立 Edge 上下文进行浏览器握手也成功，约 1536 ms；origin `https://untrusted.example` 返回预期 403。首次握手检查通过专用测试路由覆盖连接配置，没有提交登录或任何对局数据；当时公网配置为空。该 URL 仅对应本次存活隧道，不能记作固定长期入口。

用户随后上传 `20261006-212633-302486` 联机候选包，公网配置已改为实际入口、`Cache-Control: no-store` 生效，部署信息与包一致。独立 Edge 上下文直接使用线上配置，两标签页临时昵称在独立普通房通过第一次加入、示例卡组准备、猜拳、先后手、进入对局、弃权结束、双方昵称／房名保留和第一次再次入场，没有页面脚本错误。没有修改响应或忽略 TLS，也没有进入 TT 或使用正式玩家账号；普通房可能生成宿主日志／录像，不能称为完全没有生产写入。

该普通房实测 Single／MR2／LP8000，禁表 hash `0x4250bce9` 与客户端／隔离真实 Core 的 `0x73ec4051` 不同。用户确认正式服应为纯 2011.3，并提供实际文件；已查明两个错误卡号，其中光之护封剑的正确 ID 未被限 1。修正版与客户端 134 条基线逐条一致、hash 恢复为 `0x73ec4051`，其余 102 张表字节不变；原文件、网页提示及客户端基线未改。只读诊断支持服务器目录或 `--file` 单文件检查。正式替换与新房间复验、正常完整比赛、生产 TT 和真实客户端 IP 仍待验收，操作见 [正式禁表修正](banlist-diagnosis.md)。

开发机创建隧道的尝试未通过：默认中继 DNS 被本机代理解析成 `198.18.*`；使用公共 DNS 查得的真实中继地址做进程级诊断后，TCP TLS 仍 EOF，QUIC 也超时。该限制不影响开发机浏览器连接正式服务器随后创建的上述公网隧道；独立公网普通房生命周期已通过，真实 IP、防伪与完整比赛仍待验收。诊断没有修改整机 DNS／代理或正式服务器。

网页新增站方 `duel-config.js`，优先于构建环境变量，固定地址仍不向玩家开放。重启 Quick Tunnel 后可更新此文件并重新上传静态包，无需重新编译；空配置明确禁用在线入场。`npm run package:test` 生成无凭据的 Pages 和 Windows 包，指定 `--wss-url` 后生成含实际入口的测试候选。运行 `npm run test:tunnel-wss` 可在网络允许时复用隔离 SRVPro 经真实公网隧道运行浏览器整场回归，不向生产库写入测试对局。

不能用 `ws://`、自签名证书、关闭证书验证或省略 SNI 作为玩家入口。公网 IP 证书也只解决 TLS 身份验证；腾讯云说明大陆 IP 访问网站仍有备案要求，因此不把换成 IP 证书写作备案问题的解决方案：[备案场景](https://cloud.tencent.com/document/product/243/18910)。

候选方案必须补齐以下验收后，才能替换固定 WSS 地址并发布：

1. 普通浏览器在无证书例外、无需玩家代理软件的条件下，完成公网 HTTPS／WSS 握手；测试主要玩家所在网络。
2. 核对真实客户端 IP。Neos 根据 `trusted_proxy_header` 和物理代理来源取 IP，涉及封禁、连接限制和重连；加隧道后不能仍将所有玩家记作 `127.0.0.1`。Cloudflare 可提供 `CF-Connecting-IP`，但需只信任受限代理入口；若保留 Nginx，其现有 `X-Forwarded-For $remote_addr` 在本机隧道转发时会写入代理 IP，须按新链路调整并测试伪造头拒绝。Funnel 的转发方式也需实测，不能假定它保留原始 IP。[Cloudflare 请求头说明](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip)
3. 两名不同公网玩家完成普通房及 TT 的完整 G1–G3、换备、退出再入场与断线恢复；同时核验原生客户端互通。
4. 测长连接稳定性、往返延迟、并发及服务器 CPU／内存消耗。代理进程增加资源占用，网页对局经过中继可能增加延迟；Cloudflare 网络更新可能关闭 WebSocket，需按实际服务器重连能力验收。[Cloudflare WebSocket 注意事项](https://developers.cloudflare.com/network/websockets/)
5. 验证 Windows 服务开机恢复、入口证书续期、隧道故障提示和回退；前端更新 `VITE_DUEL_WS_URL` 后重新构建 `dist`。保留原生 `121.4.34.71:7911` 入口，不把它改成隧道目标。

公开入口尚未确定时，继续使用隔离本机 WSS 测试，不将当前受阻 URL 标记为线上验收通过。若将来可以完成备案与云平台接入，现有 Nginx 直连架构仍可继续验收。
