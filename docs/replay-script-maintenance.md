# 录像规则维护与大陆访问

## 更新旧裁定脚本需要同步网页吗

需要。在线对局由服务器执行脚本，录像由浏览器中的固定 Core、卡表和 Lua 包重演。更新服务器或天梯助手使用的 `301zrg/specials/706`，不会自动更新网页规则。播放时不会拉取 GitHub 最新脚本，Cloudflare 日常 CI 也只校验、复制仓库中已提交的固定资源。

| 更新内容                                            | 网页需要做什么                                             |
| --------------------------------------------------- | ---------------------------------------------------------- |
| 服务器实际使用的卡片 Lua、旧裁定 Lua、`special.lua` | 审查变更，生成新的规则资源 revision，回归后发布网页        |
| 仅天梯助手 UI、安装器或更新入口                     | 不需更新网页规则；助手下载的脚本是否也用于服务器需另行核对 |
| Core C/C++ 或 Lua 运行库                            | 重编译固定 WASM，重新打包对应脚本和规则卡表                |
| 网页 UI、音效或显示文本                             | 普通静态构建和发布，不需要更新 Lua／WASM                   |

Lua 更新通常不需要重编译 WASM，但不能复制一个散落的 `.lua` 就当作同步完成。

**资源结构（2026-11 起）**：`706-v1` 是不再改动的底稿，固定来源、大小及 SHA-256 在 [公开 profile](../public/replay/706-v1/profile.json)，客户端也嵌入[相同清单](../src/replay/profile.json)。服务器每个规则环境是 v1 之上的一个差异包：`public/replay/revisions/<环境ID>/{profile.json,delta.data}`。环境列表 `public/replay/revisions/index.json` 与打包进页面的 [src/replay/revisions.json](../src/replay/revisions.json) 必须逐字节相同；列表记每个 profile 的 SHA，profile 记差异包的大小和 SHA，任一级不符就停止加载，不换用别的版本。环境 ID、生效时间等规则见 specials 仓库的 `706-meta/`。

**脚本更新时的维护顺序**（只换 Lua，不换 Core 和卡表）：

1. 服务器按一次性上线流程切换，取得回执：生效分界 T（整数秒）、切换前后的完整生效 Lua 树摘要。
2. 取服务器的**分层**只读快照（`expansions/script`、`script` 分开保存，`specials/` 应不存在），放在本地私有目录，**不提交**。删除上层覆盖后会由下层同名文件生效，所以不能只拿合并后的树。
3. 生成环境：

   ```powershell
   node scripts/build_replay_revision.mjs --id 706-YYYYMMDD --tree <分层快照目录> `
     --digest <回执里切换后的摘要> --effective-from <T> --evidence release-receipt `
     --specials <S 提交> --tree706 <S 的 706 子树>
   npm run check:replay   # 也会校验 revisions/
   node scripts/test_replay_revisions.mjs
   npm run build:static
   ```

   生成器把目标树与 v1 逐文件比较（按 LF 归一后的内容），合并后的摘要必须等于回执的值。已有环境 ID 的文件字节、分界和来源信息必须完全一致；相同输入幂等成功，不重写文件，不同内容必须使用新 ID。生成器在写入前检查候选版本表、两份索引的一致性及目标目录；校验失败不留下候选文件，也不自动修补已有的残缺目录。已发布的环境不改动。
4. 用正式服切换后实测得到的自有录像核对新环境；旧录像仍按自己的时间选旧环境。通过后发布。

Core 或卡表变化时，差异包不够用，需要新的全量底稿：[规则打包](../scripts/build_replay_resources.py)、[Core 编译](../scripts/build_replay_runtime.py) 目前固定输出 v1，届时先改成新的底稿名再运行，不能覆盖 v1。

```powershell
# 仅 Core 改动时需要；固定 SDK 见 replay-usage.md
python scripts/build_replay_runtime.py --emsdk <固定SDK目录>
```

### special.lua 与旧录像

当前 `utility.lua` 已嵌入经过审查的 `special.lua`，只调用一次 `PreloadUds()`。更新时从相应的干净 utility 合成，或审查现成 bootstrap；不能再次追加同一补丁。生成器校验已有合成结果摘要及一次定义／一次调用，新补丁需更新锁并提供相应测试。

