# 706 网页版 YGOPRO：给服务器与域名维护者的 WSS 证书说明

更新日期：2026-10-06。

请协助为现有天梯服务提供一个公网可用的安全 WebSocket（WSS）入口，例如 `wss://duel.example.com/neos`，并部署覆盖该域名、浏览器信任的 TLS 证书。网页、四语卡库和界面资源计划放在 Cloudflare Pages 等外部静态平台；服务器负责现有匹配、对局及 WSS 接入。

当前部署已确认为 Windows + Nginx，拟用域名为 `duel.ygomatch.xyz`，公网 IP 为 `121.4.34.71`。Nginx 使用 `C:/nginx/ssl/ygomatch/` 下已有证书；服务器本机 TLS 校验与 `/neos` 的 `101` 握手均已通过。**当前阻塞已不是单纯缺证书，而是大陆腾讯云入口的未备案拦截；维护者确认域名在境外，当前无法办理备案。** 不需要为此重新申请同域名证书或反复重启。公网接入候选和验收见 [WSS 联调说明](wss-integration.md)。[腾讯云拦截说明](https://cloud.tencent.com/document/api/243/18907)

下文的 `duel.example.com` 是占位域名。Linux + Nginx + Certbot 命令保留为其他部署环境的参考，不是当前 Windows 服务器需要照抄执行的步骤。直连方案需先满足源站接入条件；隧道方案尚未部署，也不代表大陆源站已自动免除备案要求。

## 1. 现在具体缺什么

| 项目 | 当前情况／需要完成的工作 |
| --- | --- |
| 原生 YGOPRO 联机 | 已知入口为 `121.4.34.71:7911`，使用原生 TCP 协议 |
| 网页客户端 | 已有可构建首版，本地隔离实例已通过真实 WSS 双人入房和开局测试 |
| 正式 WSS 地址 | 拟用 `wss://duel.ygomatch.xyz/neos`；本机握手已通过，正常公网域名访问受备案拦截，尚不能上线 |
| 正式 WSS 证书 | 已有域名证书通过服务器本机 TLS 校验；公网接入仍受阻，不能以此代替玩家浏览器验收 |
| 自动续期 | 尚未验证；需由维护者确认当前 Windows 证书申请／续期工具，并验证 Nginx 加载新证书 |

本文原用于说明缺少正式 WSS 证书时如何准备；现在已有证书和本机转发，后续应优先解决公网接入架构。覆盖选定域名的有效证书可直接复用，无需重复申请或购买。

证书绑定的是域名或 IP，不绑定 7911、7977 等端口；对战域名可以与网页域名不同。域名证书覆盖的名字必须与网页连接的 WSS 主机名匹配，不能拿仅覆盖域名的证书直接用于 `wss://121.4.34.71/...`。

## 2. 为什么网页版需要这个证书

网页版将通过 HTTPS 打开，正式对战连接也需要使用 `wss://`。WSS 在 WebSocket 外使用 TLS，浏览器通过证书验证服务器身份并加密传输。玩家登录串和对局消息也会经过这条连接。HTTPS 页面连接公网明文 `ws://` 会受到浏览器安全限制，当前客户端也只接受 `wss://`。[浏览器 WebSocket 安全说明](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications#security_considerations)

`121.4.34.71:7911` 是原生 YGOPRO TCP 服务，浏览器不能直接连接。即使为服务器申请了证书，也仍须启用 SRVPro 的 Neos WebSocket 接口，并将其接到公网 WSS 入口。

Cloudflare Pages 为网页提供的 HTTPS，与天梯服务器的 WSS 是两条不同连接。网页托管成功，不会自动为对战服务配置证书、开启 Neos 或转发 7911。

之前本机测试用的自签名证书只覆盖 `localhost`／`127.0.0.1`，测试浏览器也曾跳过证书验证，因此本地测试不代表公网证书已经就绪。普通玩家应能直接连接，无需手动安装证书或忽略浏览器警告。

## 3. 直连接入条件允许时：已有域名 + Nginx + 免费域名证书

维护者已有域名时，建议分配一个对战子域名，例如 `duel.example.com`，为其申请免费的 Let’s Encrypt 域名验证证书，或复用已覆盖该子域名的有效证书。

```text
Cloudflare Pages／其他静态托管 ──HTTPS──> 玩家浏览器
玩家浏览器 ──wss://duel.example.com/neos──> Nginx（443，管理证书）
Nginx ──ws://127.0.0.1:7977──> SRVPro Neos ──> 现有匹配与对局
```

Nginx 负责 TLS 和 WebSocket 转发。证书续期后可优雅重载 Nginx，通常无需重启 SRVPro；已有连接的处理仍需结合现有 Nginx 配置实测。[Nginx 重载行为](https://nginx.org/en/docs/control.html)

原生客户端继续使用原有 7911 入口。用于证书验证的少量临时文件放在服务器即可；网页和 CDB 等静态资源仍由外部平台承载。

### 3.1 配置 DNS 和端口

为对战子域名添加记录：

| 类型 | 主机记录（以 example.com 为例） | 值 |
| --- | --- | --- |
| A | `duel` | `121.4.34.71` |

确认 DNS 生效，并在云安全组及系统防火墙中配置：

- TCP 443：公网 WSS 入口。
- TCP 80：下面 HTTP-01 证书验证及自动续期需要使用。
- TCP 7911：保留原生客户端所需访问。
- TCP 7977：在本示例中仅供本机 Nginx 访问，限制公网直接访问；SRVPro 当前没有独立的 Neos 监听地址配置，需通过防火墙落实。

如果 80 无法开放，可以使用域名 DNS-01 验证，由 DNS 服务商 API 自动设置验证 TXT 记录；申请及续期方式需相应调整。HTTP-01 验证固定使用公网 80，不能用 7911 或 7977 替代。[Let’s Encrypt 验证方式](https://letsencrypt.org/docs/challenge-types/)

若使用 Cloudflare DNS，初次联调可先将对战子域名设为“仅 DNS”。若开启橙云代理，公网 WSS 使用受支持的 443；7977 不在默认代理端口清单中，并且真实客户端 IP 的转发链要单独核验。[Cloudflare 端口说明](https://developers.cloudflare.com/fundamentals/reference/network-ports/)

### 3.2 安装工具，准备证书验证入口

已有 Nginx、宝塔或其他反代时，复用现有配置，不重复安装或覆盖已有站点。以下安装命令仅适用于使用 apt 的 Ubuntu／Debian 环境：

```bash
sudo apt-get update
sudo apt-get install nginx certbot
sudo mkdir -p /var/www/srvprotianti-acme/.well-known/acme-challenge
```

在 Nginx 已加载的站点配置中增加以下 HTTP server；常见位置为 `/etc/nginx/conf.d/srvprotianti-wss.conf`。若已有相同域名的 server，合并其验证 location，不新增重复 server。

```nginx
server {
    listen 80;
    server_name duel.example.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/srvprotianti-acme;
        default_type text/plain;
        try_files $uri =404;
    }

    location / {
        return 404;
    }
}
```

上述根 location 的 404 仅用于这个专用对战子域名。合并到已有网站时保留已有网站业务。确认配置后加载：

```bash
sudo nginx -t
sudo nginx -s reload
```

若 Nginx 尚未运行，先按现有服务管理方式启动。验证目录应当能从公网访问。

### 3.3 申请域名证书

在实际服务器上执行，并按提示填写维护者邮箱及接受服务条款：

```bash
sudo certbot certonly \
  --webroot \
  --webroot-path /var/www/srvprotianti-acme \
  --domain duel.example.com \
  --cert-name srvprotianti-wss
```

这是正式证书申请命令。`--staging` 只会申请浏览器不信任的测试证书，不应作为正式部署结果。申请成功后用 `sudo certbot certificates` 核对实际路径；本例指定名称后通常得到：

```text
/etc/letsencrypt/live/srvprotianti-wss/fullchain.pem
/etc/letsencrypt/live/srvprotianti-wss/privkey.pem
```

`fullchain.pem` 包含服务器证书及中间证书链，`privkey.pem` 是对应私钥。私钥由服务器维护者保管，不放进网页、GitHub 或 Pages 环境变量。[Certbot 使用说明](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot)

### 3.4 配置公网 WSS 转发

签发成功后保留上述 HTTP 验证入口，在同一配置中追加下面的 HTTPS server，替换实际域名及证书路径：

```nginx
server {
    listen 443 ssl;
    server_name duel.example.com;

    ssl_certificate /etc/letsencrypt/live/srvprotianti-wss/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/srvprotianti-wss/privkey.pem;

    location = /neos {
        proxy_pass http://127.0.0.1:7977;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    location / {
        return 404;
    }
}
```

此示例展示 TLS 与 WebSocket 转发；公开前应按最终网页域名配置允许的 Origin 和已有入口访问策略。超时值按实际对局联调结果调整。单层本机反代中，转发 IP 头应由 Nginx 覆盖为实际客户端地址；经过 Cloudflare 或其他前置代理时，需要先配置可信来源与真实 IP 识别。[Nginx WebSocket 转发说明](https://nginx.org/en/docs/http/websocket.html)

配置修改后执行 `sudo nginx -t`，通过后执行 `sudo nginx -s reload`。

### 3.5 启用 SRVPro Neos，核对现有 HTTPS 配置

以下仅为应合并的字段，不能覆盖整份 `config/config.json`，也不要删除其他已用的可信代理设置：

```json
{
  "modules": {
    "trusted_proxies": ["127.0.0.1/32", "::1/128"],
    "neos": {
      "enabled": true,
      "port": 7977,
      "trusted_proxy_header": "x-forwarded-for"
    },
    "http": {
      "ssl": {
        "enabled": false
      }
    }
  }
}
```

本例由 Nginx 终止 TLS，因此 Neos 上游使用明文 WS。源码默认配置中的 `neos.ip_header` 与实际读取的 `neos.trusted_proxy_header` 不一致，使用反代时需要明确设置后者，并只信任实际代理来源。

**必须先核对已有服务：** 当前 SRVPro 的 Neos TLS 与 HTTP TLS 共用 `modules.http.ssl`。如果原有 7923 HTTPS 服务正在使用，不能照抄上述 `enabled: false` 关闭它；维护者应保留该服务，选择让 Nginx 转发到现有 HTTPS Neos 上游，或将相关 HTTPS 服务一并迁移到反代。HTTPS 上游方案应设置正确的上游证书主机名和证书校验，而不是关闭验证。

`neos.enabled`、监听端口和 SRVPro 自身证书都在启动时加载，不支持这些配置的热更新。初次启用或调整相关配置，需要维护者安排 SRVPro 重启。证书以后由 Nginx 管理时，续期只重载 Nginx。

## 4. 自动续期必须一起配置

保留 HTTP 验证入口，让 Certbot 后续能再次验证域名。确认已有 Certbot 自动续期定时器或维护任务正常运行；例如 Ubuntu／Debian apt 安装通常使用 `certbot.timer`，可通过 `systemctl list-timers --all` 查看。若确有该定时器且尚未启用，可执行 `sudo systemctl enable --now certbot.timer`。其他安装方式以其实际定时任务为准。

续期成功后，需要检查配置并让 Nginx 加载新证书。可以将下面的脚本保存为 `/etc/letsencrypt/renewal-hooks/deploy/reload-srvprotianti-nginx`，由 root 保管并赋予执行权限；若 `command -v nginx` 返回其他路径，应相应替换：

```sh
#!/bin/sh
set -eu
/usr/sbin/nginx -t
/usr/sbin/nginx -s reload
```

部署 hook 后验证整个流程：

```bash
sudo certbot renew \
  --cert-name srvprotianti-wss \
  --dry-run \
  --run-deploy-hooks
```

测试成功后继续由定时任务运行 `certbot renew`；不需要每天强制重新签发。维护者应监控续期失败或证书临近过期的情况。[Certbot 续期及部署 hook](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)

## 5. 如果暂时不用域名：公网 IP 证书备选

本节仅说明 TLS 技术选项，**不作为当前备案拦截的解决方案**。腾讯云说明：大陆服务器上仅通过 IP 访问的网站仍需备案，不能把 IP 证书描述为“免备案”入口。[腾讯云备案场景](https://cloud.tencent.com/document/product/243/18910)

Let’s Encrypt 已支持浏览器信任的 IPv4／IPv6 证书，因此也可直接为 `121.4.34.71` 申请证书。IP 证书有效期约 160 小时，必须可靠自动续期；已有域名时建议采用前述域名方案。[IP 证书官方说明](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)

IP 证书使用 Certbot 5.4 或更新版本较稳妥。若公网 IP 的 HTTP 验证目录已由服务器的 80 端口提供，可执行：

```bash
sudo certbot certonly \
  --webroot \
  --webroot-path /var/www/srvprotianti-acme \
  --ip-address 121.4.34.71 \
  --preferred-profile shortlived \
  --cert-name srvprotianti-wss-ip
```

对应 HTTP 验证 server 必须能接收以该 IP 为 Host 的请求，不能仅提供域名访问。若改用 `--standalone`，Certbot 自己监听 80，该端口必须空闲，且后续每次续期都需要满足此条件。IP 不能使用 DNS-01 验证。[IP 证书申请说明](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)

将 Nginx 的证书路径改为 `/etc/letsencrypt/live/srvprotianti-wss-ip/` 下的对应文件，并使用 IP 的 HTTPS server 配置后，对外地址为 `wss://121.4.34.71/neos`。自动续期、重载及验证要求与域名方案相同。

## 6. Cloudflare Pages 与已有证书的注意点

- Pages 负责网页 HTTPS；本说明负责对战 WSS。网页可以先使用 `*.pages.dev`，对战使用协作者已有域名的子域名。
- 已有证书若覆盖对战子域名并且有效，维护者可直接复用。仅覆盖根域名的证书不自动覆盖所有子域名；应核对证书中的实际域名范围。
- Cloudflare Origin CA 证书主要用于 Cloudflare 到源站的连接。若浏览器直接访问源站，它通常不会被浏览器信任；启用 Cloudflare 代理、正确配置 TLS 时可用于对应的源站连接，不能与直接访问方案混用。[Cloudflare Origin CA 说明](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)
- 修改网页的公开连接地址只需提供完整 WSS URL，前端构建变量为 `VITE_DUEL_WS_URL`。TLS 私钥、DNS API 凭据和服务器登录信息都留在维护者侧。

## 7. 完成后请回传什么

请提供以下非敏感信息，便于网页项目接入：

```text
完整 WSS URL：wss://实际对战域名/neos
服务器系统及代理方式：
证书覆盖的域名或 IP：
证书到期时间：
自动续期及重载是否已验证：
Neos 是否已启用，相关配置是否已重启生效：
允许的网页 Origin（与网页维护者共同确定）：
真实客户端 IP 转发是否已验证：
```

无需发送 `privkey.pem`、DNS API 密钥或完整私密配置。网页维护者收到 WSS URL 后，会将其写入构建配置并重新部署外部静态网页。

验收时应确认：

1. 对战域名解析到正确入口；普通浏览器访问对应 HTTPS 地址无证书警告，证书匹配主机名且未过期。
2. 从最终 HTTPS 网页发起 WSS，浏览器开发者工具中握手成功（通常为 HTTP 101），并能收到实际对战协议消息。普通 HTTPS 访问 `/neos` 返回 400／404 等结果，不能单独据此判定 WSS 是否可用。
3. 不同公网玩家的真实 IP 能被服务器正确识别；续期测试和 Nginx 重载正常。
4. 网页客户端能加入普通房和 `TT`，与现有客户端一起准备并开局。完整比赛、换备及手机实战仍由双方继续联调。

本说明来自当前 SRVPro 与网页源码核对，以及上文链接的官方证书和代理资料；尚未对正式服务器执行申请、部署或重启。
