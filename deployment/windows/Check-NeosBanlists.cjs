// Read only public lflist.conf files. Never read SRVPro's private config.json.
const { readFileSync, existsSync, statSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { createHash } = require('node:crypto');

const expectedHash = '0x73ec4051';
const hex = value => `0x${(value >>> 0).toString(16).padStart(8, '0')}`;

// Matches the reviewed ygopro/gframe/deck_manager.cpp, including repeated IDs.
function parseBanlists(text) {
  const lists = [];
  let current;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('#')) continue;
    if (line.startsWith('!')) {
      current = { name: line.slice(1), hash: 0x7dfcee6a, entries: 0,
        counts: [0, 0, 0], duplicates: [], ids: new Set() };
      lists.push(current);
      continue;
    }
    if (!current) continue;
    // strtoul permits leading ASCII whitespace and a sign, but the following
    // separator must be a literal space. strtol permits trailing comments.
    const match = /^[\t\v\f\r ]*\+?(\d+) (.*)/.exec(line);
    if (!match) continue;
    const code = Number(match[1]);
    const countMatch = /^[\t\v\f\r ]*([+-]?\d+)/.exec(match[2]);
    // Core does not reject an empty strtol conversion: it becomes count=0.
    const count = countMatch ? Number(countMatch[1]) : 0;
    if (!Number.isSafeInteger(code) || code > 0xffffffff || count < 0 || count > 2) continue;
    if (current.ids.has(code)) current.duplicates.push(code);
    current.ids.add(code);
    current.entries++;
    current.counts[count]++;
    current.hash = (current.hash ^ ((code << 18) | (code >>> 14)) ^
      ((code << (27 + count)) | (code >>> (5 - count)))) >>> 0;
  }
  return lists.map(({ ids, ...list }) => ({ ...list, hash: hex(list.hash), uniqueIds: ids.size }));
}

function main(args) {
  let root;
  let singleFile;
  let observed;
  let showAll = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--server-root') root = args[++index];
    else if (arg === '--file') singleFile = args[++index];
    else if (arg === '--observed-hash') observed = args[++index];
    else if (arg === '--all') showAll = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (Boolean(root) === Boolean(singleFile)) throw new Error('Usage: node Check-NeosBanlists.cjs (--server-root "C:\\path\\to\\srvprotianti" | --file "C:\\path\\to\\lflist.conf") [--observed-hash 0x4250bce9] [--all]');
  if (observed && !/^0x[0-9a-f]{8}$/i.test(observed)) throw new Error('Observed hash must be 0x followed by eight hexadecimal digits.');
  observed = observed?.toLowerCase();
  if (root) {
    root = resolve(root);
    if (!statSync(root).isDirectory()) throw new Error('Server root is not a directory.');
  }
  console.log(`Expected client banlist: ${expectedHash} (!2011.3.1; 50 forbidden / 66 limited / 18 semi-limited)`);
  if (observed) console.log(`Observed room banlist: ${observed}`);
  console.log('Algorithm: reviewed local YGOPro Core for standard positive card IDs; different deployed Core versions may require comparison.');
  let standardIndex = 0;
  let total = 0;
  let foundExpected = false;
  let foundObserved = false;
  const files = singleFile
    ? [{ path: resolve(singleFile), conditional: false }]
    : ['config/lflist.conf', 'expansions/lflist.conf', 'lflist.conf'].map(relative => ({
      path: join(root, 'ygopro', ...relative.split('/')),
      conditional: relative === 'config/lflist.conf',
    }));
  for (const { path, conditional } of files) {
    if (!existsSync(path)) {
      console.log(`MISSING ${path}`);
      continue;
    }
    const bytes = readFileSync(path);
    const lists = parseBanlists(bytes.toString('utf8'));
    console.log(`FILE ${path}`);
    console.log(`  SHA256 ${createHash('sha256').update(bytes).digest('hex')}; sections=${lists.length}`);
    if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) console.log('  NOTE UTF-8 BOM exists; this parser preserves Core header recognition.');
    if (conditional) console.log('  CONDITIONAL: loaded first only with SERVER_PRO2_SUPPORT; those sections shift subsequent Core indices.');
    lists.forEach((list, index) => {
      const matchesExpected = list.hash === expectedHash;
      const matchesObserved = Boolean(observed && list.hash === observed);
      foundExpected ||= matchesExpected;
      foundObserved ||= matchesObserved;
      if (showAll || /^2011\.3(?:\.1)?(?:\D|$)/.test(list.name) || matchesExpected || matchesObserved) {
        const position = singleFile ? `file-index=${index}` : conditional ? `conditional-file-index=${index}` : `core-index=${standardIndex + index}`;
        const tags = [matchesExpected && 'EXPECTED', matchesObserved && 'OBSERVED'].filter(Boolean).join(',');
        console.log(`  ${position} !${list.name}: ${list.hash}; entries=${list.entries}; counts=${list.counts.join('/')}${tags ? ` [${tags}]` : ''}`);
        if (list.duplicates.length) console.log(`  WARNING repeated IDs (${list.duplicates.length}): ${list.duplicates.join(',')}`);
      }
    });
    if (!conditional) standardIndex += lists.length;
    total += lists.length;
  }
  if (!total) throw new Error('No banlist sections found. Check the actual running SRVPro directory.');
  console.log(`Expected hash present: ${foundExpected}`);
  if (observed) console.log(`Observed hash present: ${foundObserved}`);
  console.log('No configuration was read or changed. This file check does not prove which list a running room uses.');
}

module.exports = { parseBanlists };
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
