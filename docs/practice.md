# 本地测试手牌

组卡页的「测试手牌」把当前未保存草稿复制到内存桥，然后进入 `/practice`。A、B 默认使用这份草稿，也可分别选择本地卡组；不会保存或覆盖卡组。起始手牌默认 5、不洗牌默认关闭、A 方先攻。当前 706 环境固定大师规则 2，不提供规则下拉框；Core 配置仍接受环境指定的规则与固定资源版本。

「重试本次手牌」使用开局时复制的双方卡组、起始手牌、洗牌选项和四个随机种子，不受随后修改的页面选项影响。「重新发牌」按当前页面选项重新复制卡组并产生新种子。不洗牌仅保留初始主卡组顺序，不禁止卡片效果随后要求的洗牌。备牌不进入测试对局。

双方所有操作均由用户选择。当前操作方取 Core 请求中的 player 字段；通常与回合玩家一致，但对方连锁、目标选择等可以不同。场地支持查看双方手牌与里侧卡片，操作选项来自真实 Core；查看卡片不会向 Core 提交响应。

## 边界与维护

- `src/practice/session.ts` 只复制编辑器草稿，不写 IndexedDB，也不访问在线状态。
- `src/variant/practice.ts` 集中固定环境的资源 revision 与 master rule；当前是 `706-v1`、MR2。页面没有玩家规则选择器。
- `src/practice/worker.ts` 独占一个固定 706 WASM 实例，安装与录像相同的已校验 cards/Lua；不接收 Lua 源码，不加载任意脚本。
- `src/practice/engine.ts` 创建本地 duel，返回事件、完整场地查询和当前待处理请求。响应必须同时匹配请求 id 与真实请求玩家。响应编码和旧协议提示解析集中在 `prompts.ts`。
- 页面重开、重新发牌、重试、退出均终止旧 Worker；页面代次和请求对象身份再次阻止旧回包或旧点击影响新对局。单批运算、消息、内存与加载等待均有限制；真实 Core/Lua 错误直接显示并停止该次测试。
- 不复用在线 service handler、在线 MatStore、CTOS 响应或 WSS 连接。在线裁定仍属于服务器，只读录像仍由 ReplayEngine 消费录制响应；测试手牌有独立交互循环。
- 继续测试采用旧 Core 原有机制：`adjust_step` 发出 `MSG_WIN` 后重置胜利标志并继续处理。实践循环仅忽略该事件，不在 LP 归零、抽空卡组或特殊胜利时销毁 duel。Core、Lua、`DUEL_TEST_MODE` 和其他游戏约束保持原样。
- `src/replay/runtime.ts` 提供公共资源加载器。`loadReplayRuntime` 只加载/校验 JS 与 WASM，不创建 duel、不加载 cards/Lua；`loadReplayResource` 保留清单长度、流式上限、SHA-256、坏缓存移除与可选缓存保护。录像与实践分别组合所需资源。
- 音效直接读取共享 `settingStore.audio.enableSoundEffects`、`soundEffectsVolume`，使用独立 ReplayAudio 实例；关闭、退出、切后台立即停止该实例的声音。

修改请求解析、响应编码、初始化规则或资源边界时，更新本文对应契约并运行能区分错误行为的真实 Core 回归；只更新受影响的架构、入口与验收文档，不重复追加历史过程。

## 验证

在项目目录运行：

```text
node scripts/test_practice_runtime_loader.mjs
node scripts/test_practice_runtime.mjs
node scripts/test_practice_prompts.mjs
npm run test:replay-runtime
SMOKE_URL=http://127.0.0.1:4173 node scripts/practice_ui.mjs
SMOKE_URL=http://127.0.0.1:4173 node scripts/practice_editor_roundtrip_ui.mjs
```

最后一项需要已启动的静态预览；PowerShell 使用 `$env:SMOKE_URL='http://127.0.0.1:4173'` 后单独运行 Node 命令。

当前本地验证覆盖：真实旧 Core MR2 首回合 A 抽第 6 张牌、不同双卡组、双方实际操作、A 回合 B 手牌效果连锁归属、错误玩家/过期请求拒绝、同种子重开、LP0/特殊胜利/抽空后继续到后续回合。固定测试协程实际发出并成功消费效果确认、是否、选项、卡片、选中/取消选中、两种等级合计、表示形式、种族/属性/卡名/数字宣言、区域、排序、祭品、指示物分配请求。

静态浏览器回归覆盖 1280×800、390×844、320×640、844×390，包含真实 Worker、双方召唤、连锁、精确重试、新种子、旧 Worker 回包隔离、退出终止与零 WSS；触屏还断言新请求的操作方标题可见。组卡往返回归确认未保存名称、卡片顺序、忽略禁表模式与已修改标记保留，已保存卡组不被覆盖。截图位于本地忽略目录 `.audit-tmp/practice-ui/`。四份现有原生录像回归保持通过。上述结果属于本地软件验证，尚不等于真实手机、长时间实战或正式环境验收。
