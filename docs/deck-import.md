# 官网卡组接收入口

入口可附加 `lang=zh|en|ja|ko`，用于界面、卡文和系统字符串；在接收参数清理前初始化，规则见 [语言入口](language-links.md)。

实现日期：2026-10-08。网页版已支持接收 YDK、原生 `UPDATE_DECK` buffer 和 `{main, extra, side}` 结构，保存后直接进入卡组编辑器。此功能不连接对战 WSS，不上传卡组，不需要录像 Core。本次未修改 `srvprotianti` 的 HTML、下载接口或正式部署；官网按钮另行施工，录像仍按 [第二期计划](replay-phase2-plan.md) 等待开工。

## 1. 公开卡组：内容链接

链接保留网页版的完整入口路径，只替换 hash：

```text
<入口>#/import?v=1&kind=deck&format=ydk-utf8-base64url&data=<编码内容>&title=<可选标题>
<入口>#/import?v=1&kind=deck&format=ygopro-update-deck-base64url&data=<编码内容>&title=<可选标题>
<入口>#/import?v=1&kind=deck&format=deck-json-base64url&data=<编码内容>&title=<可选标题>
```

| format | 编码前的内容 |
| --- | --- |
| `ydk-utf8-base64url` | YDK 文本的 UTF-8 字节；支持 BOM、CRLF、注释和 main／extra／side 区块 |
| `ygopro-update-deck-base64url` | 原生 `CTOS_UPDATE_DECK` payload 字节，不含外层封包长度和协议号 |
| `deck-json-base64url` | `JSON.stringify({main: [...], extra: [...], side: [...]})` 的 UTF-8 字节；三个数组都必须存在 |

`data` 使用不带 `=` 的 Base64url：将普通 Base64 的 `+`、`/` 换成 `-`、`_`，去掉末尾填充。标题通过 `URLSearchParams` 编码，不手工拼接。公开链接构造函数在 [deckImport.ts](../src/variant/deckImport.ts) 的 `createDeckImportUrl()`；后续官网共用辅助脚本应遵循同一契约。

完整 URL 最长 4 KiB。链接只用于已经公开的卡组，因为内容可以被复制，也可能留在浏览历史。入口在资源加载前读取内容并移除 hash 中的参数；导入完成后地址成为 `#/build`。不支持 `url=` 抓取任意远程文件，也不接收密码、玩家身份或自动入房参数。

官网的 HTTP 页面先通过原有同源接口取得卡组，再生成内容链接。HTTPS 网页版无需回读 HTTP 官网，也无需修改现有 Nginx `/neos` 代理。手机可采用同标签页跳转；异步读取完成后再 `window.open()` 可能被弹窗限制拦截。

## 2. 需要原网页验证权限的卡组：消息交接

原网页调用现有权限接口，只传验证通过的卡组内容，不把账号密码放进链接或发给网页版。入口为：

```text
<入口>#/import?v=1&kind=deck&bridge=1&origin=<原网页的精确 origin>&request=<随机标识>
```

`request` 为 16–64 个字符的 Base64url 标识。接收端同时检查来源白名单、`event.origin`、`event.source === window.opener`、请求标识、协议版本和消息类型。URL 中的 `origin` 无法自行增加权限。

默认允许 `http://121.4.34.71:7922` 和 `https://duel.ygomatch.xyz`。运营者可在公开的 `duel-config.js` 中设置 `deckImportOrigins` 数组覆盖默认值；每项必须是精确 origin，不能带路径、尾部 `/` 或通配符。空数组禁用消息交接，不影响公开内容链接。例如：

```js
window.__SRVPRO_DUEL_CONFIG__ = {
  duelWebSocketUrl: "wss://实际隧道域名/neos",
  deckImportOrigins: ["http://121.4.34.71:7922"],
};
```

所有消息的共同字段：

```js
{ channel: "srvprotiantiweb:deck-import", version: 1,
  kind: "deck", request: "本次随机标识", type: "消息类型" }
```

| 方向与 type | 额外字段／含义 |
| --- | --- |
| 网页版 → 官网，`ready` | 接收监听已就绪；即使卡库仍在加载，也可发送内容。每秒重试，收到有效内容后停止 |
| 官网 → 网页版，`payload` | `format: "ydk", text: "...", title: "..."`；或者 `format: "ygopro-update-deck", bytes: ArrayBuffer, title`；或者 `format: "deck-json", deck: {main, extra, side}, title` |
| 网页版 → 官网，`result` | `status: "received"` 表示已接收，尚未确认落盘；`"imported"` 表示导入或复用持久化卡组；`"memory-only"` 表示仅临时编辑；`"failed"`／`"cancelled"` 表示失败／取消 |

原页应先注册监听，再在用户点击中同步打开标签页；不能使用 `noopener`／`noreferrer`，否则无法交接。发送时必须指定网页版的精确 origin，不使用 `*`。同一请求只接收第一份 payload，结束后移除监听并解除 opener。30 秒未收到有效内容会显示超时，玩家可返回编辑器并改用文件导入。

下面是官网一侧的调用骨架，`getAuthorizedDeck()` 代表调用原接口并返回已分区结构。实际按钮、四语提示、取消和弹窗错误处理留给下一次官网施工：

