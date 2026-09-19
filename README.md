# compose-healthcheck-lint

A tiny, zero-config CLI that scans a `docker-compose.yml` and tells you:

1. **Which services have no `healthcheck` defined**
2. **Which `depends_on` entries won't actually wait for health** — either because they use the short-form array syntax (which Compose can't attach a condition to at all), or the long form without `condition: service_healthy`

No config file, no schema to learn — point it at a compose file and read the report.

## Why this exists

It's easy for a compose file to grow over a year of feature work until half the services have a `healthcheck` and half don't, and `depends_on` quietly means "start after" rather than "wait until ready." That gap causes flaky local dev environments and race-condition bugs in CI that are annoying to trace back to "oh, the DB just wasn't ready yet."

## Install

```bash
npm install --save-dev compose-healthcheck-lint
```

Or run it without installing:

```bash
npx compose-healthcheck-lint
```

## Usage

```bash
# Defaults to ./docker-compose.yml (also checks docker-compose.yaml, compose.yml, compose.yaml)
compose-healthcheck-lint

# Point at a specific file
compose-healthcheck-lint ./infra/docker-compose.prod.yml

# Machine-readable output for scripting
compose-healthcheck-lint --json

# Skip specific services (e.g. one-off migration containers that exit by design)
compose-healthcheck-lint --ignore migrate,seed-data

# Only check for missing healthchecks, skip the depends_on analysis
compose-healthcheck-lint --no-depends-check
```

### Example output

```
Checked 4 service(s) in docker-compose.yml

✘ 2 service(s) missing a healthcheck:
  - cache
  - worker

✘ 2 service(s) with depends_on not waiting on health:
  - api:
      -> cache: condition is "service_started", not "service_healthy"
  - worker:
      -> db: short-form depends_on cannot wait for health; use long form with condition
      -> cache: short-form depends_on cannot wait for health; use long form with condition
```

Exit codes: `0` clean, `1` issues found, `2` file missing or failed to parse — so it drops straight into CI.

### CI example (GitHub Actions)

```yaml
- name: Lint compose healthchecks
  run: npx compose-healthcheck-lint
```

## Options

| Flag                  | Description                                              |
|-----------------------|------------------------------------------------------------|
| `--json`              | Output JSON instead of text                               |
| `--ignore <a,b,c>`    | Comma-separated service names to skip                      |
| `--no-depends-check`  | Only report missing healthchecks, skip `depends_on` checks |
| `-h, --help`          | Show usage                                                 |

## What it does not do

- It doesn't validate that your healthcheck command is *correct* — only that one is present.
- It doesn't resolve `extends:` or multiple `-f` compose file merges (single-file scope, on purpose, to stay dependency-free).

## License

MIT
