# SRVPro WSS 配置与本地联调

现有 `121.4.34.71:7911` 是原生 YGOPro TCP 入口，浏览器不能直接连接。网页和四语卡池继续由外部 HTTPS 静态站点托管；SRVPro 只承担对战连接和现有天梯逻辑。网页构建时用 `VITE_DUEL_WS_URL=wss://...` 固定入口，玩家只填写昵称和房名：`TT` 进天梯，其他房名进普通房。

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

本地结果覆盖开局链路，不等于完整比赛或正式发布验收。正式服配置和重启由服主稍后执行；在此之前仍需核验真实证书／域名／反代／防火墙、生产卡库及禁表顺序、外部静态站点到 WSS 的访问、手机真机、断线恢复、完整 G1–G3 和非法卡拒绝。没有正式 WSS URL 时，静态构建会显示联机配置错误，仍可使用本地卡组功能。
