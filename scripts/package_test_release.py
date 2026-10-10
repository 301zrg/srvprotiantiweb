"""Package a public web test release and a Windows server kit; never read secrets."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZIP_DEFLATED, ZipFile
from public_operator_config import add_public_config_arguments, resolve_public_config, write_public_config

ROOT = Path(__file__).resolve().parent.parent


def site_origin(value):
    url = urlsplit(value)
    if (url.scheme != 'https' or not url.hostname or url.username or url.password
            or url.path not in ('', '/') or url.query or url.fragment):
        raise argparse.ArgumentTypeError('Use the HTTPS origin of the static site, without a path.')
    return f'{url.scheme}://{url.netloc}'


def archive(folder, target):
    with ZipFile(target, 'w', ZIP_DEFLATED) as result:
        for path in sorted(folder.rglob('*')):
            if path.is_file():
                result.write(path, path.relative_to(folder).as_posix())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_public_config_arguments(parser)
    parser.add_argument('--site-origin', type=site_origin)
    parser.add_argument('--include-cloudflared', action='store_true',
                        help='Include the locally verified portable Windows connector and its license.')
    args = parser.parse_args()
    public_config = resolve_public_config(args, parser)
    endpoint = public_config['duelWebSocketUrl']
    source = ROOT / 'dist'
    if not (source / 'index.html').is_file() or not (source / 'duel-config.js').is_file():
        parser.error('Run npm run build first; the build must include duel-config.js.')
    for path in source.rglob('*'):
        if path.is_symlink() or path.name.startswith('.env') or path.suffix in ('.pem', '.key'):
            parser.error(f'Unexpected private file or symlink in dist: {path.name}')
    connector = ROOT / '.audit-tmp' / 'tools' / 'cloudflared.exe'
    connector_license = connector.with_name('cloudflared-LICENSE.txt')
    if args.include_cloudflared:
        pin = re.search(r"\$expectedHash = '([a-f0-9]{64})'",
                        (ROOT / 'deployment/windows/Download-Cloudflared.ps1').read_text(encoding='utf-8'))
        if not pin or not connector.is_file() or not connector_license.is_file():
            parser.error('Missing verified cloudflared or official license in .audit-tmp/tools/.')
        if hashlib.sha256(connector.read_bytes()).hexdigest() != pin.group(1):
            parser.error('Portable connector SHA256 differs from the pinned official release.')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    output = ROOT / 'releases' / stamp
    web = output / 'web'
    kit = output / 'server-kit'
    shutil.copytree(source, web)
    shutil.copytree(ROOT / 'deployment' / 'windows', kit,
                    ignore=shutil.ignore_patterns('runtime', '*.exe', '*.download'))
    shutil.copyfile(ROOT / 'LICENSE', web / 'LICENSE.txt')
    if args.include_cloudflared:
        shutil.copyfile(connector, kit / 'cloudflared.exe')
        shutil.copyfile(connector_license, kit / 'cloudflared-LICENSE.txt')
    guide = ROOT / 'docs' / 'current-server-online-test.md'
    if guide.is_file():
        (kit / 'ONLINE_TEST.md').write_text(guide.read_text(encoding='utf-8').replace(
            '](pm2-quick-tunnel.md)', '](PM2_TUNNEL.md)'), encoding='utf-8')
        shutil.copyfile(ROOT / 'docs' / 'wss-integration.md', kit / 'wss-integration.md')
        shutil.copyfile(ROOT / 'docs' / 'pm2-quick-tunnel.md', kit / 'PM2_TUNNEL.md')
    if args.site_origin:
        nginx = kit / 'neos-tunnel.conf'
        nginx.write_text(nginx.read_text(encoding='utf-8').replace(
            'https://srvprotiantiweb.pages.dev', args.site_origin), encoding='utf-8')
    write_public_config(web, public_config)
    commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True, text=True)
    status = subprocess.run(['git', 'status', '--porcelain'], cwd=ROOT, capture_output=True, text=True)
    manifest = {
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'sourceCommit': commit.stdout.strip() if commit.returncode == 0 else None,
        'workingTreeDirty': bool(status.stdout.strip()) if status.returncode == 0 else None,
        'wssUrl': endpoint,
        'publicConfig': public_config,
        'environment': '1103-201103-v1',
        'status': 'online-test-candidate-not-accepted' if endpoint else 'awaiting-public-endpoint',
    }
    (web / 'deployment-info.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    archive(web, output / 'web-pages.zip')
    archive(kit, output / 'windows-server-kit.zip')
    pm2_kit = output / 'pm2-kit'
    pm2_kit.mkdir()
    for name in ('neos-quick-tunnel.cjs', 'ecosystem.neos.config.js', 'PM2_TUNNEL.md'):
        shutil.copyfile(kit / name, pm2_kit / name)
    shutil.copyfile(ROOT / 'LICENSE', pm2_kit / 'LICENSE.txt')
    archive(pm2_kit, output / 'pm2-tunnel-kit.zip')
    hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
              for path in output.glob('*.zip')}
    (output / 'SHA256SUMS.json').write_text(json.dumps(hashes, indent=2) + '\n', encoding='utf-8')
    print(f'Web folder for Pages upload: {web}')
    print(f'Web zip: {output / "web-pages.zip"}')
    print(f'Windows server kit: {output / "windows-server-kit.zip"}')
    print(f'PM2 tunnel-only upgrade kit: {output / "pm2-tunnel-kit.zip"}')
    print(f'Fixed public endpoint: {endpoint or "NOT SET: joining is disabled until configured"}')
    if not args.site_origin:
        print('Set the exact Pages origin in server-kit/neos-tunnel.conf before uploading the website.')


if __name__ == '__main__':
    main()
