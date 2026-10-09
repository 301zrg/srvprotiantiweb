# 官网录像接收契约 v1

入口可附加 `lang=zh|en|ja|ko`，用于界面、卡文和系统字符串；在接收参数清理前初始化，规则见 [语言入口](language-links.md)。

更新：2026-10-08。用户追加授权官网 HTML 后实现本入口。仅用于公开 `.yrp` 原件；保存进本地库，兼容时自动进入播放页，不进房、不连 WSS、不上传录像。播放范围及旧裁定证据见 [使用说明](replay-usage.md)，官网部署见 [官网说明](../../srvprotianti/plugins/ladder-web/REPLAY_WEB_OPEN.md)。

## 小文件公开内容链接

```text
<完整静态入口>#/replay-import?v=1&kind=replay&format=yrp-base64url&file=<文件名>&data=<原件base64url>
```

原件最多 24 KiB，完整地址最多 34 KiB；无 padding 的 Base64url。官网同源读完后同标签页跳转；接收器在资源加载前取得内容并 `history.replaceState` 清除参数。Hash 不传给静态服务器，但内容短暂进入地址，因此仅用于公开录像。文件名为不含路径/控制字符的 `.yrp` basename、最多 240 字符；本地库生成安全标题/下载名。参数不能提供任意 URL、脚本或 Core 配置。

## 大文件受限消息交接

```text
<完整静态入口>#/replay-import?v=1&kind=replay&bridge=1&origin=<官网精确origin>&request=<随机标识>
ready:   {channel:'srvprotiantiweb:replay-import', version:1, kind:'replay', request, type:'ready'}
payload: {channel, version:1, kind:'replay', request, type:'payload', format:'yrp', filename, bytes:ArrayBuffer}
result:  {channel, version:1, kind:'replay', request, type:'result', status}
```

状态为 `received|saved|memory-only|failed|cancelled`；`received` 仅确认轻量接收器已持有校验后的文件，`saved` 才确认本地事务成功，都不代表播放成功。原件最多 8 MiB。接收器等待 45 秒，ready 每秒重试；合法文件到达后停止接收计时，资源/保存继续。官网读取等 45 秒，传递等 60 秒；文件已读取后的第二次点击才同步创建新页。

双方匹配精确 origin、窗口引用、request、channel、版本和 kind，指定精确 targetOrigin。白名单复用运营配置 `deckImportOrigins`，默认 `http://121.4.34.71:7922`、`https://duel.ygomatch.xyz`；仅运营配置可调整，链接不可扩大。重复 ready/payload 不重复导入，原件 SHA 去重由本地库完成。结束后释放监听、计时器、opener 和输入缓冲区；离开接收页不会异步拉回播放器。

较大文件仍可能受手机后台暂停、COOP 或平台窗口边界影响，失败保留下载/本地导入。本轮无需新增 Nginx 代理。以后若增加公开 HTTPS 文件入口，仍应用固定来源标识与 basename，不能开放任意 `url=` 抓取。

## 保存和播放状态

坏 magic、非法头、异常压缩参数、超限或路径文件名拒绝接收；压缩体/响应错误在播放时停止并保留原件。不兼容的可辨识 YRP1/Tag 等保存后返回录像库并提示，仍允许下载。配额不足复用有界内存回退，提示立即备份。

部署顺序为「先发布接收器，再上传官网 HTML」。卡组仍使用 `/import` 与独立 deck channel。跨项目测试结果记录于官网部署说明，不能将代码存在当成正式部署/真机通过。
