# 正式服 2011.3 禁表修正

2026-10-07：用户提供的 `lflist.conf` 已复现正式普通房的 hash `0x4250bce9`，原因是两个写错的卡号。本机已生成 `F:/MyCardLibrary/srvpro/lflist.fixed.conf`；原文件未改，正式服务器替换及新房间复验尚待服主执行。网页继续使用原有纯 2011.3 基线，无需改预期 hash 或关闭规则提示。

## 差异与修正

行号指用户提供的原文件。卡号／卡名依据项目已锁定的中文 1103 CDB；服务端解析与检查依据 `ygopro/gframe/deck_manager.cpp`。

| 原文件位置 | 原内容 | 修正 | 影响 |
| --- | --- | --- | --- |
| 第 57 行 | `26202165 1 --黒き森のウィッチ` | 注释改为 `クリッター`（三眼怪） | 卡号和限 1 原本正确；注释误写为黑森林的魔女，注释不影响规则或 hash。魔女的正确卡号 `78010363` 仍为禁卡。 |
| 第 90 行 | `26202465 1 --クリッター` | 删除此行 | 这是错拼的三眼怪卡号，锁定的 1103 CDB 无此 ID；保留第 57 行正确的三眼怪限 1。 |
| 第 102 行 | `72304203 1 --光の護封剣` | 改为 `72302403 1 --光の護封剣` | 恢复光之护封剑限 1。原文件没有列出正确卡号，按已审查 Core 的禁表检查逻辑不会执行该卡的限 1；这会造成实际规则差异。 |

修正版保留完整文件的 103 张表和原先顺序，只修改以上三行。其他 102 张表保持字节不变，没有删除现代表，也没有更换客户端卡池。

| 检查项 | 原文件 | 修正版 |
| --- | --- | --- |
| `!2011.3.1` 条目数 | 135 | 134 |
| 禁止／限制／准限 | 50／67／18 | 50／66／18 |
| 协议 hash | `0x4250bce9` | `0x73ec4051` |
| SHA256 | `2e5e0dba26bb74f5f713a32b32805ac82bcff19c13107eeb28ea58b858469376` | `c75a96b1bbe2ceb36db9a48e6b32ec01915bc8cfc36a9df812f4b0efac994338` |

修正后的全部 134 个卡号都存在于锁定的中文 CDB，卡号及允许数量与客户端基线逐条相同，无重复卡号。hash 按已审查的 Core 算法计算；该基线此前已在隔离真实 Core 房间中返回相同 hash。机器可读结果见 [审计记录](../deployment/banlists/server-201103-audit.json)。文件检查不能代替正式房间的 HostInfo 复验。

## 服务器替换步骤

1. 将 `lflist.fixed.conf` 和最新版 [Check-NeosBanlists.cjs](../deployment/windows/Check-NeosBanlists.cjs) 上传到服务器 `C:\nginx\neos-test`。先核对下载文件：

   ```powershell
   Set-Location C:\nginx\neos-test
   Get-FileHash -LiteralPath .\lflist.fixed.conf -Algorithm SHA256
   node .\Check-NeosBanlists.cjs --file .\lflist.fixed.conf
   ```

   SHA256 应与上表一致，`!2011.3.1` 应显示 `0x73ec4051`、`entries=134`、`counts=50/66/18`。

2. 用 `--server-root` 核对实际运行目录，找到产生原 hash 的文件，确认 2011.3 的加载位置。以下目录是占位符，需要改成服务器真实路径：

   ```powershell
   $srvproDirectory = 'D:\实际目录\srvprotianti'
   node .\Check-NeosBanlists.cjs --server-root $srvproDirectory --observed-hash 0x4250bce9
   ```

   默认修正目标为 `ygopro\lflist.conf`。如果检查显示实际目标在 `ygopro\expansions\lflist.conf` 或启用 PRO2 的 `ygopro\config\lflist.conf`，使用对应实际路径；不要把完整文件重复复制到多个加载路径。`hostinfo.lflist` 是加载顺序中的索引，不能填写 hash 数值。

3. 等正在进行的比赛结束，备份并替换确认过的实际文件。下面以 `ygopro\lflist.conf` 为例：

   ```powershell
   $banlistTarget = Join-Path $srvproDirectory 'ygopro\lflist.conf'
   $banlistBackup = "$banlistTarget.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
   Copy-Item -LiteralPath $banlistTarget -Destination $banlistBackup
   Copy-Item -LiteralPath .\lflist.fixed.conf -Destination $banlistTarget
   node .\Check-NeosBanlists.cjs --server-root $srvproDirectory
   ```

4. 为确保宿主与 Core 加载一致，重启 SRVPro。此文件没有已实现的热更新监视：宿主启动时读取表名／顺序，Core 在各房间进程初始化时读取具体条目；旧房间不会重新读取。仅改卡号时新建 Core 房间可以读取新文件，但本次上线验收采用重启后新房间，避免旧进程混用。Nginx 和 Cloudflare Quick Tunnel 不需要重启，继续保持隧道终端运行；网页版无需因本次禁表修正重新构建或上传。

5. 刷新网页，新建一个此前未使用过的普通房，核对 HostInfo 禁表 hash 为 `0x73ec4051`、MR2 和正确的房间模式，规则不一致提示应消失。再用原生客户端验证光之护封剑带 1 张可准备、跨主／额外／副卡组合计 2 张被拒绝（使用其他部分合法的测试卡组；网页自身校验会先拦住超限卡组）。TT Match 的正常比赛、换备及结算仍需要独立验收。

若新房间仍返回 `0x4250bce9`，继续核对实际进程启动目录、Core 加载路径／版本及禁表索引。若出现异常，在比赛结束后用备份恢复同一目标文件并重启 SRVPro；网页继续保留规则提示，不修改客户端 hash 来迁就未确认的服务端状态。

## 本地验证

```powershell
node --test scripts\test_banlist_diagnostic.cjs
```

6 项通过，包括从客户端基线构造两个错误卡号精确复现 `0x4250bce9`、修正后恢复基线、重复 ID／非法输入的 Core 解析规则，以及带空格路径的单文件只读诊断。原文件与修正版分别用 `--file` 核对，其他 102 张表做字节比较；没有连接或重启正式服务器。
