const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { resolve, join, dirname, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { parseBanlists } = require('../deployment/windows/Check-NeosBanlists.cjs');

test('canonical 2011.3.1 equals the hash returned by the isolated real Core', () => {
  const file = resolve(__dirname, '../resources-staging/1103/lflist.conf');
  const [list] = parseBanlists(readFileSync(file, 'utf8'));
  assert.equal(list.name, '2011.3.1');
  assert.equal(list.hash, '0x73ec4051');
  assert.equal(list.entries, 134);
  assert.deepEqual(list.counts, [50, 66, 18]);
  assert.deepEqual(list.duplicates, []);
});

test('repeated entries affect Core hash even though the ID map overwrites', () => {
  const [list] = parseBanlists('!Repeated\r\n12345 0\r\n12345 0\r\n');
  assert.equal(list.hash, '0x7dfcee6a');
  assert.equal(list.uniqueIds, 1);
  assert.equal(list.entries, 2);
  assert.deepEqual(list.duplicates, [12345]);
});

test('invalid separators, count bounds, IDs and BOM headers follow Core parsing', () => {
  const [list] = parseBanlists('\ufeff!Ignored\n1 0\n!Valid\n1\t0\n2 3\n4294967296 0\n3 -1\n1 0 # accepted comment\n');
  const [expected] = parseBanlists('!Valid\n1 0\n');
  assert.deepEqual(list, expected);
});

test('missing numeric count becomes forbidden as in Core strtol', () => {
  assert.deepEqual(parseBanlists('!Test\n12345 # no count\n'), parseBanlists('!Test\n12345 0\n'));
});

test('two misspelled IDs reproduce the observed production hash and correction restores the baseline', () => {
  const canonical = readFileSync(resolve(__dirname, '../resources-staging/1103/lflist.conf'), 'utf8');
  const wrong = canonical.replace('26202165 1', '26202165 1 -- incorrect comment\n26202465 1')
    .replace('72302403 1', '72304203 1');
  const [before] = parseBanlists(wrong);
  assert.equal(before.hash, '0x4250bce9');
  assert.equal(before.entries, 135);
  assert.deepEqual(before.counts, [50, 67, 18]);
  // Comments do not affect Core rules. Remove the phantom Sangan code and
  // restore the real Swords of Revealing Light code, which was unrestricted.
  const fixed = wrong.replace('26202465 1\n', '').replace('72304203 1', '72302403 1');
  assert.deepEqual(parseBanlists(fixed), parseBanlists(canonical));
  assert.match(fixed, /(?:^|\n)72302403 1(?:\r|\n)/);
  assert.doesNotMatch(wrong, /(?:^|\n)72302403 1(?:\r|\n)/);
});

test('single-file CLI checks a path with spaces without treating it as a server root', t => {
  const directory = mkdtempSync(join(tmpdir(), 'neos banlist test '));
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('neos banlist test '));
    rmSync(directory, { recursive: true, force: true });
  });
  const file = join(directory, 'lflist.conf');
  writeFileSync(file, readFileSync(resolve(__dirname, '../resources-staging/1103/lflist.conf')));
  const script = resolve(__dirname, '../deployment/windows/Check-NeosBanlists.cjs');
  const result = spawnSync(process.execPath, [script, '--file', file, '--observed-hash', '0x4250bce9'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /file-index=0 !2011\.3\.1: 0x73ec4051/);
  assert.match(result.stdout, /Expected hash present: true/);
  assert.match(result.stdout, /Observed hash present: false/);
  assert.doesNotMatch(result.stdout, /core-index=/);
  const invalid = spawnSync(process.execPath, [script, '--file', file, '--server-root', directory], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Usage:/);
});
