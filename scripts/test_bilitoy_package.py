"""Check platform filtering, collision handling and byte-preserving resource mapping."""
import hashlib
import shutil
import unittest
from pathlib import Path
from uuid import uuid4

from package_bilitoy_release import ALLOWED_EXTENSIONS, ROOT, adapt_upload_files


class ToyPackageTests(unittest.TestCase):
    def setUp(self):
        folder = ROOT / '.audit-tmp'
        folder.mkdir(exist_ok=True)
        self.web = (folder / f'toy-package-{uuid4().hex}').resolve()
        assert self.web.is_relative_to(folder.resolve())
        self.web.mkdir()

    def tearDown(self):
        assert self.web.is_relative_to((ROOT / '.audit-tmp').resolve())
        assert self.web.name.startswith('toy-package-')
        shutil.rmtree(self.web)

    def put(self, name, content):
        path = self.web / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def test_data_and_license_bytes_survive_platform_extension_filter(self):
        fixtures = {'environment/zh-CN/cards.cdb': b'SQLite format 3\x00\x81\xff',
                    'environment/zh-CN/strings.conf': '\u5361\u7247\n'.encode('utf-8'),
                    'environment/lflist.conf': b'!2011.3.1\n72302403 1\n',
                    'neos-assets/sample.ydk': b'#main\n72302403\n#extra\n!side\n',
                    'LICENSE.txt': b'GPL license\n'}
        for name, content in fixtures.items():
            self.put(name, content)
        self.put('index.html', b'<html></html>')
        self.put('neos-assets/sql-wasm.wasm', b'\0asm\x01\0\0\0')
        self.put('_headers', b'/*\nCache-Control: no-store\n')
        self.put('neos-assets/records/.gitkeep', b'')
        mappings, omitted = adapt_upload_files(self.web)
        self.assertEqual(len(mappings), len(fixtures))
        self.assertCountEqual(omitted, ['_headers', 'neos-assets/records/.gitkeep'])
        for mapping in mappings:
            self.assertEqual((self.web / mapping['published']).read_bytes(), fixtures[mapping['source']])
            self.assertEqual(mapping['sha256'], hashlib.sha256(fixtures[mapping['source']]).hexdigest())
            self.assertFalse((self.web / mapping['source']).exists())
        self.assertTrue(all(path.suffix in ALLOWED_EXTENSIONS
                            for path in self.web.rglob('*') if path.is_file()))

    def test_collision_fails_before_changing_any_resource(self):
        source = self.put('cards.cdb', b'original')
        destination = self.put('cards.data', b'other')
        with self.assertRaisesRegex(ValueError, 'collision'):
            adapt_upload_files(self.web)
        self.assertEqual(source.read_bytes(), b'original')
        self.assertEqual(destination.read_bytes(), b'other')

    def test_unknown_extension_fails_before_renaming_valid_resources(self):
        source = self.put('cards.cdb', b'original')
        self.put('server.php', b'not static')
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            adapt_upload_files(self.web)
        self.assertTrue(source.exists())

    def test_two_resources_cannot_map_to_the_same_new_filename(self):
        first = self.put('cards.cdb', b'database')
        second = self.put('cards.conf', b'text')
        with self.assertRaisesRegex(ValueError, 'collision'):
            adapt_upload_files(self.web)
        self.assertTrue(first.exists() and second.exists())

    def test_private_files_are_rejected(self):
        for name in ['.env.local', 'private.pem', 'private.key']:
            with self.subTest(name=name):
                path = self.put(name, b'fixture only')
                with self.assertRaisesRegex(ValueError, 'Private'):
                    adapt_upload_files(self.web)
                path.unlink()


if __name__ == '__main__':
    unittest.main()
