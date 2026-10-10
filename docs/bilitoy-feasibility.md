# BiliToy 托管评估与 Nginx 接入

核查日期：2026-10-07。对象是 B 站 Toy 静态作品发布平台，不是 B 站小程序 SDK。本次没有登录协作者账号、提交作品或修改正式服务器。

## 结论

现有 React 网页可以作为适配基础，无需先重写成原生小程序。Toy 支持静态作品发布，公开投稿前端的 FAQ 支持 ZIP、文件夹和 React 构建产物；原 Workers 包不能直接上传即用。本地已新增专用资源适配与打包，账号权限和平台上线验证仍待完成。它能承载前端，不承载现有 SRVPro 对战服务。[平台介绍](https://www.bilibili.com/toy/intro)、[投稿 FAQ](https://www.bilibili.com/toy/publish/guide/faq)。

更关键的是：公开投稿前端内置协议第五部分第 3 条包含独家运营约定，限制未经书面同意的自行运营及第三方渠道运营。因此，作为现有 Workers 网站的备用镜像是否获准，需要协作者先向平台确认，不能把它当作通用静态托管。协议还涉及第三方链接、登录及资源权利；实际适用版本以账号投稿时展示的协议为准。[投稿协议](https://www.bilibili.com/toy/publish/agreement)。

## 本次实际验证

未登录的 Edge 打开官方公共示例 `https://www.bilibili.com/toy/square`，检查结果如下；这些结果只证明该示例的浏览器能力，不代表本项目已审核或完成上线。

| 检查 | 结果 |
| --- | --- |
| 外层地址 | `www.bilibili.com/toy/square` |
| 内容 iframe 来源 | `https://www.bilibilitoy.com` |
| iframe 沙箱 | 包含 `allow-scripts`、`allow-same-origin`、`allow-downloads` |
| WebAssembly | 最小有效模块编译通过；完整 sql.js 加载仍待适配包验证 |
| IndexedDB | 独立浏览器临时数据库打开、关闭、删除通过 |
| WebSocket 来源 | 抓到握手 `Origin: https://www.bilibilitoy.com` |
| 连接当前 Quick Tunnel | 浏览器报告 HTTP 403 |
| 同一隧道允许的 Workers 来源 | 独立握手返回 HTTP 101 |

403 与现有网关的 Origin 白名单限制一致。此次没有发送玩家登录、入房或对战封包，也没有验证新增来源放行后的完整连接。

未登录访问投稿文档会转到介绍页。文件格式、账号权限及协议细节来自正常公开加载的[官方投稿前端代码](https://s1.hdslb.com/bfs/static/toy/app/publish/assets/index-B3T-BCTU.js)，不是已登录账号的操作结果。协作者应在实际管理端复核。

## 协作者需要确认的条件

普通 B 站账号不等于 Toy 投稿资格；官方介绍仍说明逐步向邀请 UP 主开放。[资格说明](https://www.bilibili.com/toy/intro)。账号可投稿时，检查[能力权限页](https://www.bilibili.com/toy/publish/settings/capabilities)：

- **外部服务访问**：对战 WSS 和站外卡图均涉及此能力。申请域名至少包括当前隧道主机 `districts-studios-rear-representation.trycloudflare.com`，以及实际卡图请求域名；当前配置为 `cdn02.moecube.com`，卡图使用 HTTPS 444 端口，需另确认平台是否允许。申请框要求纯域名，不填协议、端口或路径，不接受通配符。
- **用户内容输入**：说明自填昵称、房间名、天梯密码、卡组文件导入及房间聊天的用途，确认所需权限。保留既有 TT 认证，不直接改成 B 站身份登录。
- **包体额度**：当前完整静态目录 102 个文件、12,720,534 字节，ZIP 压缩大小另计。账号实际额度以投稿页为准；如超限，再申请大包体能力。
- **协议适用范围**：确认现有网站与 Toy 并行运营、外部对战服务、源码和致谢链接、官网及反馈群链接是否获准，并核对游戏王素材与开源组件的权利要求。

以上是当前项目信息对应的申请材料建议；不代表平台已经批准各项能力，也不代表能力审批自动解除协议中的其他限制。[能力页](https://www.bilibili.com/toy/publish/settings/capabilities)、[协议](https://www.bilibili.com/toy/publish/agreement)。

## 前端适配范围

专用打包使用 `VITE_BASE_PATH=./` 和 `VITE_DEPLOY_TARGET=bilitoy`，同步 CDB、strings、禁表、WASM、声音、图标和 `duel-config.js` 路径。普通构建维持原来的资源后缀和存储键；Toy 继续使用现有 HashRouter。[FAQ](https://www.bilibili.com/toy/publish/guide/faq)。

Toy 的文件白名单包含 `.wasm` 和 `.data`，不包含本项目使用的 `.cdb`、`.conf`、`.ydk`。专用发布副本将四语 CDB、文本配置和示例 YDK 映射成 `.data`，同步环境加载路径，并记录映射前后的 SHA256；SQLite 二进制和文本字节保持原样。原始暂存库及服务器文件不改，用户导入、导出自己的 `.ydk` 文件继续保留。[文件 FAQ](https://www.bilibili.com/toy/publish/guide/faq)。

专用包以 `LICENSE.md` 保留完整许可证，省略 Cloudflare 专属 `_headers` 和空目录占位文件；不让平台自动过滤必要文件。Toy 的连接配置缓存和版本切换需按平台实际行为验证。原先远程图标的 25 个 SVG 定义改为随包脚本，来源记录在 [图标快照说明](../deployment/bilitoy/README.md)；Toy 构建省略远程字体请求，使用既有字体栈的系统回退。站外卡图仍需域名许可。

卡组当前保存在浏览器 IndexedDB，换站点或换 App WebView 不会自动继承 Workers 的卡组，可用 YDK 导入迁移。Toy 版数据库、偏好和本标签页换备缓存使用项目、频道与作品 ID 命名空间；路径中的 `-v版本号` 不参与存储键，因此同一作品更新后保留卡组。同一频道下的不同作品 ID 也分别存储，不能仅以公共的 `square` 目录区分作品；命名空间不能保证同源作品之间的安全隔离。B 站 App 内持久化、文件选择、导出和横竖屏均需真机测试。

在项目目录执行以下命令生成新目录下的 `web-bilitoy.zip`，无需先覆盖普通 `dist/`。不传 WSS 时可生成离线编辑包，在线入场明确禁用。

```powershell
npm run package:bilitoy -- --wss-url wss://当前实际隧道主机/neos
npm run test:bilitoy-package
npm run test:bilitoy-ui
```

上传 ZIP 本身，入口 `index.html` 在压缩包根目录。包内 `deployment-info.json` 记录来源提交、工作区状态、固定入口和资源映射。原 `web-pages.zip` 继续用于普通静态站点。专用包是本地构建候选，不代表已通过 Toy 审核；平台许可确认后按管理端流程上传与更新，不用远程加载现有网站来规避审核。

官网迁址时可同时传入 `--deck-import-origins`（JSON 精确 origin 数组）和 `--website-base-url`，也可使用 `VITE_DECK_IMPORT_ORIGINS`、`VITE_WEBSITE_BASE_URL` 环境变量。普通包、Toy 包与 Cloudflare 共享输入校验，不会只生成 WSS 字段而丢掉明确配置的白名单；`[]` 禁用卡组及录像的消息交接。未配置 WSS 的离线包要求环境变量也未设置或用空字符串参数覆盖。详见 [公开配置与迁址](public-deployment-config.md)。

2026-10-07 本地适配验收：5 项打包测试、类型检查、lint 和普通版模拟联机回归通过。专用 ZIP 约 5 MB，全部符合当前文件后缀白名单；13 个改名资源与原内容逐字节相同，完整许可证保留。独立 Edge 的桌面和 390×844 触控视口，在模拟 Toy 子目录及 iframe 沙箱下通过真实 SQLite WASM、四语 CDB/strings、卡片搜索、卡组保存、同一 slug 更新版本保留卡组、不同 slug 隔离、YDK 导入及下载检查；首次通过深链接进入卡组页的初始化顺序问题已修正。每次构建的实际文件数、资源映射、来源提交和 SHA256 以包内 `deployment-info.json` 与包外 `SHA256SUMS.json` 为准。测试替代了站外卡图响应，没有发送生产登录或对战封包；B 站审核、实际 iframe/CSP、外部卡图、App 真机及完整比赛仍待验证。

## 正式服务器的 Nginx 修改

按目前的 Quick Tunnel 架构，链路仍为：

```text
浏览器中的 Toy 客户端
  → 当前公开 WSS /neos
  → cloudflared
  → Nginx 127.0.0.1:7978
  → SRVPro Neos 127.0.0.1:7977
```

`nginx.conf` 已在 `http {}` 中 include `neos-tunnel.conf`。需要编辑服务器上的 **`C:\nginx\conf\neos-tunnel.conf`**，在已有 `map $http_origin $neos_tunnel_origin_allowed { ... }` **内部追加**：

```nginx
    "https://www.bilibilitoy.com" 1;
```

这是公共示例实测的内容来源。协作者发布本项目预览后，再在浏览器开发者工具 Network → WS → 请求头确认真实 `Origin`；若平台分配了其他来源，则按那个精确来源追加。Origin 不含 `/toy/作品路径/`，也没有末尾斜杠。保留已允许的 Workers 来源和本地测试来源，保留 `default 0`。不要重复声明 map，不要为了连通而放行所有来源或 `null`。

放行共享 Toy 域名只说明允许从该域名发起握手，并不限定某一个作品；仍依赖服务器既有身份校验与连接限制。`Access-Control-Allow-Origin: *` 不能替代当前 map 检查。7978 的本机监听、可信 IP 转发及 WebSocket Upgrade 配置继续按既有隧道方案运行。

在服务器 PowerShell 中执行：

```powershell
Set-Location C:\nginx
.\nginx.exe -t
```

仅在输出语法检查通过后执行：

```powershell
.\nginx.exe -s reload
```

这项来源变更只需要 Nginx reload，不需要重启 SRVPro、PM2 或 cloudflared，也不需要更改游戏 TCP 7911、Neos 7977 或 HTTPS 证书。不要为此重启临时隧道，否则其 URL 可能变化。

## 大陆网络与上线验证

Toy 可提供由平台承载的前端 HTTPS 地址，但浏览器仍直接连接现有 `trycloudflare.com` WSS。更换前端托管不会自动解决该对战入口的大陆网络质量，也不会让未备案域名 `duel.ygomatch.xyz` 自动变得可直连。

Quick Tunnel 一旦换主机名，需要同时更新 Toy 包中的公开连接配置，以及平台外部服务域名申请；域名变更可能再次审核。平台的默认权限、CSP 或审核拒绝也不能由你服务器上的 Nginx 修改解除。

账号条件和协议确认后，先提交适配预览：检查四语资源、卡组编辑与刷新保存、YDK 导入导出及 WSS 101，再测普通房与 TT Match、换备、退出首次重新入场和手机横竖屏。在大陆不同网络分别验证前端和 WSS；不能用主页可访问代替整场对战可用。
