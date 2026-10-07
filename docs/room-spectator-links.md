# 房间列表跳转网页版观战

更新：2026-10-07。此改动只在 `srvprotiantiweb` 接收参数；房间列表的 HTML 暂未修改。

## 链接约定

推荐链接：

```text
https://black-surf-69e5.1627406938.workers.dev/#/match?room=M%23TT%2CRANDOM%2312345&spectate=1
```

| 参数 | 含义 |
| --- | --- |
| `room` | 列表中该房间的实际 `roomname`，按原样编码；不是 `roomid`、玩家名或 `TT` 匹配命令 |
| `spectate=1` | 资源就绪后自动连接，并申请观战；等待服务器确认观战身份后进入房间 |
| `nickname` | 可选的公开观战昵称；不传时使用 `observer from web`（17 个 UTF-16 字符） |

只传 `room` 或设置 `spectate=0` 会预填联机表单，等待用户点击连接；不会自动入场。也支持 `https://站点/?room=...&spectate=1`，启动时转为 Hash 路由并移除外层这三个参数。子目录或 BiliToy 的 `index.html` 路径保留不变。已明确打开组卡、决斗等其他 Hash 路由时，外层参数不会强行覆盖；同时提供外层和 Hash 参数时，以 Hash 中已有的同名字段为准。

房名与昵称不得超过 19 个 UTF-16 字符；不静默截断。账号密码、`昵称$密码`、`房名$房间密码` 不应出现在 URL，这类链接会阻止自动入场。密码房可使用仅含公开房名的预填链接，让玩家自行补充房间密码并手动连接。

`observer from website` 有 21 个字符，超过协议上限，所以默认使用 `observer from web`。可选昵称只提供公开显示，不代表账号认证。

## 之后改 srvprotianti 的房间列表

使用 `URLSearchParams` 编码，不直接拼接房名。房名可能包含 `#`、中文、空格、`+`、`&`、`?`，未经编码会导致跳错房间。

```js
// room 为 /api/public/rooms 返回的一项。
function makeSpectatorLink(room) {
  const client = new URL('https://black-surf-69e5.1627406938.workers.dev/');
  const params = new URLSearchParams({
    room: room.roomname,
    spectate: '1',
    // nickname: '网页观众', // 可选；省略使用默认昵称。
  });
  client.hash = '/match?' + params.toString();
  return client.href;
}

// 在现有列表渲染函数中使用真实 DOM 属性，房名按文本插入。
const link = document.createElement('a');
link.textContent = room.roomname;
link.href = makeSpectatorLink(room);
link.target = '_blank';
link.rel = 'noopener noreferrer';
```

如果之后改用另一静态站点，只改 `client` 的固定 URL。不要在链接里传游戏 IP、端口或 WSS；网页版仍使用站方 `duel-config.js` 中的固定对战入口。新静态站点的 Origin 是否被网关允许属于原有部署要求，增加查询参数本身不需要修改 Nginx、证书或重启游戏服务器。

建议列表仅给已经开始且允许观战的房间提供“一键观战”。`needpass` 为 `true` 的房间不要把密码补入公开链接；提供预填入口或保留原处理。

## 身份和退出行为

- 观战链接使用专门的临时昵称，既不替换持久保存的玩家昵称，也不覆盖当前标签页内的普通联机表单草稿。
- 自动连接只执行一次；失败后保留房间和昵称，玩家可以手动重试。切换语言、编辑输入或返回联机页不会自动重试。
- `PLAYER_INFO`、`JOIN_GAME` 的顺序保持不变；收到服务器 `STOC_JOIN_GAME` 后才发送一次 `HS_TOOBSERVER`，避免宿主异步查房时丢掉提前发送的申请。
- 普通等待房在确认观战席位后显示观战等待页，不上传卡组、不准备、不启动对局。服务器确认失败时关闭本次连接并给出提示。
- 已开局房由服务器提供观战历史；观战仍可以切换视角和退出。入场后替换带参数的历史记录，退出回到普通联机页，避免浏览器返回或刷新再次自动入场。
- 重置房间时将旧 `selfType` 清为 `UNKNOWN`，不会用上一会话的观战身份提前放行。

## 服务端边界

只读核查当前本地 `srvprotianti`：普通房的 `Room.join_player()` 对开局后的请求调用 `join_post_watch()`；后者要求 `modules.cloud_replay.enable_halfway_watch` 开启、房间允许观战且未结束。`ladder-core` 的 `resolve_room_join` 已将具体 TT 房名设为观战入口：等待中的天梯房拒绝直接加入，开始后走中途观战，不通过此链接指定天梯对手。

因此必须传列表里的具体房名，例如 `M#TT,RANDOM#12345`，不能传 `TT`。网页版也阻止常见的随机匹配／录像／AI 命令用于自动观战；最终权限与是否允许观战仍由服务器判断。

目前原生入房协议只有“按名称查找或创建”，没有“仅加入仍存在的房间”标志。如果列表已经过期或房间在点击后结束，普通房名可能新建空房；客户端不上传卡组、不准备。仅改静态页无法消除这种服务端时序问题，后续修改宿主时可增加仅加入既存房间的契约。此版不请求服务器 HTTP 列表来校验，避免让 HTTPS 静态页依赖 HTTP API 或额外 CORS。

## 验证

`npm run test:room-links` 使用本地浏览器和原生协议模拟，检查桌面／390px 触屏的 Hash 与外层查询链接、特殊字符房名、默认／自定义昵称、等待观战确认、已开局观战、退出不重入、原昵称保留、参数错误与密码链接拒绝。`node scripts/room_link_ui.mjs --built` 验证实际 `dist` 构建。

`npm run test:room-links:local` 已在隔离 SRVPro 和真实 Core 上通过普通等待房、普通已开局房、具体 TT 已开局房的链接观战、视角切换和主动退出；观战连接没有上传卡组、准备或启动对局。原有普通房重新入场及 TT G1–G3／两次换备也通过回归。隔离实例显式启用中途观战和公开列表，不读取正式部署配置；正式服及真机权限与中途观战配置仍需复测。

上线时先更新静态网页包，再改房间列表的链接。复测：普通已开局房、具体 TT 房、禁止观战房、已经结束的房、手机视角切换，以及退出后正常昵称是否保留。
