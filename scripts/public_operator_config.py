"""Invoke the common Node public-config validator from both Python packagers."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def add_public_config_arguments(parser):
    parser.add_argument('--wss-url', help='Public WSS URL; overrides VITE_DUEL_WS_URL. Empty disables online joining.')
    parser.add_argument('--deck-import-origins', help='JSON array of exact website origins; [] disables message import. Overrides VITE_DECK_IMPORT_ORIGINS.')
    parser.add_argument('--website-base-url', help='Public website URL; overrides VITE_WEBSITE_BASE_URL.')


def resolve_public_config(args, parser):
    command = ['node', str(ROOT / 'scripts/public_operator_config.mjs')]
    for name in ('wss_url', 'deck_import_origins', 'website_base_url'):
        value = getattr(args, name)
        if value is not None:
            command.extend(['--' + name.replace('_', '-'), value])
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    if result.returncode:
        parser.error(result.stderr.strip() or 'Public deployment configuration validation failed.')
    return json.loads(result.stdout)


def write_public_config(web, config):
    (web / 'duel-config.js').write_text(
        '// Public operator configuration; no player credentials.\n'
        'window.__SRVPRO_DUEL_CONFIG__ = ' + json.dumps(config, ensure_ascii=True) + ';\n',
        encoding='utf-8')
