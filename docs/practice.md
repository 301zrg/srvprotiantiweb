# 本地测试手牌

组卡页的「测试手牌」把当前未保存草稿复制到内存桥，然后进入 `/practice` 并直接开局。A、B 默认使用这份草稿，也可在「练习设置」分别选择本地卡组；不会保存或覆盖卡组。起始手牌默认 5、不洗牌默认关闭、A 方先攻。当前 706 环境固定大师规则 2，不提供规则下拉框；Core 配置仍接受环境指定的规则与固定资源版本。

「重试本次手牌」使用开局时复制的双方卡组、起始手牌、洗牌选项和四个随机种子，不受随后修改的页面选项影响。「重新发牌」按当前页面选项重新复制卡组并产生新种子。不洗牌仅保留初始主卡组顺序，不禁止卡片效果随后要求的洗牌。备牌不进入测试对局。

双方所有操作均由用户选择。A 方始终在下、B 方在上，不因回合或响应方改变而翻转；双方手牌与里侧卡片可见。点击卡片打开正常动作菜单，位置和目标可直接在场地选择，组合／宣言等通过选择面板处理。当前操作方取 Core 请求中的 player 字段，可能在 A 回合由 B 处理连锁。双方主卡组与额外卡组可随时查看全部卡片，按 Core 当前 sequence 从大到小（牌堆顶到底）排列；查看详情或牌堆本身不提交响应。检索／翻看候选严格来自当前 Core 请求，只有合法候选可提交。

选择路由集中在 `interactions.ts`：通常／战斗命令和位置选择保留场地操作；场上及手牌目标可直接选，卡组、墓地、除外、额外、叠放材料等场地外候选自动打开选择窗口，连锁与其他输入同样显式显示。706 `MSG_SELECT_PLACE`／`MSG_SELECT_DISFIELD` 的 count=0 表示可取消的单位置请求，选择时仍需一组三字节，取消为 `[player,0,0]`；不能将其当成零个位置。正常多位置请求仍严格满足数量。

六阶段栏与联机共享展示组件，颜色表示回合方，当前阶段、可操作与禁用有不同样式。练习允许替 B 使用其合法命令，可进入的阶段仅来自当前 Core 请求，不按卡名推断、不任意跳阶段；MR2 首回合不能进战阶／主二。操作确认沿用全局开关，取消不提交；重新发牌或新请求使旧确认失效。

## 边界与维护

- `src/practice/session.ts` 只复制编辑器草稿，不写 IndexedDB，也不访问在线状态。
- `src/variant/practice.ts` 集中固定环境的资源 revision 与 master rule；当前是 `706-v1`、MR2。页面没有玩家规则选择器。
- `src/practice/worker.ts` 独占一个固定 706 WASM 实例，安装与录像相同的已校验 cards/Lua；不接收 Lua 源码，不加载任意脚本。
- `src/practice/engine.ts` 创建本地 duel，返回事件、完整场地查询和当前待处理请求。响应必须同时匹配请求 id 与真实请求玩家。响应编码和旧协议提示解析集中在 `prompts.ts`。
- `src/ui/Practice/usePracticeSession.ts` 管理 Worker、超时、音效和快照；`Board.tsx` 使用联机场地的响应式几何数值、卡图组件和区域样式，`PhaseBar` 是共享纯展示组件。`interactions.ts` 按 Core 卡片地址与命令构建交互，不生成规则动作。旧的独立操作长列表已移入按需选择面板。
- 页面重开、重新发牌、重试、退出均终止旧 Worker；页面代次和请求对象身份再次阻止旧回包或旧点击影响新对局。单批运算、消息、内存与加载等待均有限制；真实 Core/Lua 错误直接显示并停止该次测试。
- 不复用在线 service handler、在线 MatStore、CTOS 响应或 WSS 连接。在线裁定仍属于服务器，只读录像仍由 ReplayEngine 消费录制响应；测试手牌有独立交互循环。
- 继续测试采用旧 Core 原有机制：`adjust_step` 发出 `MSG_WIN` 后重置胜利标志并继续处理。实践循环仅忽略该事件，不在 LP 归零、抽空卡组或特殊胜利时销毁 duel。Core、Lua、`DUEL_TEST_MODE` 和其他游戏约束保持原样。
- `src/replay/runtime.ts` 提供公共资源加载器。`loadReplayRuntime` 只加载/校验 JS 与 WASM，不创建 duel、不加载 cards/Lua；`loadReplayResource` 保留清单长度、流式上限、SHA-256、坏缓存移除与可选缓存保护。录像与实践分别组合所需资源。
- 音效直接读取共享 `settingStore.audio.enableSoundEffects`、`soundEffectsVolume`，使用独立 ReplayAudio 实例；关闭、退出、切后台立即停止该实例的声音。

修改请求解析、响应编码、初始化规则或资源边界时，更新本文对应契约并运行能区分错误行为的真实 Core 回归；只更新受影响的架构、入口与验收文档，不重复追加历史过程。

参考 [EDOPro SingleMode](https://github.com/edo9300/edopro/blob/master/gframe/single_mode.cpp) 的处理边界：`SinglePlayAnalyze` 让本地 Core 的选择消息进入正常客户端交互，用户响应交回本地 duel。本项目保留在线状态隔离，仅共享展示；上游手牌测试的首回合攻击特例不引入本 MR2 profile。

## 验证

在项目目录运行：

```text
node scripts/test_practice_runtime_loader.mjs
node scripts/test_practice_runtime.mjs
node scripts/test_practice_prompts.mjs
node scripts/test_practice_place.mjs
node --experimental-strip-types scripts/test_practice_interactions.mjs
node scripts/practice_followup_ui.mjs
npm run test:replay-runtime
SMOKE_URL=http://127.0.0.1:4173 node scripts/practice_ui.mjs
SMOKE_URL=http://127.0.0.1:4173 node scripts/practice_editor_roundtrip_ui.mjs
```

最后一项需要已启动的静态预览；PowerShell 使用 `$env:SMOKE_URL='http://127.0.0.1:4173'` 后单独运行 Node 命令。

当前本地验证覆盖：真实旧 Core MR2 首回合 A 抽第 6 张牌、不同双卡组、双方实际操作、A 回合 B 手牌效果连锁归属、错误玩家/过期请求拒绝、同种子重开、LP0/特殊胜利/抽空后继续到后续回合。固定测试协程实际发出并成功消费效果确认、是否、选项、卡片、选中/取消选中、两种等级合计、表示形式、种族/属性/卡名/数字宣言、区域、排序、祭品、指示物分配请求。

静态浏览器回归覆盖 1280×800、390×844、320×640、844×390，包含真实 Worker、双方召唤、连锁、精确重试、新种子、旧 Worker 回包隔离、退出终止与零 WSS；触屏还断言新请求的操作方标题可见。组卡往返回归确认未保存名称、卡片顺序、忽略禁表模式与已修改标记保留，已保存卡组不被覆盖。截图位于本地忽略目录 `.audit-tmp/practice-ui/`。四份现有原生录像回归保持通过。上述结果属于本地软件验证，尚不等于真实手机、长时间实战或正式环境验收。
