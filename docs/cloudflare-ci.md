# 现有 Workers 站点的 GitHub 自动部署

更新：2026-10-11。本文说明现有 `black-surf-69e5` Worker 的自动部署，并保留首次云端成功与预览故障记录。子模块和缺少 `previews` 区块的问题已修复。PR #25 的基础提交 `ef04e565` 在云端构建成功，预览发布因 Cloudflare API 错误 `971`、`Retry-After: 30` 失败；后续已增加固定版本和有限重试，云端结果须另行核对。本轮没有探测实际部署版本、域名和 WSS 地址，项目级实现与验收统一见 [当前状态](PROJECT_STATUS.md)。自动部署仅负责 `srvprotiantiweb`，天梯服务器及 `srvprotianti` 官网页面由各自项目部署。

## 仓库配置

- [wrangler.json](../wrangler.json)：Worker 名称与现有站点一致，只上传 `dist/` 静态文件，不需要 Worker 运行时代码。包含 `previews: {}`，供非生产分支的 `wrangler preview` 使用；`assets` 和兼容日期仍在顶层，不放进 `previews`。修改 Worker 名称必须同时调整此文件；CI 要求名称一致。[名称要求与 Git 接入](https://developers.cloudflare.com/workers/ci-cd/builds/)、[预览配置](https://developers.cloudflare.com/workers/previews/configuration/#wrangler-configuration-file)
- [package.json](../package.json)：`build:cloudflare` 通过 `build:static` 还原固定环境资源，再执行 Vite 构建及资源复制；`deploy:cloudflare` 和 `preview:cloudflare` 通过 [发布脚本](../scripts/release_cloudflare.mjs) 使用固定的 Wrangler `4.148.0`，对明确的 API 限流最多尝试三次。预览始终调用 `wrangler preview`，不会变成生产发布。
- [build_cloudflare.mjs](../scripts/build_cloudflare.mjs)：要求显式传入公开 WSS 地址，固定根路径与正常资源格式；生成公开 `duel-config.js` 和带源码提交号的 `deployment-info.json`。官网链接与卡组／录像消息白名单可通过公开构建变量一同发布，详见 [公开配置与迁址](public-deployment-config.md)。缺少或无效 WSS、白名单错误、构建失败时返回非零退出码，不执行后续部署。普通 `npm run build` 仍可用于离线组卡开发。
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
| 非生产分支预览 | 需要 PR 预览时勾选“启用预览构建”；预览用于检查功能，不替代生产发布 |
| Preview command / 预览命令 | `npm run preview:cloudflare`；所需 `previews: {}` 已在仓库。需要在面板将原来的 `npx wrangler preview` 改成此值并保存，重试新提交；关闭预览构建时不会执行 |
| Build cache / 构建缓存 | 开启；缓存 npm 下载，环境资源校验／还原与 Vite 构建仍会执行 |

Workers 的页面没有 Pages 的“输出目录”项；静态目录已由 `wrangler.json` 的 `assets.directory = ./dist` 指定。无需选择 `build:prod`，那是保留的上游构建命令，使用了上游 CDN 基路径。[Workers 构建配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[静态资源](https://developers.cloudflare.com/workers/static-assets/)

4. 在 **Build variables and secrets（构建变量与机密）** 添加以下变量。它们是构建变量；纯静态 Worker 不需要运行时变量或私钥。

| 变量名 | 值 | 作用 |
| --- | --- | --- |
| `SKIP_DEPENDENCY_INSTALL` | `1` | 由上述构建命令显式执行 `npm ci`，避免平台先自动装一次 |
| `NODE_VERSION` | `24` | 使用 Node 24 系列，满足固定 Wrangler 的 Node ≥22 要求 |
| `VITE_DUEL_WS_URL` | `wss://districts-studios-rear-representation.trycloudflare.com/neos` | 2026-10-08 读取现有站点公开配置确认的临时对战入口；如隧道地址已改变，填实际新地址 |

上述值均为公开构建参数，不需要勾选“加密”；WSS 会写入发布的网页配置，勾选加密也不会对玩家隐藏入口。官网迁址时还可设置 `VITE_DECK_IMPORT_ORIGINS`（精确 origin 的 JSON 数组，例如 `["https://ladder.example.com"]`；`[]` 禁用消息交接）和 `VITE_WEBSITE_BASE_URL`（首页官网链接，例如 `https://ladder.example.com/`）。未设置时沿用原有默认值；不是 WSS 网关的网页版 Origin 白名单。三项发布值使用同一校验器并一起写入产物，完整规则和手工包参数见 [公开配置](public-deployment-config.md)。之前设置的 `PYTHON_VERSION=3.13.3` 可以删除，保留也不影响本项目构建，因为现在不调用 Python。不要放玩家凭据、证书私钥、隧道 Token 或 GitHub Token。Cloudflare 的构建环境支持 Node 版本覆盖与跳过自动依赖安装。[构建镜像说明](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)、[构建缓存](https://developers.cloudflare.com/workers/ci-cd/builds/build-caching/)

5. 保存仓库连接和构建设置。对于已有 Worker，官方接入步骤要求向连接的 Git 分支推送新提交来触发构建；连接之前已经存在的提交不能作为首次自动构建已启动的依据。由维护者向 `deploy/cloudflare` 推送一次提交，初次成功后不再需要手动上传 ZIP。[已有 Worker 的首次触发步骤](https://developers.cloudflare.com/workers/ci-cd/builds/)

6. 在当前 Worker 的 **Deployments（部署）** 页底部点击 **View build history（查看构建历史）**，再点具体记录查看日志。截图若写着“此 Worker 还没有构建”，表示还没有构建记录；先到 **Settings（设置）→ Builds（构建）** 确认已连接 `301zrg/srvprotiantiweb`、生产分支为 `deploy/cloudflare`，然后检查连接后推送的新提交是否触发记录。手动上传的部署不等于 Git 构建记录。[构建状态与日志入口](https://developers.cloudflare.com/workers/ci-cd/builds/)

连接、推送和生产分支规则见 [GitHub 接入](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)、[构建分支](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)。若将来启用 PR 预览，预览站的 origin 可能不在现有 WSS 网关白名单中，预览构建成功不代表已能在线对战；需要单独安排本地或测试网关联调。

## 后续更新

2026-10-08 子模块拉取修复：录像分支的构建 `6f50c5c0-75cc-4dc1-aef6-bb87befa0ea8` 在 `updating repository submodules` 阶段失败，尚未执行 npm。旧 `neos-protobuf` 指向额外的 MyCard 源码站。日常构建使用已提交的生成代码，因此将该固定提交的 IDL 和许可证按原字节收进 [protocol-source](../protocol-source/README.md)，移除 Git 子模块声明及 gitlink。生成协议代码未改，已有本地检出保留；新 CI 克隆不再访问该源码站。只维护协议时才使用现有 `sync_proto.sh`，现在读取仓库内固定源码，无需在 Cloudflare 新增变量或 Token。生产构建 `2255d85a-37f2-4254-b5c5-51ebe072fc5b` 已成功，线上 `deployment-info.json.sourceCommit` 已核对为 `c7c259a6142a9834a62ad43d5a2dd45d811b24f7`。

录像预览构建 `8a1ecf84-5fdc-42f9-83e2-5bd222134455` 已完成卡库／录像资源校验及 Vite 编译，失败发生在 `npx wrangler preview`，错误为配置缺少 `previews` 区块。当时添加空区块即可，该配置已进入后续分支。2026-10-10 为处理 API 限流，预览命令另改为上表中的 `npm run preview:cloudflare`；构建命令及 WSS 变量不变。不要重试缺少配置的旧提交，也不要把预览命令改成 `wrangler deploy`，以免将未合并功能发布到生产站点。

### API 限流与发布重试

构建 `68764b26-5b69-4510-90c5-9f6dffe6bed4` 的日志明确包含 `Success: Build command completed`；随后 Wrangler `4.149.0` 调用预览 API，收到 `971` 与等待 30 秒的提示。资源体积警告不是这次失败原因，也没有证据证明 Wrangler 升级是限流的原因。固定版本用于保持两种发布命令可复现。

新脚本只对 Wrangler 明确报告的 Cloudflare API 限流（`971`／`429`）重试，最多三次尝试。有可解析的 `Retry-After` 提示时按其秒数等待，至少 30 秒并多等 1 秒；没有提示时第一次等待 31 秒、第二次 61 秒。服务器要求超过 300 秒时直接失败，不缩短等待后抢先请求。权限、认证、配置、一般网络错误或未知失败均不自动重试；重试耗尽保留失败退出码，中止构建也中止重试。

Cloudflare 对 API 有账户／用户、IP 等限流口径，部分接口还有独立限制；仅此日志不能确定本次触发哪一个口径。[官方 API 限流与 Retry-After 说明](https://developers.cloudflare.com/fundamentals/api/reference/limits/)。不要连续点击多次重试，也不要同时启动多个相同分支的发布。改好面板命令后，可以重试包含新脚本的最新提交；无需新项目、Token、DNS 或服务器重启。

`npm run test:cloudflare-release` 不调用真实发布接口，验证服务器等待值、重试上限、非限流失败立即退出、取消与预览／生产隔离。本地测试通过不代表云端发布已经成功，合并前仍核对最新预览检查。

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
- `Your Wrangler configuration is missing a previews block`：这是预览发布配置问题，前面的 `Success: Build command completed` 表示代码已构建成功。确认新提交的 `wrangler.json` 包含顶层 `"previews": {}`；当前面板命令使用 `npm run preview:cloudflare`，内部仍调用 `wrangler preview`，不需要新增构建变量或 Token。
- `Please wait and consider throttling your request speed [code: 971]`／API `429`：属于发布 API 限流。预览命令改为 `npm run preview:cloudflare` 后重试新提交；等待遵循服务器提示，避免并发发布。重试耗尽仍报错时保留日志，不能将此项标为部署通过。
- `changed: rebuild, verify and repackage`／快照 SHA 不符：源文件或生成规则与固定快照不一致，按资源说明更新 revision／快照，不跳过校验。

## 历史验证记录（按发生顺序）

以下保留首次本机验证、修复与后续真实云端成功记录。前两段的“待首次确认”
只描述当时阶段，已被 2026-10-08 云端成功证据取代；成功发布仍不等于正式完整比赛或真机通过。
当前项目级状态见 [PROJECT_STATUS](PROJECT_STATUS.md)，本次文档整理没有重查线上提交和 WSS 地址。

本机验证记录：Node 24.15.0、Python 3.13.14。无 `.env.local`、未初始化上游子模块的干净检出已通过 `npm ci --include=dev`、`npm run build:cloudflare`、资源校验及 Wrangler 4.148.0 的 `--dry-run`；核对 99 个静态文件、四语卡库、WASM、公开 WSS 配置、no-store 响应头与源码提交号，最大单文件约 2.40 MB。缺少 WSS 时会在构建前失败。Cloudflare 账号连接、Ubuntu 构建镜像和正式部署仍需由站点所有者完成首次运行后确认；本机 dry-run 没有上传或修改现有线上站点。

修复 `_sqlite3` 后的验证：快照测试覆盖空目录精确还原、LF／CRLF 指纹一致、卡库／生成规则／归档篡改拒绝、解压上限及路径越界拒绝；原 Python 校验确认四语 5,267 卡 ruleset 和 134 条禁表不变。独立检出将 PATH 中的 Python 替换为立即报错的测试程序，`npm run build:cloudflare` 仍完成资源还原、Vite 与复制，核对 99 个静态文件，Wrangler dry-run 通过；整个云端命令不再需要 `_sqlite3`。真实 Cloudflare 重试状态与发布提交需继续核对，不把本机成功算作云端部署成功。

2026-10-08 真实云端验收：构建 `854bace4-2694-49fa-8c6d-9cc7363ddc5b` 返回 success，`deployment-info.json.sourceCommit` 为 `17aa0c2562fdbd8902dc6481b6a06cd90d3fdf96`。核对 25 个 JS／CSS 和四语卡库／strings／禁表完整 SHA；Edge 桌面／390px 触控尺寸的首页、联机表单、示例卡组、参数卡组导入与 Hash 清理通过，公开配置未被测试覆盖；真实网页 origin 的浏览器 WSS 握手成功。未登录玩家或运行比赛，未做 iOS 真机测试。无需为本次部署重启 SRVPro、Nginx 或隧道。
