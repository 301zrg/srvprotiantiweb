"""Build a self-contained BiliToy upload ZIP without changing standard releases."""
import argparse
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from package_test_release import archive, wss_url

ROOT = Path(__file__).resolve().parent.parent
ALLOWED_EXTENSIONS = frozenset(
    '.html .htm .css .js .json .wasm .data .md .csv .tsv '
    '.png .jpg .jpeg .gif .svg .webp .ico .woff2 .woff .ttf .eot '
    '.mp3 .wav .ogg .m4a .mp4 .webm .atlas .ani .part .nani .unityweb'.split()
)
RESOURCE_EXTENSIONS = {'.cdb': '.data', '.conf': '.data', '.ydk': '.data', '.txt': '.md'}


def adapt_upload_files(web):
    """Change only filenames, checking collisions and preserving resource bytes."""
    plans, omitted, destinations = [], [], set()
    for source in sorted(web.rglob('*')):
        relative = source.relative_to(web).as_posix()
        if source.is_symlink():
            raise ValueError(f'Symlinks cannot be published: {relative}')
        if not source.is_file():
            continue
        if source.name.lower().startswith('.env') or source.suffix.lower() in ('.pem', '.key'):
            raise ValueError(f'Private file cannot be published: {relative}')
        if relative == '_headers' or source.name == '.gitkeep':
            omitted.append(source)
            continue
        destination = source.with_suffix(RESOURCE_EXTENSIONS.get(source.suffix.lower(), source.suffix))
        if destination.suffix.lower() not in ALLOWED_EXTENSIONS:
            raise ValueError(f'Unsupported Toy file: {relative}')
        if destination in destinations or (destination != source and destination.exists()):
            raise ValueError(f'Toy filename collision: {relative}')
        destinations.add(destination)
        plans.append((source, destination))

    mappings = []
    for source, destination in plans:
        if source == destination:
            continue
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        source_name = source.relative_to(web).as_posix()
        source.rename(destination)
        if hashlib.sha256(destination.read_bytes()).hexdigest() != digest:
            raise ValueError(f'Resource bytes changed: {source_name}')
        mappings.append({'source': source_name, 'published': destination.relative_to(web).as_posix(),
                         'sha256': digest})
    removed = [source.relative_to(web).as_posix() for source in omitted]
    for source in omitted:
        source.unlink()
    return mappings, removed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--wss-url', type=wss_url,
                        help='Fixed public WSS endpoint; omit to create an offline editing package.')
    args = parser.parse_args()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    output = ROOT / 'releases' / f'bilitoy-{stamp}'
    web = output / 'web'
    # Every build uses a new, checked project-local directory; never clear dist or old releases.
    if not web.resolve().is_relative_to(ROOT) or output.exists():
        parser.error('Expected a new project-local release directory.')
    web.mkdir(parents=True)
    environment = {**os.environ, 'VITE_BASE_PATH': './', 'VITE_DEPLOY_TARGET': 'bilitoy',
                   'VITE_DUEL_WS_URL': '', 'PYTHONUTF8': '1'}
    subprocess.run(['node', 'scripts/check_replay_assets.mjs'], cwd=ROOT,
                   env=environment, check=True)
    subprocess.run(['python', 'scripts/build_environment_assets.py'], cwd=ROOT,
                   env=environment, check=True)
    subprocess.run(['node', 'node_modules/vite/bin/vite.js', 'build', '--outDir',
                    web.relative_to(ROOT).as_posix(), '--emptyOutDir'],
                   cwd=ROOT, env=environment, check=True)
    subprocess.run(['node', 'scripts/copy_assets.mjs', web.relative_to(ROOT).as_posix()],
                   cwd=ROOT, env=environment, check=True)
    (web / 'bilitoy-iconfont.js').write_bytes((ROOT / 'deployment/bilitoy/iconfont.js').read_bytes())
    (web / 'LICENSE.md').write_bytes((ROOT / 'LICENSE').read_bytes())
    mappings, removed = adapt_upload_files(web)
    config = json.dumps({'duelWebSocketUrl': args.wss_url or ''}, ensure_ascii=True)
    (web / 'duel-config.js').write_text(
        '// Public operator endpoint; no player credentials.\n'
        f'window.__SRVPRO_DUEL_CONFIG__ = {config};\n', encoding='utf-8')
    commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True, text=True)
    status = subprocess.run(['git', 'status', '--porcelain'], cwd=ROOT, capture_output=True, text=True)
    manifest = {
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'sourceCommit': commit.stdout.strip() if commit.returncode == 0 else None,
        'workingTreeDirty': bool(status.stdout.strip()) if status.returncode == 0 else None,
        'target': 'bilitoy', 'basePath': './', 'environment': '1103-201103-v1',
        'wssUrl': args.wss_url,
        'status': 'awaiting-platform-approval-and-live-test',
        'resourceMappings': mappings, 'omittedDeploymentFiles': removed,
    }
    (web / 'deployment-info.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    for path in web.rglob('*'):
        if path.is_file() and path.suffix.lower() not in ALLOWED_EXTENSIONS:
            parser.error(f'Unsupported file remains in upload: {path.relative_to(web)}')
    target = output / 'web-bilitoy.zip'
    archive(web, target)
    (output / 'SHA256SUMS.json').write_text(json.dumps({
        target.name: hashlib.sha256(target.read_bytes()).hexdigest(),
    }, indent=2) + '\n', encoding='utf-8')
    (output / 'UPLOAD.md').write_text(
        '# BiliToy 上传包\n\n'
        '上传同目录的 `web-bilitoy.zip`，不要上传源码或整个 releases 文件夹。\n\n'
        '本包入口在 ZIP 根目录，静态资源使用相对路径；卡库、strings、禁表和示例卡组'
        '发布副本使用允许的后缀，内容字节未改变。`LICENSE.md` 保留项目许可证。\n\n'
        f'固定对战入口：`{args.wss_url or "未配置，在线入场已禁用"}`。\n\n'
        '投稿前确认 Toy 资格、外部服务域名及用户输入能力、包体额度与运营协议。'
        '本站资源适配完成不代表已经通过平台审核或大陆实战验收。\n\n'
        '服务器 neos-tunnel.conf 的现有 Origin map 内追加实测作品来源，'
        '公共示例为 `"https://www.bilibilitoy.com" 1;`。Nginx 检查通过后 reload，'
        '不为此重启隧道。隧道地址变化后需重新打包并更新平台域名许可。\n',
        encoding='utf-8')
    print(f'BiliToy upload ZIP: {target}', flush=True)
    print(f'ZIP bytes: {target.stat().st_size}', flush=True)
    print(f'Fixed WSS: {args.wss_url or "NOT SET: online joining disabled"}', flush=True)
    print('Platform approval, actual Toy Origin and mobile live testing remain required.', flush=True)


if __name__ == '__main__':
    main()
