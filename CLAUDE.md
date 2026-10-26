# eng-leadership-toolkit

## What this is
Remote, authless MCP server for the **mc** stream at `https://www.marian.coach/mcp`
(npm name `ai-engineering-leader-toolkit`). Ten tools grounded in Marian's mentoring data:
`get_started` (routes a greeting/test/unclear message to the right tool below), salary
calculators, team-lead readiness, benchmarks, mentor/coach chooser, 1:1 playbooks,
first-time-manager guidance, mentoring business case, coaching cost. `GET /mcp/business-case`
is the JSON surface for the marian.coach pricing wizard.

## Stack
- Cloudflare Worker + Durable Object `EngLeadershipToolkit` (`MCP_OBJECT`), `McpAgent` (`agents` ^0.17), streamable HTTP
- TypeScript 6, zod 4, vitest, oxlint/oxfmt, `@posthog/mcp` + `posthog-node`
- wrangler ^4.105, npm
- Routes `marian.coach/mcp*` + `www.` — **owns `/mcp*`**; `mentoring-inquiry-builder` nests under `/mcp/mentoring*`
- Cron `*/15 * * * *` uptime probe

## Run / build / deploy / test
```bash
# dev:    npm run dev
# build:  npm run type-check && npm run lint:fix && npm run format
# test:   npm test                    # vitest (test/business-case.test.ts)
# deploy: set -a && source ~/.env && set +a && npm run deploy
```
CI deploys on every push to `main` (`.github/workflows/deploy.yml`, ops-automation-kit `deploy-worker` + `report-and-register`, which also registers `job.yaml`); local `npm run deploy` still works. Errors go to `error-tail` (`tail_consumers`).

## Sources of truth
| Data | Lives in | Id / path |
|---|---|---|
| Calculators / readiness test | mirror the live marian.coach pages | `/developer-salary-calculator/`, `/engineering-manager-salary-calculator/`, `/team-lead-readiness-test/` |
| Benchmarks (CC BY 4.0) | marian.coach | `/engineering-leadership-statistics/` |
| Registry metadata | `server.json`, `mcp.json`, `LAUNCH-STATUS.md`, `REGISTRATION-MANUAL-2026-08-09.md` | |
| Secrets | Worker-only, no `.op-secrets`: `MCP_USAGE_SLACK_CHANNEL`, `SLACK_BOT_TOKEN_ELC`, `SLACK_WEBHOOK_URL` (`wrangler secret list`, 2026-08-30) | PostHog key is not a secret — public `posthogKey: "phc_…"` literal in `src/index.ts` |

## Definition of done
- [ ] `npm test` and `npm run type-check` exit 0
- [ ] `wrangler deploy` exits 0
- [ ] `tools/list` POST to `https://www.marian.coach/mcp` returns 10 tools; GET returns 200 HTML docs
- [ ] `GET https://www.marian.coach/mcp/business-case?lang=en` returns 200 JSON
- [ ] `wrangler tail --format json` for 60s: zero `console.error`, zero exceptions
- [ ] `/mcp/mentoring` still routes to `mentoring-inquiry-builder`

## Gotchas
- Numbers in tool copy (3,662 sessions, 300+ leaders) must match the data-points registry.
- Run reports (automation-visibility R-W, 2026-10-26): the cron posts to control-room through the `CONTROL_ROOM` service binding (secret `CONTROL_ROOM_TOKEN`, `.op-secrets`): failures, plus one success a day (first tick after 00:00 UTC). Test: `wrangler deploy --var REPORT_JOB_ID:zz-<name>` reports every tick; redeploy without it.
