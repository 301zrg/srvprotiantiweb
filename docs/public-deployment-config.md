# 网页发布与服务器迁址的公开配置

这份配置只包含公开地址和精确来源白名单。不会携带玩家身份、密码、服务器数据库连接、隧道 Token 或私钥。Cloudflare 自动构建、普通手工 ZIP 和 BiliToy ZIP 均使用 [同一个校验器](../scripts/public_operator_config.mjs)，在开始构建／复制发布目录前检查输入；校验失败返回非零退出码。

## 输入及缺省行为

| 环境变量 | Python 打包参数 | 发布字段 | 缺省行为 |
| --- | --- | --- | --- |
| `VITE_DUEL_WS_URL` | `--wss-url` | `duelWebSocketUrl` | Cloudflare 必须设置；手工包未设置或显式空字符串时禁用在线入场 |
| `VITE_DECK_IMPORT_ORIGINS` | `--deck-import-origins` | `deckImportOrigins` | 未设置则不写此字段，沿用原有 `http://121.4.34.71:7922`、`https://duel.ygomatch.xyz`；`[]` 显式禁用卡组及录像消息交接 |
| `VITE_WEBSITE_BASE_URL` | `--website-base-url` | `websiteBaseUrl` | 未设置沿用首页官网链接 `http://121.4.34.71:7922/` |

Python 参数优先于同名环境变量。白名单输入为 JSON 数组字符串，每项必须是 `http://` 或 `https://` 的精确 origin，不能含路径、尾部 `/`、通配符、凭据、查询或 fragment。大小写、默认端口等必须已规范化为浏览器实际 `location.origin`；例如 `https://ladder.example.com`，不是 `https://LADDER.example.com:443/`。空字符串、`null`、对象和非字符串成员都会使发布失败，防止误写时默默恢复旧白名单。

WSS 必须为完整 `wss://主机/neos` 一类地址，不允许凭据、查询、fragment、反斜杠或内部空白。官网链接允许 HTTP／HTTPS 路径，例如 `https://ladder.example.com/ladder/`，不允许凭据、查询或 fragment。官网链接与消息白名单独立：改变链接不会自动授权新官网来源。

## Cloudflare 自动部署

在当前 Worker 的公开构建变量中设置，例如：

```text
VITE_DUEL_WS_URL=wss://game.example.com/neos
VITE_DECK_IMPORT_ORIGINS=["https://ladder.example.com"]
VITE_WEBSITE_BASE_URL=https://ladder.example.com/
```

沿用 [自动部署](cloudflare-ci.md) 的 `npm ci --include=dev && npm run build:cloudflare`。不要把 JSON 再包成 JSON 字符串，Cloudflare 值应以 `[` 开始。构建将三项一同写入 `dist/duel-config.js`，并在 `deployment-info.json` 记录，后续自动构建不会只留下 WSS 而丢掉本次明确设置的来源白名单。变量必须保留在后续构建设置中；直接修改上一次构建的 `dist` 不会改变下一次构建输入。

## 手工发布

普通静态包先构建 `dist`，再打包。Linux shell 示例：

```bash
npm run build:static
python scripts/package_test_release.py \
  --wss-url wss://game.example.com/neos \
  --deck-import-origins '["https://ladder.example.com"]' \
  --website-base-url https://ladder.example.com/ \
  --site-origin https://ocg1103nexus.com
```

`--site-origin` 指网页版自己的来源，用于 Windows 测试套件的 Nginx 示例；它不会自动写进官网消息白名单，也不会改变网站的域名。Linux 正式代理配置见统一运维指南。Python 两种包均支持同一组公开参数；BiliToy 使用 `python scripts/package_bilitoy_release.py`，它自行构建新目录，不需要提前覆盖普通 `dist`。

Windows PowerShell 可使用环境变量，避免旧版 PowerShell 将命令行 JSON 的双引号移除：

```powershell
$env:VITE_DUEL_WS_URL = 'wss://game.example.com/neos'
$env:VITE_DECK_IMPORT_ORIGINS = '["https://ladder.example.com"]'
$env:VITE_WEBSITE_BASE_URL = 'https://ladder.example.com/'
npm run build:static
python scripts/package_test_release.py --site-origin https://ocg1103nexus.com
# 或专用平台包：
python scripts/package_bilitoy_release.py
```

需要离线包时，显式 `--wss-url ''` 覆盖仍存在的环境变量；也可先清除 `VITE_DUEL_WS_URL`。要禁用消息交接设置 `VITE_DECK_IMPORT_ORIGINS=[]`，不要把变量改成空字符串。

## 不重新构建时

发布站点加载外部 `duel-config.js`，运营者也可编辑它。当前站点示例：

```js
window.__SRVPRO_DUEL_CONFIG__ = {
  duelWebSocketUrl: "wss://game.example.com/neos",
  deckImportOrigins: ["https://ladder.example.com"],
  websiteBaseUrl: "https://ladder.example.com/",
};
```

此方法必须保留其余需要的字段。自动或手工发布脚本会按本次输入重新生成该文件；长期使用应将同样值保存到构建变量或部署命令。`public/duel-config.js` 保持空默认配置，注释中的示例不会自行生效。浏览器会忽略不合法的白名单成员，并对非法官网链接使用原官网链接；构建校验能更早拒绝误配置。

## 迁址检查顺序

1. 尽量保留网页版原 HTTPS origin。只换 WSS／官网地址不改变网页 IndexedDB 中的卡组和录像；换网页版 origin 后，旧数据不会自动出现在新站点，先导出 YDK 和原录像。
2. 在服务端 Nginx WSS 网关允许网页版的精确 origin，保留其默认拒绝规则；这里的白名单与 `deckImportOrigins` 用途不同，不能互相替代。
3. 官网地址变化时更新 `websiteBaseUrl`，将真实官网 origin 明确加入 `deckImportOrigins`，并核对官网指向网页版的卡组／录像按钮配置。
4. 发布后直接查看 `/duel-config.js` 和 `/deployment-info.json`，核对三项值及源码提交；刷新首页检查官网链接，分别测试公开内容链接及需要原网页权限验证的消息交接。
5. 实测 WSS 握手、普通房与 TT 入场。构建成功不证明代理、服务器、平台 Origin 或正式对局已通过。

`npm run test:public-config` 覆盖公开输入、空白名单、错误配置拒绝、Python／Node 一致性和官网链接回退；`npm run build:static` 验证完整静态资源构建。验收证据以实际执行记录为准，不将本地结果标成生产部署成功。
