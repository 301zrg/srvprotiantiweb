# 录像规则维护与大陆访问

## 更新旧裁定脚本需要同步网页吗

需要。在线对局由服务器执行脚本，录像由浏览器中的固定 Core、卡表和 Lua 包重演。更新服务器或天梯助手使用的 `301zrg/specials/706`，不会自动更新网页规则。播放时不会拉取 GitHub 最新脚本，Cloudflare 日常 CI 也只校验、复制仓库中已提交的固定资源。

| 更新内容                                            | 网页需要做什么                                             |
| --------------------------------------------------- | ---------------------------------------------------------- |
| 服务器实际使用的卡片 Lua、旧裁定 Lua、`special.lua` | 审查变更，生成新的规则资源 revision，回归后发布网页        |
| 仅天梯助手 UI、安装器或更新入口                     | 不需更新网页规则；助手下载的脚本是否也用于服务器需另行核对 |
| Core C/C++ 或 Lua 运行库                            | 重编译固定 WASM，重新打包对应脚本和规则卡表                |
| 网页 UI、音效或显示文本                             | 普通静态构建和发布，不需要更新 Lua／WASM                   |

Lua 更新通常不需要重编译 WASM，但不能复制一个散落的 `.lua` 就当作同步完成。目前资源包为 `706-v1`，固定来源、大小及 SHA-256 在 [公开 profile](../public/replay/706-v1/profile.json)，客户端也嵌入[相同清单](../src/replay/profile.json)。摘要不一致会停止加载。

维护顺序：

1. 确认正式服务器实际使用的 Core、基础 Lua、扩展 Lua 和 706 覆盖版本，记录固定提交。输入仓库保持只读、干净，不直接把依赖更新到最新 master。
2. 建立新 revision，例如 `706-v2`，保留 v1。当前生成器输出、提交锁、客户端入口和缓存名固定为 v1，更新时需一并调整；不能直接运行旧命令覆盖 v1。
3. 检查基础 → 扩展 → 706 的覆盖顺序和 utility bootstrap，生成新的 `scripts.data`、卡表及两份 profile。仅 Core 改动时才先编译新 WASM。
4. 使用匹配原生客户端／服务器生成的自有录像验证抽牌、响应、连锁、LP、攻守、终局及 special 边界，并回归旧录像；通过后发布完整静态包。

现有工具：[规则打包](../scripts/build_replay_resources.py)、[Core 编译](../scripts/build_replay_runtime.py)。**先调整新 revision 和输入锁**，再执行：

```powershell
# 仅 Core 改动时需要；固定 SDK 见 replay-usage.md
python scripts/build_replay_runtime.py --emsdk <固定SDK目录>

# 当前工具固定 v1，更新规则之前先改好新 revision 的输出和锁
python scripts/build_replay_resources.py --server-root <服务器项目目录> --specials-root <固定specials目录>
npm run check:replay
npm run test:replay-runtime
npm run test:replay-scene
npm run build:static
```

### special.lua 与旧录像

当前 `utility.lua` 已嵌入经过审查的 `special.lua`，只调用一次 `PreloadUds()`。更新时从相应的干净 utility 合成，或审查现成 bootstrap；不能再次追加同一补丁。生成器校验已有合成结果摘要及一次定义／一次调用，新补丁需更新锁并提供相应测试。

YRP 没有完整脚本版本摘要。**当前播放器仅支持固定 `706-v1`，还没有按录像自动选择历史规则包的功能。** 保留 v1 文件不等于播放器会自动选中 v1。将来更新规则时，需同时明确旧录像的 profile 选择／兼容策略；新脚本可能改变旧录像的结果，不能承诺任意历史版本无条件兼容。

## 大陆播放是否需要访问 GitHub

不需要。点击播放后，从当前静态网站的**同源路径**加载 `replay/706-v1/ocgcore.js`、`ocgcore.wasm`、`cards.data` 和 `scripts.data`。录像原件保存在本机，规则重演在本机 Worker 中完成，不连接天梯 WSS。音效也来自站点随包发布的 `neos-assets/sound/*.wav`，没有运行时 GitHub／raw.githubusercontent.com 请求。

GitHub 只用于维护者更新源码和 CI 发布。维护者暂时不能访问 GitHub，不影响已发布站点的现有规则包。普通静态构建只需要 Node/npm 和仓库固定资源，不下载旧裁定仓库，不依赖 Python、SQLite 模块或编译器。

首播规则资源约 6.60 MiB，缓存命中也校验摘要。缓存只是可恢复优化，不保证永远保留数据或支持冷启动离线；页面、卡库、图片、音效也需要从托管站点取得。

大陆能否使用，取决于用户当前网络能否完整取得**托管网站**的资源，与 GitHub 能否打开无关。普通 `workers.dev` 的跨境质量不能由一台开发机保证。Cloudflare 中国网络需要另外开通，普通 Workers 托管不等于已经接入大陆节点；见 [官方说明](https://developers.cloudflare.com/china-network/)。不要只用首页可打开判断约 6.6 MiB 的首播包是否可用。

2026-10-09 本开发机使用 `curl --noproxy "*"` 直连现有 Workers 站点：`scripts.data` 完整取得 5,451,027 字节，约 27.6 秒，SHA-256 与固定 profile 一致。前一次限制 25 秒时下载未完成。该结果仅证明本机当时的网络能完整取得文件，不代表所有大陆运营商、地区、iOS 真机或平台内嵌页均已验收。

备用静态站点需完整部署规则包、卡库、卡图、音效，保持正确的资源路径和原始字节。BiliToy 的适配打包已经包含录像资源；平台资源限制和真实手机体验仍需验收。录像库按网站来源隔离，换网址后要重新导入原件，不自动迁移旧网站的本地库。

## 音效与另存／分享

录像音效独立默认开启，播放页可关闭；音量沿用音效设置。点击播放／单步解锁音频，暂停、后台、跳转、退出停止声音；跳转不播放略过的事件，16 倍速限制叠加数量。

系统分享要求安全上下文、浏览器／系统支持、分享策略许可和即时点击。`canShare()` 只是能力检查，系统仍可能拒绝 `.yrp`；[接口说明](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share) 列出了这些拒绝条件。

「另存／分享」先读本地录像，文件准备好后在弹窗中点击「分享文件」，保留新的点击授权。权限／格式拒绝或不支持接口时回退原件下载；用户主动取消不自动下载。保留文件名和原始字节，不伪装扩展名、不上传文件。嵌入平台若同时禁止分享和下载，需平台允许相应功能或在独立浏览器打开，网页不能绕过宿主策略。
