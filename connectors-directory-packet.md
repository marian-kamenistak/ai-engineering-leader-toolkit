# Claude Connectors Directory — submission packet (both marian.coach servers)

Refreshed 2026-09-03 (first written 2026-07-22). Covers **two** servers now. Nothing is
submitted; the portal sits behind Claude.ai org-admin settings, so every click below is yours.

## Why this listing and not another one

Directory entries are automatically eligible for **Suggested Connectors** — Claude recommending
the server in-chat when the user's task matches it. The same catalog serves claude.ai, Desktop,
mobile, Claude Code and Cowork. `claude.com` is also the top dofollow domain on our own registry
audit (rank 590, `registries-dofollow-2026-07-22.md`), above smithery (457) and lobehub (407).
No domain-ownership proof is needed here; that requirement belongs to the open MCP Registry.

Source: https://claude.com/docs/connectors/directory

## Status of the 2026-07-22 blockers

| # | Blocker then | Status now |
|---|---|---|
| 1 | Plan gate: portal needs a **Team or Enterprise** Claude org, Owner role | **STILL OPEN. The only real blocker.** Individual/Pro has no submit path |
| 2 | Tool annotations missing | **DONE.** All 10 toolkit tools carry `{readOnlyHint, destructiveHint:false, idempotentHint, openWorldHint:false}`; the inquiry server annotates 8 read-only plus a correct write annotation on `send_mentoring_offer` |
| 3 | Icon: no PNG | **DONE.** `plugins/engineering-leadership-plugin/assets/icon-192.png`, 300×300 PNG, converted from the site favicon |
| 4 | Privacy policy | Live, 200. https://www.marian.coach/privacy-policy/ |
| 5 | Test every tool yourself first | Yours to do, ~15 min per server (step 5 below) |

Also corrected: the toolkit has **10** tools, not the 9 this packet claimed in July, and
`https://www.marian.coach/favicon.ico` now returns 200 (it 404'd when this was written).

## Server A — Engineering Leadership Toolkit

**Connection**
- Server URL: `https://www.marian.coach/mcp`
- Transport: streamable HTTP · same URL for every user: yes · no authentication

**Listing**
- Server name: `Engineering Leadership Toolkit`
- Tagline (55 cap, this is 55): `Salary benchmarks and playbooks for engineering leaders`
- Description (2,000 cap):
  > Benchmarks and decision tools for engineering leaders, built from 3,611 mentoring sessions with leaders in 17+ countries since 2019, rated 9.17/10 across 300+ reviews. Ten tools: developer and engineering-manager market-value calculators with 2026 European salary data, a calibrated 17-question team-lead readiness assessment, engineering leadership benchmarks, 1:1 playbooks, first-time-manager readiness and failure modes, a mentor-vs-coach-vs-advisor chooser, a coaching cost estimator, and a mentoring business-case builder. Every tool is read-only. No account, no key, no setup. By Marian Kamenistak, engineering leadership mentor (marian.coach).
- Documentation URL: `https://www.marian.coach/mcp`
- Privacy policy: `https://www.marian.coach/privacy-policy/`
- Support: `marian@marian.coach`
- Icon: `assets/icon-192.png` (300×300 PNG)
- URL slug: `eng-leadership-toolkit` — **permanent once published**
- Reads/writes: reads only

**Use cases** — benchmark a developer's or EM's market value; decide whether to take a first
lead role; prepare a raise or promotion case; build the business case for mentoring; choose
between a mentor, a coach and an advisor. Nothing needed before connecting.

## Server B — Mentoring Inquiry Builder

New to this packet. Submit it **second**, after A is through review, so a rejection on the one
tool that collects contact details does not stall the read-only server.

**Connection**
- Server URL: `https://www.marian.coach/mcp/mentoring`
- Transport: streamable HTTP · same URL for every user: yes · no authentication

**Listing**
- Server name: `Mentoring with Marian Kamenistak`
- Tagline (48): `Build a mentoring inquiry and get a formal offer`
- Description:
  > Work out whether 1:1 leadership mentoring fits your situation, and what it would cost, in about sixteen minutes. Nine tools walk through focus areas, package options and a dated session plan, then compose a brief with the authoritative price from the live catalog. One tool sends a formal itemised offer to your email and files the inquiry so Marian can reply; it asks for your name and address at that point and nowhere earlier, and it will not run until you have agreed the price. You can also book a free 30-minute intro call or a paid first session directly. Prices are computed server-side from the published catalog, 296 to 395 EUR per session. By Marian Kamenistak, engineering leadership mentor (marian.coach).
- Documentation URL: `https://www.marian.coach/mcp/mentoring`
- Privacy policy: `https://www.marian.coach/privacy-policy/`
- Support: `marian@marian.coach`
- URL slug: `mentoring-with-marian-kamenistak` — **permanent**
- Reads/writes: **writes.** `send_mentoring_offer` files an inquiry and emails an offer;
  `book_intro_call` / `book_first_session` return booking links. Declare this plainly — a
  write server described as read-only is a documented rejection cause.

**Data handling for B** — collects name, email, optional company, and the free-text answers the
visitor gives. Used to reply to the inquiry. First-party API on the same domain as the service.
No payments taken in the connector, no health data, no sponsored content.

## What you click, in order

1. Confirm the claude.ai account is on a **Team or Enterprise** plan and you are an Owner. If it
   is not, this whole packet is blocked and the plugin directory is the alternative — that one
   accepts individual authors through Console.
2. Test the server yourself: Settings → Connectors → Add custom connector → the URL. Call every
   tool once. The portal makes you confirm you did.
3. `https://claude.ai/admin-settings/directory/submissions/new` → walk the 11 steps with the
   values above.
4. Submit. Track at `https://claude.ai/admin-settings/directory/submissions`. Escalations:
   `mcp-review@anthropic.com`.
5. Expect the automatic path: policy scan, then listing as a **community connector**. The
   "Anthropic Verified" badge is a separate curation call, no application, no guarantee.
6. Repeat for Server B once A is listed.

## Review notes

Review time varies with queue volume. The rejection causes that could bite: descriptions that do
not match behaviour (watch B — declare the writes), generic error responses, and missing tool
annotations, which are now fixed on both servers.
