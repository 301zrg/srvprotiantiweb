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

## 已知失败（2026-11-01 检查）

| 测试 | 现象 |
| --- | --- |
| `scripts/test_duel_animation.mjs` | 加载 `src/infra/eventbus.ts` 时出错；该文件最后由 #37（2026-10-25）修改 |
| `scripts/test_language_hints.mjs` | 测试用的 `@/api` 替身缺少 `DESCRIPTION_LIMIT` 导出 |
| `scripts/test_online_audio.mjs` | 测试用的 `window` 替身缺少 `addEventListener` |

这三项看起来都是源码改动后测试替身没有跟上，具体待单独修复。`test:duel-animation`、`test:client-settings` 两个专项脚本包含其中的测试，目前也会失败。
