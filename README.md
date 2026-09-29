# 706 天梯 YGOPRO 网页客户端

基于 [DarkNeos/neos-ts](https://github.com/DarkNeos/neos-ts) 的 1103 历史环境客户端。玩家可输入昵称和房间名：房间 `TT` 进入天梯，其他房间名沿用服务器的普通联机规则；对战地址由站点构建配置固定，玩家不填写 IP 或端口。网页和 CDB 等资源部署在天梯服务器之外的 HTTPS 静态站点。

## 当前进度

本地首版已接入四语卡库生成器、2011.3.1 禁表、YDK 导入／导出、统一联机表单及固定 WSS 配置，移除了入口的 MyCard 登录依赖。`npm run build` 生成的 `dist/` 包含静态页、四语环境资源和 Neos WASM/界面资源。已用隔离的本地 SRVPro 实例验证真实 WSS：两个浏览器分别完成普通 Single 房和 `TT` Match 的入房、卡组准备、猜拳及开局，均进入对局画面。当前正式天梯的 `121.4.34.71:7911` 是 YGOPro **TCP** 入口，浏览器不能直接连接；生产 WSS 地址和完整比赛／重连验收仍缺，当前产物不应标为可发布线上版。

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

四语原始 CDB、strings 和禁表在 `resources-staging/1103/`，生成器只写 `public/environment/`。发布时只上传构建后的 `dist/` 到外部静态托管，不上传原始暂存文件至天梯服务器。每次修改输入或生成规则需要提升环境资源修订号，避免静态缓存混用。

## 项目文档

- [设计与验收标准](YGOPro_706_Web_Client_Design.md)
- [施工清单](IMPLEMENTATION_PLAN.md)
- [1103 资源审计](docs/1103-resource-audit.json)
- [服务器契约审计](docs/server-contract-audit.md)
- [上游审计](docs/upstream-audit.md)
- [WSS 配置与本地联调](docs/wss-integration.md)

## 协作

源码发布在 [301zrg/srvprotiantiweb](https://github.com/301zrg/srvprotiantiweb)。建议通过分支和 Pull Request 提交改动；提交前运行上文列出的资源检查、类型检查、lint 与构建。`resources-staging/1103/` 中的原始资源按字节锁定，修改须同步更新资源审计与 revision。不要提交 `.env.local`、证书、真实玩家凭据、未授权卡组或录像。当前仓库提供可构建的本地首版，生产 WSS 与完整实战验收仍待完成。
