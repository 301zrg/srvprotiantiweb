import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8'));
assert.equal(config.main, undefined, 'Static hosting must not deploy a billed Worker script');
assert.equal(config.assets.directory, './dist');
assert.equal(config.assets.binding, undefined, 'Asset-only hosting needs no script binding');
assert.equal(config.assets.run_worker_first, undefined, 'Static requests must not invoke a Worker');
assert.equal(config.name, 'black-surf-69e5', 'Retain the existing production project');
assert.equal(config.workers_dev, true, 'Retain the existing workers.dev entry');
assert.deepEqual(config.previews, {}, 'Retain the existing Wrangler preview command');
console.log('PASS asset-only production and preview configuration: no billed Worker entry or binding');
