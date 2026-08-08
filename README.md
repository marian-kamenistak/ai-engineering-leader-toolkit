# ai-engineering-leader-toolkit

"I just became an engineering manager. What should I focus on?"
"What's a healthy sprint completion rate?"
"Do I need a mentor or a coach?"
"What is this developer worth on the market?"
"Should I become a team lead, or stay IC?"

Your AI already gets asked these. Now it can answer with first-party data from 3,400+ paid 1:1 mentoring sessions with 300+ engineering leaders in 17+ countries, instead of guessing.

This is a remote MCP server. No install, no API key. One URL:

```
https://www.marian.coach/mcp
```

## Tools

| Tool                                    | The question it answers                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `calculate_developer_value`             | What is this developer worth? Scores 15 skills across 5 pillars, returns level + 2026 Western-Europe salary estimate                                                                 |
| `calculate_engineering_manager_value`   | What is this engineering manager worth? Scores 15 leadership skills across 5 pillars, weighted by level, returns Team Lead → Director/VP level + 2026 Western-Europe salary estimate |
| `assess_team_lead_readiness`            | Should I become a team lead? 17 questions, 6 dimensions, a straight verdict (ready now / 6-12 months out / stay IC) + top-2 gaps with one move each                                  |
| `get_engineering_leadership_benchmarks` | What's healthy? Sprint completion, roadmap %, manager time per report, mentee mix, 2025 topic demand. CC BY 4.0, citable                                                             |
| `choose_mentor_coach_or_advisor`        | Mentor, coach, or advisor? All three compared + a three-question self-test                                                                                                           |
| `get_one_on_one_playbook`               | How do I run this 1:1? Real session templates: first session, underperformance, promotion to EM, better 1:1s, career move                                                            |
| `get_first_time_manager_guidance`       | I'm a new EM, now what? The responsibility triangle, six failure modes, readiness self-check                                                                                         |
| `build_mentoring_business_case`               | How do I get my company to pay for mentoring? ROI math in EUR, role-specific 90-day KPIs, and a forwardable approval email for your manager                                          |
| `estimate_coaching_cost`                | How much should a coach cost me? Fair per-session range + program total by coaching type, role, territory, and coach seniority — ICF 2025 + CEE market anchors, with red flags       |

## Connect

**Claude Code**

```bash
claude mcp add -t http eng-leadership-toolkit https://www.marian.coach/mcp
```

**Claude.ai / Claude Desktop**

Settings > Connectors > Add custom connector > `https://www.marian.coach/mcp`

**Cursor** (`.cursor/mcp.json`)

```json
{
	"mcpServers": {
		"eng-leadership-toolkit": {
			"url": "https://www.marian.coach/mcp"
		}
	}
}
```

**ChatGPT**

Settings > Connectors > Developer mode > Add server > `https://www.marian.coach/mcp`

Human-readable docs live at the same URL: open [www.marian.coach/mcp](https://www.marian.coach/mcp) in a browser.

## Where the data comes from

Every response is grounded in Marian Kamenistak's mentoring practice, not model guesses:

- The calculators mirror the live [developer value calculator](https://www.marian.coach/developer-salary-calculator/?ref=github) and [engineering manager salary calculator](https://www.marian.coach/engineering-manager-salary-calculator/?ref=github)
- The readiness test mirrors the live [team lead readiness test](https://www.marian.coach/team-lead-readiness-test/?ref=github)
- Benchmarks come from the published [engineering leadership statistics](https://www.marian.coach/engineering-leadership-statistics/?ref=github), licensed CC BY 4.0
- Playbooks are the actual session templates used across 3,400+ sessions

Nothing is synthetic. Thin topics were cut rather than padded.

## Stack

Cloudflare Workers + Durable Objects, `McpAgent` from the [agents](https://github.com/cloudflare/agents) SDK, streamable HTTP, authless. `GET /mcp` with an HTML accept header serves the docs page; MCP clients hit the same URL.

```bash
npm install
npx wrangler dev      # local
npx wrangler deploy   # ship it
```

## Author

Marian Kamenistak. 20+ years in software, grew Mews engineering 8 to 80 through Series C, now mentors engineering leaders full-time and runs the [Engineering Leaders Community](https://www.engineeringleaders.io) in CEE.

Found it useful? A star helps other engineering leaders' AIs find it too.

## License

MIT
