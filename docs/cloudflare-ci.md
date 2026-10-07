# 现有 Workers 站点的 GitHub 自动部署

更新：2026-10-08。目标是现有 `black-surf-69e5` Worker，继续使用 `https://black-surf-69e5.1627406938.workers.dev/`。仓库端配置已准备；需要站点所有者在 Cloudflare 完成一次 GitHub 授权和连接，才会真正自动部署。这里的自动部署仅负责 `srvprotiantiweb`，天梯服务器及 `srvprotianti` 官网页面仍由各自项目部署。

## 仓库配置

- [wrangler.json](../wrangler.json)：Worker 名称与现有站点一致，只上传 `dist/` 静态文件，不需要 Worker 运行时代码。修改 Worker 名称必须同时调整此文件；CI 要求名称一致。[名称要求与 Git 接入](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [package.json](../package.json)：`build:cloudflare` 执行原资源生成、Vite 构建及资源复制，`deploy:cloudflare` 使用固定的 Wrangler `4.148.0` 发布。
- [build_cloudflare.mjs](../scripts/build_cloudflare.mjs)：要求显式传入公开 WSS 地址，固定根路径与正常资源格式；生成公开 `duel-config.js` 和带源码提交号的 `deployment-info.json`。缺少或无效 WSS、构建失败时返回非零退出码，不执行后续部署。普通 `npm run build` 仍可用于离线组卡开发。
- 当前发布分支为 **`deploy/cloudflare`**，从包含观战修复、卡组接收功能的最新交付版本建立。`main` 暂时较旧，不能直接改用它发布；以后所有改动合并到 `main` 后再调整生产分支。

四语 CDB 与 strings 原件、禁表、界面素材和 SQLite WASM 已在 Git 中；云端使用 Python 标准库生成环境资源，不依赖本机 `F:` 路径或生产服务器。生成的 protobuf TypeScript 已提交，日常构建无需生成协议或主动更新 `neos-protobuf` 子模块。

## 一次性在 Cloudflare 设置

1. 登录当前站点所属 Cloudflare 账号，进入 **Workers & Pages → black-surf-69e5 → Settings（设置）→ Builds / Build（构建）**。
2. 在“自动化您的 CI”或 Git 连接处点击 **Connect（连接）**，选择 GitHub。授权 Cloudflare Workers GitHub App 访问 `301zrg/srvprotiantiweb`；可仅授权这一个仓库。
3. 填写下表。根目录指 GitHub 仓库根目录，不是本机父文件夹 `srvpro`，也不是 `dist`。

| 项目 | 填写值 |
| --- | --- |
| Git 仓库 | `301zrg/srvprotiantiweb` |
| 生产分支 / Git branch | `deploy/cloudflare` |
| Root directory | 留空；若必须填写，填 `.` |
| Build command | `npm ci --include=dev && npm run build:cloudflare` |
| Deploy command | `npm run deploy:cloudflare` |
| API token | 选择 Cloudflare 界面自动创建／默认使用的构建 Token，无需发给开发者 |
| 非生产分支预览 | 初次配置可关闭，只部署发布分支；以后需要 PR 预览再启用 |

Workers 的页面没有 Pages 的“输出目录”项；静态目录已由 `wrangler.json` 的 `assets.directory = ./dist` 指定。无需选择 `build:prod`，那是保留的上游构建命令，使用了上游 CDN 基路径。[Workers 构建配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[静态资源](https://developers.cloudflare.com/workers/static-assets/)

4. 在 **Build variables and secrets（构建变量与机密）** 添加以下变量。它们是构建变量；纯静态 Worker 不需要运行时变量或私钥。

| 变量名 | 值 | 作用 |
| --- | --- | --- |
| `SKIP_DEPENDENCY_INSTALL` | `1` | 由上述构建命令显式执行 `npm ci`，避免平台先自动装一次 |
| `NODE_VERSION` | `24` | 使用 Node 24 系列，满足固定 Wrangler 的 Node ≥22 要求 |
| `PYTHON_VERSION` | `3.13.3` | 使用当前构建镜像已支持的版本生成四语环境资源 |
| `VITE_DUEL_WS_URL` | `wss://districts-studios-rear-representation.trycloudflare.com/neos` | 2026-10-08 读取现有站点公开配置确认的临时对战入口；如隧道地址已改变，填实际新地址 |

WSS 是公开地址，不是玩家密码。不要放玩家凭据、证书私钥、隧道 Token 或 GitHub Token。Cloudflare 的构建环境支持 Node／Python 版本覆盖与跳过自动依赖安装。[构建镜像说明](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)

5. 保存设置。若保存连接后未自动开始构建，在构建页选择 **Run build / Build now**；也可以由维护者向发布分支推送新提交来触发。初次成功后不再需要手动上传 ZIP。

连接、推送和生产分支规则见 [GitHub 接入](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)、[构建分支](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)。若将来启用 PR 预览，预览站的 origin 可能不在现有 WSS 网关白名单中，预览构建成功不代表已能在线对战；需要单独安排本地或测试网关联调。

## 后续更新

代码在工作分支完成并通过相关验证后，由维护者把确认可发布的修改合入／推送至 `deploy/cloudflare`。Cloudflare 自动拉取仓库、安装锁定依赖、生成卡库、构建并部署到原站点。仅创建 PR、仅本地保存或推送其他分支，不会更新这个生产站点；直接更新发布分支会触发上线。

本项目构建与文件下载继续由外部 Cloudflare 承担。无需为前端自动部署重启 SRVPro、Nginx 或 PM2 隧道，也不需要改变现有网页 origin 白名单。Quick Tunnel 重启仍可能换 WSS 地址；到构建变量中更新 `VITE_DUEL_WS_URL` 后运行一次新构建，不需要手动上传文件。

源码中的 `public/duel-config.js` 保持空的默认站方配置，Cloudflare 构建会根据变量生成发布版本。原 Pages／BiliToy 打包命令继续可用。代码回滚可以在 Cloudflare 已部署版本中选取上一版本，或把发布分支的错误修改用 revert 撤销，再触发构建；不要以 reset + 强制推送覆盖协作者工作。[Workers 回滚](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/)

## 首次验收与故障定位

- 构建日志应依次完成 `npm ci`、四语资源 SHA 校验、Vite 构建、素材复制与 Wrangler 部署；失败日志从第一处 error 看起。
- 打开 `/deployment-info.json` 核对 `sourceCommit` 与发布分支一致；打开 `/duel-config.js` 核对当前 WSS。Hash 路由和卡组导入链接应继续可用。
- 浏览器核对首页、四语搜索／组卡与正常入房。部署页面成功不代替正式对局验收。
- `Worker name ... does not match`：确认 Cloudflare 选的是 `black-surf-69e5`，与 `wrangler.json` 相同。
- WSS 配置错误：变量必须放在“构建变量”中，值为完整 `wss://.../neos`，修改后重新构建。
- 依赖安装或 Python 失败：确认根目录和上述版本／安装变量；`npm ci` 不要省略开发依赖，Vite 属于开发依赖。

本机验证记录：Node 24.15.0、Python 3.13.14。无 `.env.local`、未初始化上游子模块的干净检出已通过 `npm ci --include=dev`、`npm run build:cloudflare`、资源校验及 Wrangler 4.148.0 的 `--dry-run`；核对 99 个静态文件、四语卡库、WASM、公开 WSS 配置、no-store 响应头与源码提交号，最大单文件约 2.40 MB。缺少 WSS 时会在构建前失败。Cloudflare 账号连接、Ubuntu 构建镜像和正式部署仍需由站点所有者完成首次运行后确认；本机 dry-run 没有上传或修改现有线上站点。
