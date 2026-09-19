#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function parseArgs(argv) {
  const args = { file: null, json: false, ignore: [], failOnDepends: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--ignore') args.ignore = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--no-depends-check') args.failOnDepends = false;
    else if (!a.startsWith('-')) args.file = a;
  }
  return args;
}

function printHelp() {
  console.log(`compose-healthcheck-lint - find services missing Docker healthchecks

Usage:
  compose-healthcheck-lint [file] [options]

Arguments:
  file                    Path to a docker-compose file (default: docker-compose.yml)

Options:
  --json                  Output machine-readable JSON instead of text
  --ignore <a,b,c>        Comma-separated list of service names to skip
  --no-depends-check      Don't flag depends_on entries missing condition: service_healthy
  -h, --help              Show this help text

Exit codes:
  0  no issues found
  1  one or more services have issues
  2  file not found or failed to parse
`);
}

function findDefaultFile() {
  const candidates = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function analyze(doc) {
  const services = (doc && doc.services) || {};
  const names = Object.keys(services);
  const missingHealthcheck = [];
  const badDependsOn = []; // { service, dependsOnMissingCondition: [names] }

  for (const name of names) {
    const svc = services[name] || {};
    const hasOwnHealthcheck = !!svc.healthcheck;
    // A service "inheriting" healthcheck via extends is rare enough to ignore here.
    if (!hasOwnHealthcheck) {
      missingHealthcheck.push(name);
    }

    if (svc.depends_on) {
      const dependsOn = svc.depends_on;
      const flagged = [];
      if (Array.isArray(dependsOn)) {
        // Short-form depends_on has no way to express service_healthy at all.
        for (const dep of dependsOn) {
          flagged.push({ dep, reason: 'short-form depends_on cannot wait for health; use long form with condition' });
        }
      } else if (typeof dependsOn === 'object') {
        for (const [dep, cfg] of Object.entries(dependsOn)) {
          const condition = cfg && cfg.condition;
          if (condition !== 'service_healthy') {
            flagged.push({ dep, reason: `condition is "${condition || 'service_started (default)'}", not "service_healthy"` });
          }
        }
      }
      if (flagged.length) {
        badDependsOn.push({ service: name, flagged });
      }
    }
  }

  return { allServices: names, missingHealthcheck, badDependsOn };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const file = args.file || findDefaultFile();
  if (!file) {
    console.error('No compose file found. Pass a path or run from a directory with docker-compose.yml.');
    process.exit(2);
  }

  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(2);
  }

  let doc;
  try {
    const raw = fs.readFileSync(resolved, 'utf8');
    doc = yaml.load(raw);
  } catch (err) {
    console.error(`Failed to parse ${file}: ${err.message}`);
    process.exit(2);
  }

  const { allServices, missingHealthcheck, badDependsOn } = analyze(doc);

  const ignoreSet = new Set(args.ignore);
  const filteredMissing = missingHealthcheck.filter(s => !ignoreSet.has(s));
  const filteredDependsOn = args.failOnDepends
    ? badDependsOn
        .filter(entry => !ignoreSet.has(entry.service))
        .map(entry => ({ ...entry, flagged: entry.flagged.filter(f => !ignoreSet.has(f.dep)) }))
        .filter(entry => entry.flagged.length)
    : [];

  const hasIssues = filteredMissing.length > 0 || filteredDependsOn.length > 0;

  if (args.json) {
    console.log(JSON.stringify({
      file,
      totalServices: allServices.length,
      missingHealthcheck: filteredMissing,
      badDependsOn: filteredDependsOn,
      ok: !hasIssues
    }, null, 2));
    process.exit(hasIssues ? 1 : 0);
  }

  console.log(`Checked ${allServices.length} service(s) in ${file}\n`);

  if (filteredMissing.length === 0) {
    console.log('✔ Every service has a healthcheck defined.');
  } else {
    console.log(`✘ ${filteredMissing.length} service(s) missing a healthcheck:`);
    for (const s of filteredMissing) console.log(`  - ${s}`);
  }

  if (args.failOnDepends) {
    console.log('');
    if (filteredDependsOn.length === 0) {
      console.log('✔ All depends_on entries wait on service_healthy where applicable.');
    } else {
      console.log(`✘ ${filteredDependsOn.length} service(s) with depends_on not waiting on health:`);
      for (const entry of filteredDependsOn) {
        console.log(`  - ${entry.service}:`);
        for (const f of entry.flagged) {
          console.log(`      -> ${f.dep}: ${f.reason}`);
        }
      }
    }
  }

  console.log('');
  process.exit(hasIssues ? 1 : 0);
}

main();
