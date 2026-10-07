# 706 天梯 YGOPRO 网页客户端

基于 [DarkNeos/neos-ts](https://github.com/DarkNeos/neos-ts) 的 1103 历史环境客户端。玩家可输入昵称和房间名：房间 `TT` 进入天梯，其他房间名沿用服务器的普通联机规则；对战地址由站点构建配置固定，玩家不填写 IP 或端口。网页和 CDB 等资源部署在天梯服务器之外的 HTTPS 静态站点。

## 当前进度

本地首版已接入四语卡库生成器、2011.3.1 禁表、YDK 导入／导出、统一联机表单及固定 WSS 配置，移除了入口的 MyCard 登录依赖。`npm run build` 生成的 `dist/` 包含静态页、四语环境资源和 Neos WASM/界面资源。隔离的本地 SRVPro 已通过普通 Single 和 TT G1–G3 生命周期、两次换备提交及退出保留昵称／密码；弃权回归不代替全部卡片交互。正式入口 `wss://duel.ygomatch.xyz/neos` 在服务器本机握手通过，公网因未备案受阻。今年继续使用现有主机，采用无需改 DNS 的临时隧道与外部静态站点上线测试；已部署网页经公网 WSS 的普通房开局、弃权结束和首次再次入场通过。正式禁表 hash 差异已定位到两个错误卡号，修正版及 [替换步骤](docs/banlist-diagnosis.md) 已备妥；正式新房间规则一致性、TT 实战、真机和断线恢复仍待验收。

## 本地运行

需要 Node.js、npm 和 Python 3。Windows PowerShell 中执行：

```powershell
npm ci
Copy-Item .env.example .env.local
# 在 .env.local 中填写真实的 VITE_DUEL_WS_URL=wss://...
npm run dev
```

未配置 WSS 也能打开页面、搜索与编辑卡组；联机页会显示明确的配置错误。`npm run build` 先校验暂存的原始资源并生成 `public/environment/1103-201103-v1/`，再运行 Vite 并复制 `neos-assets` 到 `dist/`。`VITE_BASE_PATH=/项目路径/` 可用于外部静态站点的子路径部署；路由使用 Hash，深链刷新不要求服务器重写。

想亲自在本机浏览器试玩联机，可运行 `npm run play:local-wss`。它不使用或修改 `srvprotianti/config/config.json`，会创建隔离的临时 SRVPro、生成本机测试证书、构建网页并打开独立 Edge 窗口。使用不同昵称在两个标签页输入同一普通房名，或分别输入 `昵称$密码` 和房名 `TT` 测天梯；结束时回到命令行按 Ctrl+C 清理。此命令只供本机试玩，正式服仍需可信证书和生产 WSS 地址。详情见 [WSS 配置与本地联调](docs/wss-integration.md)。

本地检查：`npm run check:environment`、`npm run test:packet`、`npx tsc --noEmit`、`npm run lint`、`npm run build`。要检查构建后的页面，先运行 `npm run preview:static`，另开终端运行 `npm run test:smoke`；脚本在 Windows 上优先使用已安装的 Edge，也可通过 `PLAYWRIGHT_BROWSER_EXECUTABLE` 指定 Chromium 可执行文件。`npm run test:mock-duel` 在浏览器内模拟 WSS，验证昵称／房名原始封包、TT／普通房 HostInfo、主动退出后换房和旧连接隔离。`npm run test:local-wss` 使用兄弟项目 `srvprotianti` 的源码和 Core 启动隔离的本地实例，自动验证真实 WSS、两人入房与开局。浏览器冒烟覆盖四语切换，以及桌面／手机视口的首页、联机表单和卡组入口；本机开局测试不替代完整比赛或手机真机验收。

当前构建产物约 12.7 MB（未压缩、含四语 CDB 与 WASM）。首版保留提示音，关闭背景音乐；打包脚本不复制上游约 53 MB 背景音乐和约 11 MB 未使用的卡组封面。基础页面和新增组卡操作有四语文案，上游尚未翻译的韩语对局界面目前回退为英语。

## 现有服务器上线测试

2026-10-07 手机界面已调整组卡分页、触摸按钮、横竖屏详情与操作历史、设置关闭入口；本地复测与更新测试站点的方法见 [手机界面调整](docs/mobile-ui.md)。`npm run test:mobile-ui` 自行启动临时 Vite，检查三个触控视口及设置关闭；Android／iOS 真机验收仍待完成。

决斗准备页进一步改为显式文字操作与底部蓝色准备按钮，入房及选择卡组保持未准备；Tag 等待页按四席全员准备判断，但完整双打对局仍需单独适配。`npm run test:waitroom-ui` 已通过手机横竖屏、小屏与桌面回归，细节见 [准备页与双打范围](docs/waitroom-ui.md)。

当前外部静态网页已上传到 [Workers 测试站点](https://black-surf-69e5.1627406938.workers.dev/)，服务器允许的网页 origin 使用该地址去掉末尾斜杠。2026-10-07 正式服务器 Quick Tunnel 已启动，当前临时地址为 `wss://districts-studios-rear-representation.trycloudflare.com/neos`：受信任 TLS、Node 101、Edge 浏览器握手及错误 Origin 拒绝已通过。用户更新上传后，公网连接配置与候选包一致、`no-store` 生效；没有覆盖浏览器配置，两个临时昵称已完成独立普通 Single 房的准备、开局、弃权结束、双方昵称／房名保留与首次再次入场。该房间返回 MR2，但禁表 hash 为 `0x4250bce9`，客户端／本地 Core 验证基线为 `0x73ec4051`；用户提供的正式文件已复现差异，修正版恢复客户端基线，正式替换及新房间复验仍待执行。检查没有进入 TT 或使用正式玩家账号；正常完整比赛、生产结算与真机仍待验收。Workers Static Assets 和 Pages 均适用本项目静态包，隧道重启后必须更新地址。

按照 [Windows 服务器 + Pages 上线步骤](docs/current-server-online-test.md) 部署本机 Nginx 网关与 Cloudflare Quick Tunnel。`npm run package:test` 生成可上传 Pages 的网页包和服务器工具包；未取得公网 WSS 时，包内明确禁用联机。取得真实 URL 后运行 `npm run package:test -- --wss-url wss://实际地址/neos --site-origin https://实际站点.pages.dev` 即可生成新部署，无需重复构建。`duel-config.js` 为站方公开配置，优先于构建入口；不能写入密码或 Token。玩家仍只填写昵称和房名。

`npm run test:tunnel-gateway` 验证独立 Nginx 的 IP／Origin／二进制转发；准备官方 Nginx 和 cloudflared 后，网络允许时可运行 `npm run test:tunnel-wss`，让隔离 SRVPro 的两个浏览器经真实公网隧道完成回归。开发机自身未能建立中继连接；正式服务器创建的隧道已通过客户端公网握手，完整比赛继续待验收。Quick Tunnel 地址会变化且无可用性保证，适用于本轮测试，长期入口另行确定。

四语原始 CDB、strings 和禁表在 `resources-staging/1103/`，生成器只写 `public/environment/`。发布时只上传构建后的 `dist/` 到外部静态托管，不上传原始暂存文件至天梯服务器。每次修改输入或生成规则需要提升环境资源修订号，避免静态缓存混用。

## 项目文档

- [设计与验收标准](YGOPro_706_Web_Client_Design.md)
- [施工清单](IMPLEMENTATION_PLAN.md)
- [1103 资源审计](docs/1103-resource-audit.json)
- [服务器契约审计](docs/server-contract-audit.md)
- [上游审计](docs/upstream-audit.md)
- [WSS 配置与本地联调](docs/wss-integration.md)
- [当前服务器上线测试](docs/current-server-online-test.md)
- [PM2 后台运行 Windows 临时隧道](docs/pm2-quick-tunnel.md)
- [手机界面调整与复测](docs/mobile-ui.md)
- [决斗准备页与双打支持范围](docs/waitroom-ui.md)
- [给服务器与域名维护者的 WSS 证书说明](docs/wss-certificate-handoff.md)

## 协作

源码发布在 [301zrg/srvprotiantiweb](https://github.com/301zrg/srvprotiantiweb)。建议通过分支和 Pull Request 提交改动；提交前运行上文列出的资源检查、类型检查、lint 与构建。`resources-staging/1103/` 中的原始资源按字节锁定，修改须同步更新资源审计与 revision。不要提交 `.env.local`、证书、真实玩家凭据、未授权卡组或录像。当前仓库提供可构建的本地首版，生产 WSS 与完整实战验收仍待完成。
