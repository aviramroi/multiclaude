# Contributing

- `bun install` · `bun run server` · `./bin/mc --help`
- Tests: `bun test` (unit) and `./test/e2e.sh` (two fake accounts against a local server: push/clone/pull/hooks/live/project mode).
- Adding a harness: implement `Adapter` in `src/core/adapters.ts` (paths, launch argv, hooks file) and extend `localize`/`summarize` in `src/core/transcript.ts` if the line shape differs.
- Keep `mc hook` deterministic and silent on success — it runs on every prompt.
