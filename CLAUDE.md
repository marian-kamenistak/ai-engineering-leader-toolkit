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
- Numbers in tool copy (3,400+ sessions, 300+ leaders) must match the data-points registry.