YRP 没有脚本版本，也不记录来自哪台服务器。播放器按录像头的开局时间（偏移 20 的 `start_time`）选生效时间不晚于它的最后一个环境；时间为 0 或比当前时间晚一天以上时用最新环境，并提示无法判断。玩家始终可以手动指定版本，手选会记在录像上。

只有本服的录像能按时间对应版本：网页在线对局收到的录像，以及经官网桥接交接、校验过来源的录像，显示"按录像时间自动选择"；普通导入的文件只显示"按本服时间表推测"。本地自行对局等其他来源的录像，用哪个环境都可能对不上，界面只做提示，不另提供"无 706 覆盖"的版本。第一条环境 `706-20260907` 是上线前取得的服务器快照，作为更早录像的兼容版本，没有严格的历史分界。

## 大陆播放是否需要访问 GitHub

不需要。点击播放后，从当前静态网站的**同源路径**加载 `replay/706-v1/ocgcore.js`、`ocgcore.wasm`、`cards.data` 和 `scripts.data`，再加载所选环境的 `replay/revisions/<环境ID>/profile.json` 和 `delta.data`（几十 KB），并读一次 `replay/revisions/index.json` 检查本页的环境列表是否过时（读不到只提示，不影响播放）。录像原件保存在本机，规则重演在本机 Worker 中完成，不连接天梯 WSS。音效也来自站点随包发布的 `neos-assets/sound/*.wav`，没有运行时 GitHub／raw.githubusercontent.com 请求。

GitHub 只用于维护者更新源码和 CI 发布。维护者暂时不能访问 GitHub，不影响已发布站点的现有规则包。普通静态构建只需要 Node/npm 和仓库固定资源，不下载旧裁定仓库，不依赖 Python、SQLite 模块或编译器。

首播规则资源约 6.60 MiB，缓存命中也校验摘要。缓存只是可恢复优化，不保证永远保留数据或支持冷启动离线；页面、卡库、图片、音效也需要从托管站点取得。

大陆能否使用，取决于用户当前网络能否完整取得**托管网站**的资源，与 GitHub 能否打开无关。普通 `workers.dev` 的跨境质量不能由一台开发机保证。Cloudflare 中国网络需要另外开通，普通 Workers 托管不等于已经接入大陆节点；见 [官方说明](https://developers.cloudflare.com/china-network/)。不要只用首页可打开判断约 6.6 MiB 的首播包是否可用。

2026-10-09 本开发机使用 `curl --noproxy "*"` 直连现有 Workers 站点：`scripts.data` 完整取得 5,451,027 字节，约 27.6 秒，SHA-256 与固定 profile 一致。前一次限制 25 秒时下载未完成。该结果仅证明本机当时的网络能完整取得文件，不代表所有大陆运营商、地区、iOS 真机或平台内嵌页均已验收。

备用静态站点需完整部署规则包、卡库、卡图、音效，保持正确的资源路径和原始字节。BiliToy 的适配打包已经包含录像资源；平台资源限制和真实手机体验仍需验收。录像库按网站来源隔离，换网址后要重新导入原件，不自动迁移旧网站的本地库。

## 音效与另存／分享

录像音效独立默认开启，播放页可关闭；音量沿用音效设置。点击播放／单步解锁音频，暂停、后台、跳转、退出停止声音；跳转不播放略过的事件，16 倍速限制叠加数量。

系统分享要求安全上下文、浏览器／系统支持、分享策略许可和即时点击。`canShare()` 只是能力检查，系统仍可能拒绝 `.yrp`；[接口说明](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share) 列出了这些拒绝条件。

「另存／分享」先读本地录像，文件准备好后在弹窗中点击「分享文件」，保留新的点击授权。权限／格式拒绝或不支持接口时回退原件下载；用户主动取消不自动下载。保留文件名和原始字节，不伪装扩展名、不上传文件。嵌入平台若同时禁止分享和下载，需平台允许相应功能或在独立浏览器打开，网页不能绕过宿主策略。
