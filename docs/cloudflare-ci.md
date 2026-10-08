# 现有 Workers 站点的 GitHub 自动部署

更新：2026-10-08。目标是现有 `black-surf-69e5` Worker，继续使用 `https://black-surf-69e5.1627406938.workers.dev/`。GitHub 自动部署已成功：`17aa0c25` 修复平台 Python 缺少 `_sqlite3` 的失败，改由 Node 校验并还原固定环境快照；真实构建成功且线上提交号匹配。这里的自动部署仅负责 `srvprotiantiweb`，天梯服务器及 `srvprotianti` 官网页面仍由各自项目部署。

## 仓库配置

- [wrangler.json](../wrangler.json)：Worker 名称与现有站点一致，只上传 `dist/` 静态文件，不需要 Worker 运行时代码。修改 Worker 名称必须同时调整此文件；CI 要求名称一致。[名称要求与 Git 接入](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [package.json](../package.json)：`build:cloudflare` 通过 `build:static` 还原固定环境资源，再执行 Vite 构建及资源复制；`deploy:cloudflare` 使用固定的 Wrangler `4.148.0` 发布。
- [build_cloudflare.mjs](../scripts/build_cloudflare.mjs)：要求显式传入公开 WSS 地址，固定根路径与正常资源格式；生成公开 `duel-config.js` 和带源码提交号的 `deployment-info.json`。缺少或无效 WSS、构建失败时返回非零退出码，不执行后续部署。普通 `npm run build` 仍可用于离线组卡开发。
- 当前发布分支为 **`deploy/cloudflare`**，从包含观战修复、卡组接收功能的最新交付版本建立。`main` 暂时较旧，不能直接改用它发布；以后所有改动合并到 `main` 后再调整生产分支。

四语 CDB 与 strings 原件、禁表、界面素材和 SQLite WASM 已在 Git 中。云端只需 Node：`restore_environment_assets.mjs` 核对源文件、生成／校验规则和压缩归档的 SHA，然后还原与既有发布版本完全相同的 11 个资源文件。快照约 1.78 MB，存于 `resources-staging/1103/environment-v1.data`，不作为额外资源上传到站点。输入或规则变更会拦截构建，维护者需先按 [资源说明](../resources-staging/1103/README.md) 更新环境版本及快照，不会默用陈旧卡库。原 Python 生成与校验流程仍用于开发机，云端不调用 Python，也不依赖本机 `F:` 路径或生产服务器。生成的 protobuf TypeScript 已提交，日常构建无需生成协议或主动更新 `neos-protobuf` 子模块。

## 一次性在 Cloudflare 设置

1. 登录当前站点所属 Cloudflare 账号，进入 **Workers & Pages → black-surf-69e5 → Settings（设置）→ Builds / Build（构建）**。
2. 在“自动化您的 CI”或 Git 连接处点击 **Connect（连接）**，选择 GitHub。授权 Cloudflare Workers GitHub App 访问 `301zrg/srvprotiantiweb`；可仅授权这一个仓库。
3. 填写下表。根目录指 GitHub 仓库根目录，不是本机父文件夹 `srvpro`，也不是 `dist`。

| 项目 | 填写值 |
| --- | --- |
| Git 仓库 | `301zrg/srvprotiantiweb` |
| 生产分支 / Git branch | `deploy/cloudflare` |
| Root directory / 路径 | 保持界面默认的 `/`，表示仓库根目录；不要填本机路径或 `dist` |
| Build command | `npm ci --include=dev && npm run build:cloudflare` |
| Deploy command | `npm run deploy:cloudflare` |
| API token | 选择 Cloudflare 界面自动创建／默认使用的构建 Token，无需发给开发者 |
| 非生产分支预览 | 初次配置可关闭，只部署发布分支；以后需要 PR 预览再启用 |
| Preview command / 预览命令 | 保留默认 `npx wrangler preview`；关闭“启用预览构建”时不会执行 |
| Build cache / 构建缓存 | 开启；缓存 npm 下载，环境资源校验／还原与 Vite 构建仍会执行 |

Workers 的页面没有 Pages 的“输出目录”项；静态目录已由 `wrangler.json` 的 `assets.directory = ./dist` 指定。无需选择 `build:prod`，那是保留的上游构建命令，使用了上游 CDN 基路径。[Workers 构建配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[静态资源](https://developers.cloudflare.com/workers/static-assets/)

4. 在 **Build variables and secrets（构建变量与机密）** 添加以下变量。它们是构建变量；纯静态 Worker 不需要运行时变量或私钥。

| 变量名 | 值 | 作用 |
| --- | --- | --- |
| `SKIP_DEPENDENCY_INSTALL` | `1` | 由上述构建命令显式执行 `npm ci`，避免平台先自动装一次 |
| `NODE_VERSION` | `24` | 使用 Node 24 系列，满足固定 Wrangler 的 Node ≥22 要求 |
| `VITE_DUEL_WS_URL` | `wss://districts-studios-rear-representation.trycloudflare.com/neos` | 2026-10-08 读取现有站点公开配置确认的临时对战入口；如隧道地址已改变，填实际新地址 |

以上三个值均为公开构建参数，不需要勾选“加密”；WSS 会写入发布的网页配置，勾选加密也不会对玩家隐藏入口。之前设置的 `PYTHON_VERSION=3.13.3` 可以删除，保留也不影响本项目构建，因为现在不调用 Python。不要放玩家凭据、证书私钥、隧道 Token 或 GitHub Token。Cloudflare 的构建环境支持 Node 版本覆盖与跳过自动依赖安装。[构建镜像说明](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)、[构建缓存](https://developers.cloudflare.com/workers/ci-cd/builds/build-caching/)

5. 保存仓库连接和构建设置。对于已有 Worker，官方接入步骤要求向连接的 Git 分支推送新提交来触发构建；连接之前已经存在的提交不能作为首次自动构建已启动的依据。由维护者向 `deploy/cloudflare` 推送一次提交，初次成功后不再需要手动上传 ZIP。[已有 Worker 的首次触发步骤](https://developers.cloudflare.com/workers/ci-cd/builds/)

6. 在当前 Worker 的 **Deployments（部署）** 页底部点击 **View build history（查看构建历史）**，再点具体记录查看日志。截图若写着“此 Worker 还没有构建”，表示还没有构建记录；先到 **Settings（设置）→ Builds（构建）** 确认已连接 `301zrg/srvprotiantiweb`、生产分支为 `deploy/cloudflare`，然后检查连接后推送的新提交是否触发记录。手动上传的部署不等于 Git 构建记录。[构建状态与日志入口](https://developers.cloudflare.com/workers/ci-cd/builds/)

连接、推送和生产分支规则见 [GitHub 接入](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)、[构建分支](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)。若将来启用 PR 预览，预览站的 origin 可能不在现有 WSS 网关白名单中，预览构建成功不代表已能在线对战；需要单独安排本地或测试网关联调。

## 后续更新

2026-10-08 子模块拉取修复：录像分支的构建 `6f50c5c0-75cc-4dc1-aef6-bb87befa0ea8` 在 `updating repository submodules` 阶段失败，尚未执行 npm。旧 `neos-protobuf` 指向额外的 MyCard 源码站。日常构建使用已提交的生成代码，因此将该固定提交的 IDL 和许可证按原字节收进 [protocol-source](../protocol-source/README.md)，移除 Git 子模块声明及 gitlink。生成协议代码未改，已有本地检出保留；新 CI 克隆不再访问该源码站。只维护协议时才使用现有 `sync_proto.sh`，现在读取仓库内固定源码，无需在 Cloudflare 新增变量或 Token。修复后的云端提交号需继续核对，不能把本地克隆成功当作远端构建已成功。

代码在工作分支完成并通过相关验证后，由维护者把确认可发布的修改合入／推送至 `deploy/cloudflare`。Cloudflare 自动拉取仓库、安装锁定依赖、校验并还原卡库、构建并部署到原站点。仅创建 PR、仅本地保存或推送其他分支，不会更新这个生产站点；直接更新发布分支会触发上线。

本项目构建与文件下载继续由外部 Cloudflare 承担。无需为前端自动部署重启 SRVPro、Nginx 或 PM2 隧道，也不需要改变现有网页 origin 白名单。Quick Tunnel 重启仍可能换 WSS 地址；到构建变量中更新 `VITE_DUEL_WS_URL` 后运行一次新构建，不需要手动上传文件。

源码中的 `public/duel-config.js` 保持空的默认站方配置，Cloudflare 构建会根据变量生成发布版本。原 Pages／BiliToy 打包命令继续可用。代码回滚可以在 Cloudflare 已部署版本中选取上一版本，或把发布分支的错误修改用 revert 撤销，再触发构建；不要以 reset + 强制推送覆盖协作者工作。[Workers 回滚](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/)

## 首次验收与故障定位

- 构建日志应依次完成 `npm ci`、四语资源 SHA 校验、Vite 构建、素材复制与 Wrangler 部署；失败日志从第一处 error 看起。
- 打开 `/deployment-info.json` 核对 `sourceCommit` 与发布分支一致；打开 `/duel-config.js` 核对当前 WSS。Hash 路由和卡组导入链接应继续可用。
- 浏览器核对首页、四语搜索／组卡与正常入房。部署页面成功不代替正式对局验收。
- `Worker name ... does not match`：确认 Cloudflare 选的是 `black-surf-69e5`，与 `wrangler.json` 相同。
- WSS 配置错误：变量必须放在“构建变量”中，值为完整 `wss://.../neos`，修改后重新构建。
- 依赖安装失败：确认根目录和上述版本／安装变量；`npm ci` 不要省略开发依赖，Vite 属于开发依赖。
- `ModuleNotFoundError: No module named '_sqlite3'`：初版构建曾调用平台 Python。确认已拉取修正提交，构建仍用 `npm ci --include=dev && npm run build:cloudflare`；修正后的日志会执行 `build:static` 并打印 `no Python required`。无需到面板手动安装 SQLite 或更换 Python 版本。
- `changed: rebuild, verify and repackage`／快照 SHA 不符：源文件或生成规则与固定快照不一致，按资源说明更新 revision／快照，不跳过校验。

本机验证记录：Node 24.15.0、Python 3.13.14。无 `.env.local`、未初始化上游子模块的干净检出已通过 `npm ci --include=dev`、`npm run build:cloudflare`、资源校验及 Wrangler 4.148.0 的 `--dry-run`；核对 99 个静态文件、四语卡库、WASM、公开 WSS 配置、no-store 响应头与源码提交号，最大单文件约 2.40 MB。缺少 WSS 时会在构建前失败。Cloudflare 账号连接、Ubuntu 构建镜像和正式部署仍需由站点所有者完成首次运行后确认；本机 dry-run 没有上传或修改现有线上站点。

修复 `_sqlite3` 后的验证：快照测试覆盖空目录精确还原、LF／CRLF 指纹一致、卡库／生成规则／归档篡改拒绝、解压上限及路径越界拒绝；原 Python 校验确认四语 5,267 卡 ruleset 和 134 条禁表不变。独立检出将 PATH 中的 Python 替换为立即报错的测试程序，`npm run build:cloudflare` 仍完成资源还原、Vite 与复制，核对 99 个静态文件，Wrangler dry-run 通过；整个云端命令不再需要 `_sqlite3`。真实 Cloudflare 重试状态与发布提交需继续核对，不把本机成功算作云端部署成功。

2026-10-08 真实云端验收：构建 `854bace4-2694-49fa-8c6d-9cc7363ddc5b` 返回 success，`deployment-info.json.sourceCommit` 为 `17aa0c2562fdbd8902dc6481b6a06cd90d3fdf96`。核对 25 个 JS／CSS 和四语卡库／strings／禁表完整 SHA；Edge 桌面／390px 触控尺寸的首页、联机表单、示例卡组、参数卡组导入与 Hash 清理通过，公开配置未被测试覆盖；真实网页 origin 的浏览器 WSS 握手成功。未登录玩家或运行比赛，未做 iOS 真机测试。无需为本次部署重启 SRVPro、Nginx 或隧道。
