# 当前 Windows 服务器：网页版上线测试

更新：2026-10-07。用户决定今年继续使用 `121.4.34.71`，明年更换服务器后再处理正式直连与备案。当前域名 DNS 尚未接入 Cloudflare，协作者能否调整 DNS 未确定。

本轮采用 **Cloudflare 外部静态网页（Workers／Pages）+ Cloudflare Quick Tunnel 临时 WSS** 进行公网测试，不依赖调整 `ygomatch.xyz` 的 DNS。Quick Tunnel 是测试服务，地址随进程重启变化，没有可用性保证，不能当作已经完成的长期正式部署。若后续可调整 DNS，可升级为命名 Tunnel；若不能，可另验收旧文档已有的 Funnel 固定 `*.ts.net` 入口。[Quick Tunnel 官方说明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

实际静态入口已由用户部署在 Workers：**https://black-surf-69e5.1627406938.workers.dev/**。Workers Static Assets 同样适用，不需要为本轮测试迁移到 Pages。本说明中“网页 origin”统一使用 `https://black-surf-69e5.1627406938.workers.dev`，不带末尾斜杠。2026-10-07 开发机读取首页与 `duel-config.js` 均为 HTTPS 200，首页与交付包一致，初次上传的配置为空且 `Cache-Control: no-store` 生效。[Workers 静态托管](https://developers.cloudflare.com/workers/static-assets/get-started/)、[Workers 响应头](https://developers.cloudflare.com/workers/static-assets/headers/)

同日通过该公网网页的 Edge 桌面／手机尺寸回归：主页、四语切换、未配置地址时禁用联机、1103 示例卡组和编辑器入口正常，无页面脚本错误或同站点资源 HTTP 错误。手机尺寸模拟不等于 Android／iOS 真机验收，检查没有连接生产天梯。

正式服务器已启动本轮临时入口 **`wss://districts-studios-rear-representation.trycloudflare.com/neos`**。使用当前 Workers origin 的 Node 握手返回 101，正常 SNI／受信任 TLS 验证通过；Edge 从真实网页也握手成功，错误 origin 被返回 403。用户再次上传联机候选包后，公网 `duel-config.js` 已使用上述地址，`no-store` 生效，`deployment-info.json` 与交付包一致。

未覆盖网页配置的 Edge 两标签页使用临时昵称和独立普通房，通过第一次入房、卡组准备、猜拳、先后手、进入对局、弃权结束、双方昵称／房名保留及第一次再次入场。正式房间返回 Single／MR2／LP8000，但禁表 hash 为 **`0x4250bce9`**，不同于客户端及本地真实 Core 基线 **`0x73ec4051`**。用户提供的正式禁表已复现该差异：两个错误卡号导致 hash 不同，并漏掉光之护封剑限 1；修正版已备妥，正式替换和新房间复验仍待执行，网页提示保留。检查没有进入 TT、使用正式玩家账号或向天梯排行榜提交测试 Match；普通房检查仍可能生成服务器日志／录像。入口随隧道进程终止失效，重启后必须更新地址；本次弃权回归不代表正常完整比赛、规则一致性、真实客户端 IP 或手机真机已经验收。

## 1. 此轮实际连接链路

```text
玩家浏览器 ← HTTPS → 外部 Workers / Pages（网页、CDB、WASM、界面资源）
玩家浏览器 → wss://随机地址.trycloudflare.com/neos
            → Cloudflare → 服务器 cloudflared 出站隧道
            → http://127.0.0.1:7978/neos（Nginx，仅本机监听）
            → ws://127.0.0.1:7977（现有 Neos）
            → 现有普通房 / TT / YGOPro Core
```

玩家自行输入昵称和房名；`TT` 是天梯，其他名称沿用原生联机规则。原生客户端仍连接 `121.4.34.71:7911`。7922 网站与原有 443 Nginx 站点继续使用现有配置；网页构建和静态资源不放在天梯主机上。

公网 TLS 由 Cloudflare 提供，源站通过加密隧道连接 Cloudflare；本机 7978 → 7977 使用 WS。此次不需要重复申请 `duel.ygomatch.xyz` 证书，也不关闭任何证书校验。隧道接入不是已确认的备案豁免；当前架构的云平台服务条件仍由服主核对，现有直连域名限制的证据见 [联调记录](wss-integration.md)。

## 2. 交付文件

本地网页项目运行 `npm run build`，然后运行：

```powershell
npm run package:test
```

命令会在忽略 Git 的 `releases/时间戳/` 下生成：

- `web-pages.zip` 与 `web/`：只包含网页静态资源；未配置 WSS 时联机按钮禁用，可先测试首页、语言和组卡。
- `windows-server-kit.zip`：Nginx 配置、下载／启动／检查脚本和本说明；不含玩家凭据、私密配置或证书。
- `pm2-tunnel-kit.zip`：已部署服务器改用 PM2 时所需的两个启动文件和操作说明；使用已有 cloudflared，不含 Nginx 配置、二进制或运行数据。
- `SHA256SUMS.json`：三个压缩包的校验值。

已在开发机校验官方工具后，`npm run package:test -- --include-cloudflared` 可将便携 `cloudflared.exe` 与官方许可证附进服务器包，避免正式服务器再次下载。该二进制只进服务器包，不进网页包；若来源或 SHA 不符，打包会拒绝。

先上传网页取得静态地址，再将服务器包解压到例如 `C:\nginx\neos-test\`。也可直接从仓库复制 `deployment/windows/` 中的文件。服务器不需要安装网页工程的 npm 依赖、Python 或卡库。

## 3. 前端静态托管

当前 Workers 站点已经部署，无需重新创建 Pages 项目。后续更新保持同一个 Worker，将新网页包中的完整静态资源作为新部署上传。若另选 Pages，则按下面流程操作；两种平台均使用包内的 `duel-config.js` 和 `_headers`。

由可登录 Cloudflare 的维护者执行，不需要协作者域名的 DNS 权限：

1. 在 Cloudflare 的 **Workers & Pages** 创建 **Pages / Direct Upload** 项目，可尝试项目名 `srvprotiantiweb`。
2. 上传 `web-pages.zip`，确认压缩包根目录是 `index.html`，没有多套一层 `web/` 目录。
3. 记录平台实际返回的 `https://实际项目名.pages.dev`；名称被占用时平台可能添加后缀，以实际地址为准。
4. 用普通浏览器打开，核对四语卡库与组卡；此时尚未填公网 WSS，联机不可用是预期。

当前静态包约 13 MB、约 100 个文件，最大单文件约 2 MB，适用 Pages 拖放上传限制。Direct Upload 项目以后可以继续拖放或使用 Wrangler，但不能原地转换成 Git 自动构建项目。[Pages 上传与限制](https://developers.cloudflare.com/pages/get-started/direct-upload/)

## 4. 正式服务器确认 Neos

根据已提供配置，`srvprotianti/config/config.json` 相关片段应保持如下；只核对字段，**不要用片段覆盖整个文件**：

```json
"neos": {
  "enabled": true,
  "port": 7977,
  "trusted_proxy_header": "x-forwarded-for"
}
```

`modules.http.ssl.enabled` 保持当前 `false`，`modules.trusted_proxies` 保留本机代理：

```json
["127.0.0.1/8", "::1/128"]
```

配置已如此且 7977 正在监听时，不需重启 SRVPro。首次启用／更改 Neos 配置需重启进程；此项不热更新。通过云安全组／Windows 防火墙限制 7977 直接公网访问，保留原生 7911，不将 7978 开放到公网。

```powershell
$ProgressPreference = 'SilentlyContinue'
$neosReady = Test-NetConnection 127.0.0.1 -Port 7977 -InformationLevel Quiet
[Console]::WriteLine("Neos 7977: $neosReady")
```

预期 `True`。当前 Neos 没有独立的监听地址字段，不要凭空添加 `bindAddress` 期待它生效。

## 5. 给已有 Nginx 添加本机隧道入口

打开服务器包里的 `neos-tunnel.conf`，把示例 `https://srvprotiantiweb.pages.dev` 改为 **实际网页 origin**，本轮为 `https://black-surf-69e5.1627406938.workers.dev`，只含协议和主机名，不带 `/` 路径或 `#/...`。使用已针对该 origin 生成的新服务器包时，文件已填好地址。保留本地开发和预览 origin，便于先从开发机联调。

先备份已有配置，再将此文件复制到 `C:\nginx\conf\neos-tunnel.conf`。在已有 `nginx.conf` 的 **`http { ... }` 内**追加一行，保留现有 443 server：

```nginx
include neos-tunnel.conf;
```

不要放在顶层或 `server { ... }` 内。这里的相对 include 以主配置所在目录解析：主配置为 `C:\nginx\conf\nginx.conf` 时，上面的写法读取同目录 `neos-tunnel.conf`。旧手册中的 `include conf/neos-tunnel.conf;` 会多拼一层 `conf`，已于 2026-10-07 用 Nginx 1.30.5 复现并修正；也可写绝对路径 `include C:/nginx/conf/neos-tunnel.conf;`。若原 http 已设置 `map_hash_bucket_size`，合并为至少 128，避免重复指令；默认用户所提供配置没有该项。

```powershell
Set-Location C:\nginx
.\nginx.exe -t
# 仅在检查成功时执行
.\nginx.exe -s reload
```

这是 Nginx 重载，不需要重启 SRVPro 或整台服务器。7978 仅绑定 `127.0.0.1`，不是新的公网端口。

先执行本机网关检查：

```powershell
powershell -NoProfile -File C:\nginx\neos-test\Test-NeosGateway.ps1 -SiteOrigin https://black-surf-69e5.1627406938.workers.dev
```

预期有效请求为 101；缺客户端 IP、错误 Origin 为 403；其他路径为 404。此检查不发送玩家登录，不证明公网可达。

这里的 `X-Forwarded-For` 用 Cloudflare 注入的 `CF-Connecting-IP` 覆盖，而不是用 `$remote_addr`；后者在此链路中只是本机 `cloudflared`。Origin 只允许列出的网页；握手按客户端 IP 限速，额外路径不转发到天梯后台。公网 7977 必须受限，否则请求可能绕过网关。

## 6. 启动临时公网隧道

使用本轮更新后的脚本。2026-10-07 用户的 Windows PowerShell 5.1.20348.4294 在旧脚本参数默认值中读取 `$PSScriptRoot` 为空；新版改为执行脚本后通过 `$MyInvocation.MyCommand.Path` 定位自身目录。启动日志使用允许共享写入的读取方式，避免 `Start-Process` 重定向日志占用导致异常。开发机 Windows PowerShell 5.1 的真实 `-File` 回归已通过默认／显式路径、目录含空格、从其他工作目录调用、官方二进制校验和离线模拟进程启动；没有据此宣称正式服务器隧道已连接。

已解压旧包时，将新版 `Download-Cloudflared.ps1` 和 `Start-NeosQuickTunnel.ps1` 覆盖到 `C:\nginx\neos-test\`，保留已配置的 Nginx 文件与现有 `cloudflared.exe`。本次脚本修复不需要重启天梯服，也不需要重新加载 Nginx。

在服务器 PowerShell 执行：

```powershell
Set-Location C:\nginx\neos-test
powershell -NoProfile -File .\Download-Cloudflared.ps1
powershell -NoProfile -File .\Start-NeosQuickTunnel.ps1
```

下载脚本使用官方 `2026.10.0` Windows x64 发布并验证 SHA256；拒绝覆盖不同版本的已有二进制。服务器下载 GitHub 不便时，可在开发机运行下载脚本后将已校验的 `cloudflared.exe` 复制到此目录，不需要安装系统服务。

启动脚本选择官方 `auto` 协议，优先 QUIC，必要时回退 HTTP/2；需要能出站访问 Cloudflare 的 UDP／TCP 7844，以及用于创建临时入口的 HTTPS。若明确只有 TCP 可用，可传 `-Protocol http2`。[Cloudflare 传输协议](https://developers.cloudflare.com/tunnel/reference/run-parameters/#protocol)

等待终端打印：

```text
Neos test endpoint: wss://实际随机地址.trycloudflare.com/neos
```

保留这个终端运行。Ctrl+C 只停止本脚本启动的隧道，停止后测试入口失效；重新运行会产生新地址。运行日志和 endpoint.txt 在包目录的 `runtime/quick-.../` 下。不要把创建隧道成功、根路径 404 或本机 101 当作公开对局验收。

需要关闭 PowerShell 后继续运行时，使用新增的 [PM2 后台隧道步骤](pm2-quick-tunnel.md)，将 `neos-quick-tunnel.cjs` 和 `ecosystem.neos.config.js` 交给 PM2，而不是把前台 PowerShell 脚本直接包在 PM2 内。切换会创建新临时地址，先更新网页并验证，再停止旧隧道；运行方式变化不使 Quick Tunnel 的地址变成固定域名。

脚本使用专用空配置，避免误加载账户已有的命名隧道配置。若服务器有代理的 fake-IP DNS、连接日志出现 `198.18.*` 或 TLS EOF，需要核对代理对 Cloudflare 中继域名的 DNS／路由；不要关闭 TLS 验证。开发机和正式服务器的网络可达性必须分别记录。

## 7. 固定网页入口并检查公网握手

取得服务器输出的 WSS 后，在 **开发机网页项目** 执行（下列随机地址必须换成真实值；静态 origin 已使用当前 Workers 地址）：

```powershell
npm run package:test -- --wss-url wss://实际随机地址.trycloudflare.com/neos --site-origin https://black-surf-69e5.1627406938.workers.dev
npm run check:wss -- wss://实际随机地址.trycloudflare.com/neos --origin https://black-surf-69e5.1627406938.workers.dev
```

无需再次编译：打包程序用当前 `dist/` 生成新发布包，并将固定 URL 写进 `duel-config.js`；它优先于构建时 `VITE_DUEL_WS_URL`。只提供站方公开地址，禁止放账号密码、Tunnel Token 或私钥。网页加载时读取该文件，玩家仍没有地址输入框。

将新 `web-pages.zip` 中的完整静态资源上传到原 Workers 项目作为新部署（使用 Pages 时上传到原 Pages 项目），并刷新页面。若需要人工更新配置，文件形式为：

```javascript
window.__SRVPRO_DUEL_CONFIG__ = {
  duelWebSocketUrl: "wss://实际随机地址.trycloudflare.com/neos"
};
```

随包 `_headers` 让 Workers Static Assets／Pages 对连接配置不缓存。隧道地址改变后，更新发布包并重新部署；源代码不必为随机 URL 改动。`check:wss` 使用正常 SNI 和受信任证书，只验证握手，不写生产数据。

## 8. 公网测试验收

使用事先约定的测试账号和卡组。正式 `TT` 对局可能写入排行榜及录像，不用真实玩家身份做自动测试。

- 两名玩家优先从不同公网网络进入同一普通房，完成准备、猜拳、先后手及 Single；退出后昵称保留，第一次重新入场成功。
- 再用 `昵称$密码` 和 `TT` 完成 G1–G3、两次换备、整场结束和再次匹配；验证昵称／密码在同一页面退出后保留。
- 同一 Edge 两个标签页用不同卡组，先提交一方换备，再切换另一方，确认不会加载对手卡组。
- 验证与桌面原生客户端同房互通、非法卡拒绝、1103 卡池、禁表 hash `0x73ec4051` 和 MR2。
- Android／iOS 真机完成选卡、换备与关键操作；测试移动数据和普通家庭宽带的访问及延迟。
- 检查服务器记录的客户端 IP 没有全部变成 loopback，中继前后的连接限制和封禁仍有效。
- 测断线重入、隧道停止／恢复、对局消息无往返时的长连接；记录 CPU、内存、延迟及掉线次数。Cloudflare 网络更新可能终止 WebSocket，必须按现有服务器重连能力验收。[WebSocket 注意事项](https://developers.cloudflare.com/network/websockets/)

本地隔离实例的自动弃权比赛只验证协议、换备和整场生命周期，不代表所有卡片交互或手机真机已经验收。公网结果未通过前，发布包状态保持“测试候选”。

### 8.1 正式房间禁表标识不一致

2026-10-07 实测正式普通房禁表 hash `0x4250bce9`，用户随后提供的实际文件计算结果完全相同。2011.3 段多出错误 ID `26202465`，并把光之护封剑 `72302403` 写成 `72304203`；另有正确三眼怪 ID 的注释误写。修正后 134 条（禁 50／限 66／准限 18）与客户端逐条一致，hash 为 `0x73ec4051`，其余 102 张表字节不变。修正版位于本机 `F:/MyCardLibrary/srvpro/lflist.fixed.conf`，具体差异、SHA、备份替换及复验操作见 [正式禁表修正](banlist-diagnosis.md)。正式服务器尚未替换，不能只把客户端预期改为观测值或取消提示后算验收通过。

将服务器工具包中的 [Check-NeosBanlists.cjs](../deployment/windows/Check-NeosBanlists.cjs) 复制到 `C:\nginx\neos-test`，在服务器 PowerShell 执行，替换 `--server-root` 为**实际运行的 SRVPro 项目目录**：

```powershell
Set-Location C:\nginx\neos-test
node .\Check-NeosBanlists.cjs --server-root "D:\实际目录\srvprotianti" --observed-hash 0x4250bce9
```

脚本只读 `ygopro/config/lflist.conf`、`ygopro/expansions/lflist.conf` 和 `ygopro/lflist.conf`，输出文件 SHA、表名、条数、重复 ID 和按已审查 Core 算法计算的 hash；不读取私密 `config.json`、不写文件、不重启服务。也可用 `--file "C:\路径\lflist.fixed.conf"` 单独核对上传文件；此模式输出文件内位置，不把它当成运行中 Core 索引。默认显示 2011.3 及匹配预期／观测 hash 的表；加 `--all` 列出全部表。`config/lflist.conf` 在启用 `SERVER_PRO2_SUPPORT` 的 Core 中先加载，脚本会提示其索引影响，不把这个编译条件当成已经确认。

已提供文件的内容差异现已定位，按修正文档备份并替换实际加载文件，重启 SRVPro 后复验新房间；Nginx 与当前隧道保持运行。若替换后的文件只产生客户端预期 hash，却运行中仍返回不同值，继续核对实际启动目录、运行中的 Core 版本／编译方式、加载顺序和当前房间是否为旧进程。

## 9. 故障与回退

| 现象 | 下一步 |
| --- | --- |
| 7977 False | 核对启动目录及 Neos 配置，必要时重启 SRVPro |
| nginx -t 失败 | 保留原配置，不重载；核对 include 层级、map_hash 与 7978 端口占用 |
| 本机检查 403 | 核对网页 Origin 和配置文件是否生效 |
| 本机检查 502 | 核对上游 7977 为 WS，且 Neos 已监听 |
| Join-Path 提示 Path 为空 | 替换两个新版脚本；旧版在参数默认值中读取脚本目录，服务器 PowerShell 5.1 也可能出现该错误 |
| 读取 stdout.log／stderr.log 提示文件被占用 | 替换新版启动脚本，其日志读取已允许后台进程同时写入 |
| 隧道未注册 | 查看日志，检查中继 DNS、出站 7844、代理；分别尝试 auto／http2 |
| 公网检查 403 | Origin 未加入网关；不要通过关闭所有访问限制处理 |
| 浏览器仍连接旧域名 | 查看站点的 duel-config.js 是否已更新，再刷新当前页面 |
| 房间提示禁表与 2011.3 不同 | 按 8.1 只读检查实际禁表、加载次序和 Core；不直接取消提示或改预期 hash |
| 隧道已停／重启 | 取得新 WSS，重新打包上传，玩家退出后重新入场 |

回退时先让玩家结束测试，Ctrl+C 关闭对应 Quick Tunnel；从 nginx.conf 移除本次新增 include，检查并重载。保留原 443 站点、7922 和原生 7911；不删除或覆盖 SRVPro 私密配置。隧道停用后，将网页连接配置留空即可明确禁用在线入场，离线组卡仍可用。