```js
function openAuthorizedDeck(clientEntry, getAuthorizedDeck, title) {
  const request = Array.from(crypto.getRandomValues(new Uint8Array(16)),
    n => n.toString(16).padStart(2, "0")).join("");
  const url = new URL(clientEntry);
  const targetOrigin = url.origin;
  url.hash = "/import?" + new URLSearchParams({
    v: "1", kind: "deck", bridge: "1", origin: location.origin, request,
  });
  let peer, ready = false, sent = false;
  const envelope = { channel: "srvprotiantiweb:deck-import",
    version: 1, kind: "deck", request };
  const content = getAuthorizedDeck();
  const cleanup = () => { removeEventListener("message", receive); clearTimeout(timer); };
  async function send() {
    if (!ready || sent) return;
    sent = true;
    try {
      const deck = await content;
      peer.postMessage({ ...envelope, type: "payload", format: "deck-json", deck, title }, targetOrigin);
    } catch (error) { cleanup(); /* 显示原接口的失败状态，保留下载入口 */ }
  }
  function receive(event) {
    const data = event.data;
    if (event.origin !== targetOrigin || event.source !== peer || !data ||
        data.channel !== envelope.channel || data.version !== 1 ||
        data.kind !== "deck" || data.request !== request) return;
    if (data.type === "ready") { ready = true; void send(); }
    if (data.type === "result" && data.status !== "received") {
      cleanup(); /* 按 imported／memory-only／failed／cancelled 显示结果 */
    }
  }
  addEventListener("message", receive);
  const timer = setTimeout(cleanup, 45000);
  peer = window.open(url.href, "_blank");
  if (!peer) { cleanup(); /* 显示弹窗被阻止，并保留原下载按钮 */ }
  content.catch(() => {}); // 原接口提前失败时避免未处理的 Promise
}
```

如果使用 YDK，发送 `format: "ydk", text`；原 buffer 发送 `format: "ygopro-update-deck", bytes`，其中 `bytes` 必须是 `ArrayBuffer`。使用 transfer list 时发送侧会失去 buffer，需保留副本以供重试。`COOP: same-origin`、平台 iframe 或浏览器后台暂停可能断开／延迟交接；公开内容优先使用链接，失败仍可下载后本地导入。iOS Safari 真机和 BiliToy 外壳尚待实测。

## 3. 解析、保存及编辑行为

- 单份内容不超过 64 KiB、卡号总数不超过 300。卡号必须是正 uint32；空卡组、坏编码、截断、尾随字节或错误计数会明确报错，不保存半份卡组。这是输入结构校验，不代替服务器禁表、40 张下限或参战合法性判断。
- 保留卡号顺序、重复张数和备牌。YDK／JSON 中分区明确的未知卡号保留并提示；不因缺卡或禁表删除卡号。
- buffer 的前两个 uint32LE 是主卡组与额外合并数、备牌数，后面是两区卡号。用当前卡库 type 区分融合／同调／超量等额外怪兽；备牌里的额外怪兽继续留在备牌。合并区有未知卡号时，先让玩家逐个确认放入主卡组还是额外，再保存；相同未知卡号的所有副本使用同一选择。
- 同名不同内容自动加 `(2)` 等后缀，不覆盖已有卡组。同内容、相同顺序和分区则复用已有卡组。名称分配与写入在同一 IndexedDB 事务内，两个标签页同时导入也不会互相覆盖。
- 只有事务提交成功才提示保存在本机。IDB 禁用或配额不足时打开临时卡组，常驻提示「尚未持久化」，可以编辑并下载当前草稿。临时内容不能承诺刷新后保留。
- 正常保存后刷新仍选中刚导入的卡组；编辑选择放在当前标签页的 sessionStorage，不改变其他标签页的对局／换备卡组。昵称、联机草稿及房间信息不随导入改变。
- 本地文件及粘贴 YDK 使用同一个解析／保存入口。缓存不可用时音频缓存跳过，不阻止页面启动和临时编辑。

官网 `replays.html` 目前仍把 deckbuffer 合并区全部写入 YDK 的 `#main`。后续按钮应发送原 buffer 或正确分区的 JSON，不复用该错误转换；旧下载转换问题归官网施工处理。本次接收器尊重已有 YDK 分区，不会猜测修正它。

## 4. 本地试用与验证

```powershell
Set-Location F:\MyCardLibrary\srvpro\srvprotiantiweb
npm run dev
```

打开 Vite 输出的地址，在浏览器控制台执行下列公开样本链接；会进入编辑器，主卡组为两张青眼白龙，额外含融合／同调／超量，备牌里的同调留在备牌：

```js
const deck = { main: [89631139, 89631139],
  extra: [23995346, 44508094, 84013237], side: [44508094, 89631139] };
const bytes = new TextEncoder().encode(JSON.stringify(deck));
const data = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
location.hash = "/import?" + new URLSearchParams({
  v: "1", kind: "deck", format: "deck-json-base64url", data, title: "公开接收样本",
});
```

测试命令：`npm run test:deck-import` 验证解析和 URL；`npm run test:deck-import-ui` 启动本地浏览器验证真实卡库、保存和编辑器。生产 HTTPS 版本可运行：

```powershell
npm run build
python scripts/make_local_cert.py .audit-tmp/deck-import-cert
node scripts/deck_import_ui.mjs --built --https
```

2026-10-08 验证通过：6 项解析测试、14 组生产 HTTPS 接收回归、类型检查、全量 lint 和构建；既有手机 UI 回归通过横屏、竖屏、小屏、桌面设置与缺卡图场景。

UI 回归使用合成卡组、本机 HTTP 来源、本机 HTTPS 客户端和无头 Edge，保留默认弹窗限制，拦截外网资源，并确认没有对战 WSS 连接。覆盖桌面／390px 触控视口三格式、刷新、同名／同内容、未知分区、320px 分区控件边界、坏 buffer、双标签页竞争、消息来源拒绝／请求标识／重复发送、IDB 禁用／写入失败、临时草稿下载。HTTPS 测试只对本机临时证书忽略错误，不改变发布包证书要求；该验证不等同于 iOS Safari、正式服或 BiliToy 平台实测。
