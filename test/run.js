'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const assert = require('assert');

const CLI = path.join(__dirname, '..', 'bin', 'cli.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'docker-compose.yml');

function run(args) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { encoding: 'utf8' });
    return { stdout, code: 0 };
  } catch (err) {
    return { stdout: err.stdout ? err.stdout.toString() : '', code: err.status };
  }
}

let failures = 0;

function check(desc, fn) {
  try {
    fn();
    console.log(`  ok - ${desc}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL - ${desc}`);
    console.log(`    ${err.message}`);
  }
}

console.log('compose-healthcheck-lint tests');

check('exits 1 and flags cache + worker as missing healthchecks', () => {
  const { stdout, code } = run([FIXTURE]);
  assert.strictEqual(code, 1);
  assert.match(stdout, /cache/);
  assert.match(stdout, /worker/);
});

check('--json produces valid parseable JSON with expected shape', () => {
  const { stdout } = run([FIXTURE, '--json']);
  const data = JSON.parse(stdout);
  assert.strictEqual(data.totalServices, 4);
  assert.deepStrictEqual(data.missingHealthcheck.sort(), ['cache', 'worker']);
  assert.strictEqual(data.ok, false);
});

check('--ignore suppresses listed services and results in a clean pass', () => {
  const { stdout, code } = run([FIXTURE, '--json', '--ignore', 'worker,cache']);
  const data = JSON.parse(stdout);
  assert.strictEqual(code, 0);
  assert.strictEqual(data.ok, true);
});

check('exits 2 on missing file', () => {
  const { code } = run(['does-not-exist.yml']);
  assert.strictEqual(code, 2);
});

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
} else {
  console.log('\nAll tests passed');
}
