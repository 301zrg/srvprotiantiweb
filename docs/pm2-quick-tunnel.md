# 用 PM2 在 Windows 后台运行 Neos 临时隧道

本方案替代必须保留终端的 `Start-NeosQuickTunnel.ps1`。新增 Node 启动器由 PM2 管理，可以在启动完成后关闭 PowerShell；Nginx 继续通过本机 7978 转发到 Neos 7977。启动器没有 npm 运行依赖，不读取天梯私密配置，不安装 Windows 系统服务。

PM2 的 Windows 停止操作使用 `shutdown_with_message`，启动器接收 `shutdown` 后终止自己创建的 cloudflared，并清理当前地址；fork 模式只运行一份，关闭 watch，避免写日志或配置引起重启。[PM2 Windows 停止说明](https://pm2.keymetrics.io/docs/usage/signals-clean-restart/)、[Ecosystem 配置](https://pm2.keymetrics.io/docs/usage/application-declaration/)

## 文件与前提

服务器已有 Node.js、PM2、Nginx 和已校验的 `cloudflared.exe`。本地实际测试版本为 Node.js 24.15.0、PM2 7.0.4、Windows PowerShell 5.1；PM2 7.0.4 要求 Node.js 18 或以上。已有 PM2 无需为本步骤直接升级；版本不同也需在服务器确认启动、停止和子进程清理。

将下面两个文件复制到服务器原来的 `C:\nginx\neos-test`，与 `cloudflared.exe` 同目录：

- `neos-quick-tunnel.cjs`
- `ecosystem.neos.config.js`

新版 `pm2-tunnel-kit.zip` 只含这两个启动文件、本说明 `PM2_TUNNEL.md` 和许可证，可以直接解压到原来的 `C:\nginx\neos-test`，使用已经下载的 `cloudflared.exe`。完整 `windows-server-kit.zip` 也包含它们；使用完整包时先解压到临时目录，再复制这两个新增文件，继续使用服务器现有 Nginx 配置和已校验的二进制。

使用管理现有服务器 PM2 的同一个 Windows 账号和 `PM2_HOME`，让进程加入同一管理环境。下面使用 `pm2.cmd` 避开 PowerShell 对 npm 生成的 `.ps1` 入口的执行策略限制；当前 `pm2` 已可正常使用时也可继续用原命令。先核对：

```powershell
Set-Location C:\nginx\neos-test
node --version
pm2.cmd list
$gatewayReady = Test-NetConnection 127.0.0.1 -Port 7978 -InformationLevel Quiet
[Console]::WriteLine("7978 TCP: $gatewayReady")
```

7978 应为 `True`。如果尚未安装 PM2，再执行 `npm.cmd install -g pm2@7.0.4`；已在管理天梯服务的机器直接使用现有 PM2。

## 启动与迁移

可以先保留旧 PowerShell 隧道，让 PM2 新建一个独立临时入口。两者只转发同一个 Nginx 网关；网页版仍使用已部署的旧地址，直至运营者更新配置。

```powershell
Set-Location C:\nginx\neos-test
pm2.cmd start .\ecosystem.neos.config.js --only neos-quick-tunnel
pm2.cmd logs neos-quick-tunnel --lines 30 --nostream
Get-Content .\runtime\pm2-quick\status.json
Get-Content .\runtime\pm2-quick\endpoint.txt
```

只有 `status.json` 为 `ready` 且日志打印 `Neos test endpoint: wss://.../neos` 后才取用地址。`ready` 表示收到 cloudflared 首次注册成功日志，不等于完整比赛已验收，也不能证明之后每一刻公网连接仍可用。程序先等 Nginx 最长 30 秒，再等隧道注册最长 90 秒；失败退出后 PM2 按配置延迟 5 秒重试，连续 10 次不稳定退出后进入 errored，需要检查日志和网络再重启。

新地址确定后：

1. 将 `runtime\pm2-quick\duel-config.js` 下载到开发机，替换本机完整网页发布目录中的同名文件，再将整套静态资源重新上传到现有 Workers；或用新 WSS 重新执行原来的 `npm run package:test`，再上传生成的完整 `web-pages.zip`。只改连接配置时无需重建前端。
2. 刷新网页，确认公开 `duel-config.js` 中为新地址，验证一次联机。也可在开发机执行 `npm run check:wss -- wss://新地址/neos --origin https://black-surf-69e5.1627406938.workers.dev` 检查可信 TLS／101。
3. 等仍在旧入口的比赛结束后，在旧 PowerShell 窗口按 Ctrl+C 停止旧隧道。这个操作不会停止 PM2 新启动的隧道。
4. 保存 PM2 清单：

   ```powershell
   pm2.cmd save
   ```

之后可以关闭执行 `pm2 start` 的 PowerShell 窗口，PM2 守护进程继续管理隧道。迁移只涉及隧道和网页连接地址，不需要重启 SRVPro 或 Nginx。

## 日常操作

```powershell
pm2.cmd list
pm2.cmd logs neos-quick-tunnel --lines 50 --nostream
pm2.cmd restart neos-quick-tunnel
pm2.cmd stop neos-quick-tunnel
pm2.cmd delete neos-quick-tunnel
```

这些带名称的命令只操作隧道进程。停止会结束该启动器创建的 cloudflared；异常退出也会清理地址，再由 PM2 重启。重启／新建 Quick Tunnel 会产生新域名，必须再次更新 Workers 的 `duel-config.js`；PM2 自动重启不会自动登录 Cloudflare 并发布网站。[Quick Tunnel 的地址与可用性限制](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

状态与最新地址集中在固定目录 `runtime\pm2-quick`：

| 文件 | 用途 |
| --- | --- |
| `status.json` | starting／ready／stopping／stopped／failed、PID、时间、失败原因；非 ready 时 endpoint 为 null |
| `endpoint.txt` | 当前已注册的 WSS，启动和停止时清除，避免误取旧地址 |
| `duel-config.js` | 可用于更新静态站点的公开连接配置，同样仅在 ready 时生成 |
| `owner.json` | 防止同一运行目录启动重复进程；记录自己的 wrapper／cloudflared PID |
| `quick-tunnel.yml` | 专用公开配置，避免读取账号已有的命名隧道配置 |

cloudflared 的输出直接进入 PM2 日志。运行数据保留在 `runtime`，不加入 Git 或工具包。日志轮转沿用服务器现有 PM2 运维配置。

## 自定义配置与恢复

配置文件中的默认网关为 7978、传输协议为 auto。可通过进程环境配置以下值，或者在 `ecosystem.neos.config.js` 中明确修改后从配置文件重启：

| 环境变量 | 默认 |
| --- | --- |
| `NEOS_CLOUDFLARED_PATH` | 配置文件同目录的 `cloudflared.exe` |
| `NEOS_TUNNEL_RUNTIME_DIR` | 配置文件同目录的 `runtime\pm2-quick` |
| `NEOS_GATEWAY_PORT` | 7978 |
| `NEOS_TUNNEL_PROTOCOL` | auto；也支持 http2／quic |
| `NEOS_TUNNEL_GATEWAY_WAIT_MS` | 30000 |
| `NEOS_TUNNEL_START_TIMEOUT_MS` | 90000 |

例如确认网络要求 http2 后：

```powershell
$env:NEOS_TUNNEL_PROTOCOL = 'http2'
pm2.cmd restart .\ecosystem.neos.config.js --only neos-quick-tunnel --update-env
pm2.cmd save
```

启动器会拒绝无效端口、无效协议、缺失二进制，以及仍有存活 PID 的 ownership 记录。遇到 owner 错误，先读取 `owner.json` 并核对对应进程；不会仅凭记录中的 PID 强行终止一个现存进程。确认旧 wrapper 和子进程均已退出后，启动器会自动回收遗留记录。若收到 `errored`，修复原因后用 `pm2 restart neos-quick-tunnel` 重新尝试。

`pm2 save` 保存进程清单，**不单独完成 Windows 开机启动**。若服务器现有 Windows 服务／计划任务会用同一账号与 `PM2_HOME` 执行 `pm2 resurrect`，保存后新隧道可由那套机制恢复；尚未配置时应另外设置 Windows 启动机制。关闭普通 PowerShell、Windows 注销和整机重启是不同情形，本次不把未配置的注销／重启恢复标成通过。[PM2 清单保存与 Windows 启动说明](https://pm2.keymetrics.io/docs/usage/startup/)

## 回归

开发机先准备隔离的 PM2，再运行：

```powershell
npm install --prefix .audit-tmp\pm2-tool --no-save --package-lock=false --ignore-scripts pm2@7.0.4
npm run test:pm2-tunnel
```

也可用 `PM2_TEST_BIN` 指定已安装 PM2 的 `bin/pm2` 脚本，测试仍使用独立 `PM2_HOME`。测试使用离线模拟 cloudflared：真实 PM2 CLI 返回后进程继续运行、子进程崩溃后自动恢复、最新地址重新生成、stop／delete 的 IPC 与子进程清理、重复进程拒绝、缺失网关、注册超时、路径含空格和不同工作目录、`pm2 save`。不连接正式服务器，不创建公网隧道；正式服务器接管后的外网握手和关窗口联机仍需操作时确认。

2026-10-07 上述离线回归通过，并验证 wrapper 已退出但子进程仍存活时拒绝启动第二份，以及无效 ownership 记录不会被自动覆盖。打包后还核对两个 Node 文件、说明与许可证和源文件一致，工具包不含运行数据或私密配置。
