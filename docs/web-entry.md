# 官网页面快捷入口（v1）

本轮只准备 srvprotiantiweb 接收端并发布 `https://test.ocg1103nexus.com/`。正式地址 `https://ocg1103nexus.com/` 须待功能合入正式版后使用；发送端 HTML/JS 按下文接入，无需新增后端。卡组／录像文件交接继续使用独立的 [卡组接收](deck-import.md)、[录像接收](replay-import.md) 协议。

## 公开参数

| intent | 行为 | 测试链接 |
| --- | --- | --- |
| regular | 普通联机表单，不自动入房 | `https://test.ocg1103nexus.com/?intent=regular&lang=zh` |
| ladder | 预填 TT；已有有效昵称时自动连接一次，否则手动填写 | `https://test.ocg1103nexus.com/?intent=ladder&lang=zh` |
| deck-editor | 现有卡组列表／编辑器 | `https://test.ocg1103nexus.com/?intent=deck-editor&lang=zh` |
| replay-list | 现有录像列表 | `https://test.ocg1103nexus.com/?intent=replay-list&lang=zh` |
| spectate | 按实际房间名观战 | `https://test.ocg1103nexus.com/?intent=spectate&room=ExampleRoom&lang=zh` |

也支持 `#/entry?v=1&intent=...`；v 缺省为 1，仅支持 1。四语参数沿用 [语言入口](language-links.md)。可选 room 用于普通联机或观战，按原样 URL 编码，最多 19 个 UTF-16 码元，不得在公开链接携带 `$` 后的房间密码；需要密码时手动补入表单。spectate 拒绝 TT 等模式命令。`autojoin=0` 使 ladder/spectate 停在表单；regular 即使传入 1 也不自动连接。

相同入口字段重复或同时出现在 query/hash 会拒绝。外层 intent 不覆盖已有明确的 `#/replays` 等路由，部署子目录与 index.html 保留。入口不能指定 WSS、自动准备或自动开始比赛。卡组／录像仍属于当前 Origin 的本地库，不迁移其他域名、HTTP 或浏览器缓存。

资源加载前消费参数并将地址改为 `#/entry`。刷新这个中转地址不重做入口，应回原网页重新打开或进入手动联机页。成功入房替换中转地址，退出不会再次自动匹配／观战。

## 带账号交接

账号密码**不得放 query、hash、URL、回执或日志**。使用独立 postMessage 通道：

```text
https://test.ocg1103nexus.com/?lang=zh#/entry?v=1&intent=spectate&room=ExampleRoom&bridge=1&origin=<编码后的来源Origin>&request=<随机nonce>
```

- origin 必须精确匹配发送网页的协议、主机和端口，并位于运营配置 `deckImportOrigins`，与现有导入共用名单。缺省仅 `http://121.4.34.71:7922`、`https://duel.ygomatch.xyz`；更换官网来源时应先更新客户端公开配置，URL 不能扩大名单。
- request 为每次点击新生成的 16–64 位 base64url。须保留真实 opener，不能使用 noopener/noreferrer；COOP 同源隔离、弹窗拦截可能阻止交接。
- 通道 `srvprotiantiweb:entry`、version=1；双方校验精确 origin、窗口引用、request 和 intent。接收端立即发送 ready，每秒重发，等待 30 秒。第一份匹配载荷决定结果，不匹配消息忽略；匹配但内容错误则终止，离开／超时后忽略迟到消息。
- payload 可选 credentials={username,password}。两者均为非空字符串、不得含 `$`，合并后的 `username$password` 遵循既有昵称规则，总长最多 19 个 UTF-16 码元，不截断。密码鉴权仍由原生联机服务负责。
- result.status 为 accepted/failed/cancelled，不回传身份。accepted 只表示客户端已接收并验证格式，**不代表服务端登录成功或已入房**。结束后清理监听与定时器，断开 opener 引用。

发送端点击处理示例（clientBase 由网页公开配置选择测试版或正式版）：

```js
function openWebClient(clientBase, intent, {username, password, room, lang = "zh"} = {}) {
  const url = new URL(clientBase), targetOrigin = url.origin;
  const request = [...crypto.getRandomValues(new Uint8Array(16))]
    .map(n => n.toString(16).padStart(2, "0")).join("");
  const params = new URLSearchParams({v:"1", intent, bridge:"1", origin:location.origin, request});
  if (room) params.set("room", room); // 公开房名，不含房间密码。
  url.searchParams.set("lang", lang);
  url.hash = `/entry?${params}`;
  let child, sent = false, timer;
  const cleanup = () => {clearTimeout(timer); removeEventListener("message", receive);};
  function receive(event) {
    const data = event.data;
    if (event.origin !== targetOrigin || event.source !== child ||
        data?.channel !== "srvprotiantiweb:entry" || data.version !== 1 ||
        data.request !== request || data.intent !== intent) return;
    if (data.type === "ready" && !sent) {
      sent = true;
      child.postMessage({channel:data.channel, version:1, type:"payload", request, intent,
        ...(username !== undefined || password !== undefined ? {credentials:{username,password}} : {})
      }, targetOrigin); // 精确 targetOrigin，不能用 *。
    } else if (data.type === "result") cleanup();
  }
  addEventListener("message", receive); // 注册后，在同一次点击内同步打开窗口。
  child = window.open(url.href, "_blank");
  if (!child) {cleanup(); return false;}
  timer = setTimeout(cleanup, 45000);
  return true;
}
```

只需打开列表、不传账号时直接使用公开链接即可。当前未修改发送端 HTML。

## 账号与临时房间

- 匿名 spectate 使用 observer from web，不覆盖普通身份／房间草稿，退出恢复旧草稿；原 `#/match?room=...&spectate=1` 保持兼容，见 [房间链接](room-spectator-links.md)。
- 带账号 spectate 收到合法 credentials 后保存完整账号密码、清空普通房间号，实际观战房间只保存在本次入口。退出、刷新普通联机页、关闭后重开均保留身份，房间为空。
- 观战表单手动填写合法 `昵称$密码` 并连接，同样保留身份、清空房间；只填公开昵称仍按匿名临时流程恢复草稿。
- 其他 intent 接收账号时保留普通房间草稿。连接后的身份、房间与重连状态继续冻结，不受后续表单编辑影响。

## 验证边界

`node scripts/test_web_entry.mjs` 验证参数、来源／窗口／request／intent、重复／过期消息、缓存与取消。
`node scripts/web_entry_ui.mjs [--built]` 用两个本地来源、假账号、模拟 WebSocket 验证桌面和手机横竖屏的五个入口及观战身份保留；可设置 SMOKE_URL 验证已部署测试版（来源与 WSS 仅在该测试浏览器覆盖）。这不等于真实账号鉴权、天梯配对或真机验收。
