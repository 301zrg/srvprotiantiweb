# 测试分类与入口

更新：2026-11-01。按依赖分类，默认入口只放能在干净检出里稳定运行的测试。仓库在 GitHub 上暂无 CI；Cloudflare 构建只校验资源并编译，不运行这些测试。

| 入口 | 范围 | 环境要求 |
| --- | --- | --- |
| `npm run test:unit` | [scripts/unit-tests.json](../scripts/unit-tests.json) 列出的逻辑测试（`scripts/test_*.mjs`），逐个独立进程运行，最后汇总失败项；全部约 7 分钟 | `npm ci` 之后即可；不需要构建、浏览器或网络 |
| 各 `test:*` 专项脚本 | 单个模块的逻辑测试或界面回归，见 `package.json` | 视脚本而定 |
| `node scripts/<名称>_ui.mjs`（约 60 个） | 浏览器界面回归，Playwright 驱动 Chromium/WebKit；部分支持 `--built` 用构建产物验证 | 需要 `npx playwright install` 的浏览器；带 `--built` 时先 `npm run build` |
| `npm run build:cloudflare` | 资源校验、类型检查与正式构建 | 与 Cloudflare 构建相同 |

维护规则：

- 新的逻辑测试能在干净检出里稳定通过时，加入 `unit-tests.json`；依赖构建产物、浏览器或网络的放到专项脚本里，并在这里写明要求。
- `unit-tests.json` 的 `knownFailing` 记录检查时已失败、暂不纳入默认入口的测试和原因。修好后移回 `tests`，不要为了让入口通过而删掉测试。
- 界面脚本的截图和报告写到被忽略的 `.audit-tmp/`。本地合成场面不能代替真实手机、正式服完整对局或生产验收。

## 2026-11-01 修复的三项

首次整理时这三项已经失败。原因都是源码改了、测试没跟上，功能本身没有问题；修复后已移回 `test:unit`：

| 测试 | 原因 | 修复 |
| --- | --- | --- |
| `scripts/test_duel_animation.mjs` | 直接 `import` 含 `enum` 的 `src/infra/eventbus.ts`，Node 的类型剥离不支持；专项脚本带 `--experimental-transform-types` 才能跑 | 先用 esbuild 编译再导入，普通 `node` 也能运行。依赖 `--expose-gc` 的那一项在 `test:unit` 中会跳过，在 `test:duel-animation` 中照常运行 |
| `scripts/test_language_hints.mjs` | 10-11 起 `errorMsg.ts` 引入 `@/stores` 的 `SideStage` 和 `sideStore`；后来 `@/api` 又多了 `DESCRIPTION_LIMIT`、`getStrings` | 补上这些替身和模拟的 `sideStore`，并断言"副卡组被拒后回到更换中" |
| `scripts/test_online_audio.mjs` | 10-31 联机音效改为共用一个、由触摸解锁的 AudioContext：从 `window.AudioContext` 创建，静音时停止正在播放的音源，不再关闭上下文；首次加载超过 600 ms 会被跳过 | `window` 替身补上 `AudioContext` 和监听方法，音源替身补上 `stop`、`disconnect`；先预热一次，再按共享上下文改写断言（停止正在播放的、静音期间不新建上下文、迟到的下载不播放、音量实时生效） |

教训：改动源码的导入、全局对象或行为时，要同时运行对应测试；测试替身必须跟着源码一起改。
