# MCP registries — empirical dofollow audit (2026-07-22)

**Question:** which MCP registries/directories give a DOFOLLOW backlink for a server listing?
**Method:** 4-agent deep-research sweep (discovery → raw-HTML `curl` verification of real listing pages, rel-attribute inspection; Googlebot-UA and real-Chrome fallbacks for bot-blocked sites; Wayback raw snapshots where live HTML is challenge-gated). Domain rank = DataForSEO `backlinks_bulk_ranks`, 0–1000 scale (marian.coach = 171, github.com = 867 for calibration). Raw notes: session scratchpad `registry-research/research-notes/task-{a,b,c,d}.md`. AS_OF 2026-07-22 — this ecosystem churns; re-verify before acting on this file if it's older than ~2 months.

**Core distinction the whole strategy hangs on:** a "dofollow" registry only helps marian.coach if the link points at **marian.coach/mcp (website field)**. Many registries dofollow-link ONLY the GitHub repo — equity lands on github.com (which nofollows all outbound links), so nothing chains to marian.coach. Ranked accordingly.

## Tier 1 — dofollow + website-field link possible + free (DO THESE)

| # | Registry | Rank | Evidence (empirical) | How | Status |
|---|---|---|---|---|---|
| 1 | **claude.com** Connectors Directory | 590 | vendor-site link no rel, 0×nofollow on live listing | Org-admin portal + Anthropic review (needs docs URL, privacy policy, icon, test account) | Prep submission — highest-authority attainable |
| 2 | **smithery.ai** | 457 | our own listing: `<a href="https://www.marian.coach/mcp" rel="noopener noreferrer">` — no nofollow; Googlebot gets full SSR | Publish + homepage field | ✅ **LIVE 2026-07-22** — dofollow already earned |
| 3 | **lobehub.com** | 407 | no rel attribute at all; SSR for Googlebot; `meta robots index,follow` | Submit form at /mcp/submit (account, GitHub-import; homepage field) | Submit |
| 4 | **pulsemcp.com** | 337 | vendor link no rel, 0×nofollow (Wayback raw snapshots 2025-07 + 2026-07 — live curl is Cloudflare-403'd; Google indexes it fine) | Free /submit + claim; also auto-flows from official registry | Submit/claim |
| 5 | **cursor.directory** | 295 | no rel (Wayback 2025-08 + identical live sister-site windsurf.run) | Submit form; the single outbound link is FREE-TEXT URL → submit marian.coach/mcp as the URL, not the repo | Submit |
| 6 | **mcpservers.org** | 268 | main listing button `rel="noopener noreferrer"` (README-body links nofollow, featured slots `sponsored`) | /submit form — URL field explicitly "GitHub **or docs**" → use marian.coach/mcp; has a dedicated remote-servers section | Submit |
| 7 | **aiagentslist.com** | 216 | main CTA + author links `rel="noopener noreferrer"`, no nofollow | Directory submission form | Submit |
| 8 | **mcpserverfinder.com** | 138 | renders the repo README verbatim — README links come out with **no rel** → our README's marian.coach links go live dofollow | Auto-scrapes GitHub + submit form | Submit/verify auto-pickup |

## Tier 2 — dofollow, automatic (no action or already in flight)

| Registry | Rank | Mechanism |
|---|---|---|
| **awesome.ecosyste.ms** | 417 | Full mirror of punkpeye/awesome-mcp-servers, links carry no rel — free ride the moment PR #9933 merges (merge-watch already in daily drip R6) |
| **libhunt.com** | 384 | Tracks awesome-lists + GitHub mentions, github links no rel; manual "submit project" also exists |

## Tier 3 — dofollow but GitHub-link-only, curated, or discounted

| Registry | Rank | Why discounted |
|---|---|---|
| hub.docker.com/mcp | 604 | README vendor links dofollow, but community tier = curated PR to docker/mcp-registry, container-first culture; remote-server type exists — worth one PR attempt, effort medium |
| modelscope.cn | 434 | Dofollow in rendered DOM but pure JS shell to crawlers (incl. Googlebot UA) + CN infra — SEO value doubtful, skip |
| mcpmarket.com | 292 | Dofollow verified in real Chrome, `index,follow` meta, but curl/robots unverifiable (Vercel checkpoint); GitHub-targeted listings — low-priority submit |
| himcp.ai | 211 | Dofollow verified, but no submission path found on current site |
| windsurf.run | 101 | Dofollow, free-text URL like cursor.directory, but weakest domain of the set — do after cursor.directory since it's the same account/platform |
| claudemcp.org | n/a (unranked) | Dofollow, PR-based, author-controlled markdown (could carry marian.coach links) — new/low-authority domain, cheap PR, optional |
| awesome-mcp.tools | n/a (unranked) | Dofollow but literally one link = GitHub repo, no website field |
| zed.dev/extensions | 455 | Requires building a Rust/WASM extension wrapper AND Zed is deprecating MCP extensions for the official registry — skip |

## Nofollow / dead — no SEO action

**Nofollow (listing still has discovery/AI-citation value, zero link equity):** glama.ai (476, `rel="ugc nofollow"` on everything), apify.com (559), mcp.so free tier (363, `rel="nofollow ugc"`), mcp.directory (140), aimcp.info (168). **GitHub READMEs (867):** all outbound links `rel="nofollow"` — awesome-list PRs are an AI-citation/mirror-seeding play, not link equity.
**Dead/defunct (remove from all target lists):** mcp.run (→ turbomcp.ai marketing site), playbooks.com/mcp, mcphunt.com (domain for sale), hub.continue.dev (DNS gone), mcp-get.com (uncrawlable SPA shell, stale).

## Verdict: is mcp.so's $39 worth it?

**Recommendation: NO — skip the paid tier, take the free (nofollow) listing.** Reasoning:

1. **The claim is real** — empirically confirmed: free listing = `rel="nofollow ugc"`, paid listing = clean rel (checked a `paidSubmission:!0` page). So the $39 does buy a genuine dofollow on a rank-363 domain.
2. **But the same money-class of link is free elsewhere.** Smithery (457) is already live and dofollow to marian.coach/mcp. PulseMCP (337), LobeHub (407), cursor.directory (295), mcpservers.org (268) are all free, dofollow, website-field-capable. mcp.so's paid link adds one more referring domain, not a new class of value.
3. **Paid dofollow is textbook link-buying under Google's spam policy** (paid placements are supposed to be `sponsored`/`nofollow`). Enforcement at this scale is unlikely, but paying to acquire the exact risk category that the free alternatives avoid is a bad trade.
4. **What the free mcp.so listing still gives:** an indexable page on a 10k-page directory that LLMs scrape — the AI-citation value (the actual point of the T8 tier) does not depend on the rel attribute.

Revisit only if, after the Tier 1 wave lands, the referring-domain count still needs one push and nothing cheaper remains.

## Confidence + limitations (counter-review)

- **High confidence:** smithery (verified on our own live listing), mcp.so both tiers, glama, mcp.directory, mcpservers.org, mcpserverfinder, aiagentslist, awesome.ecosyste.ms, libhunt, lobehub, claude.com, windsurf.run, aimcp, apify, github.com (all live raw HTML).
- **Medium-high:** pulsemcp + cursor.directory (Wayback raw snapshots — pulsemcp's from this month; cursor.directory corroborated by its identical open-source sister deployment). A real-browser spot-check would close both.
- **Medium:** mcpmarket (real-Chrome DOM only), himcp (dofollow seen, submission path unknown).
- rel attributes are registry-side policy and can change any day; DataForSEO rank ≠ Ahrefs DR (mcp.so's "DR 72" marketing uses Ahrefs; on our consistent scale it's 363/1000, below smithery's 457).
- Dofollow directory links are weaker signals to Google than editorial links — this whole lane complements, not replaces, the editorial/placement lane (CzechCrunch, Pragmatic Engineer).

## Execution order (all free)

1. ✅ smithery.ai — done, live, dofollow.
2. pulsemcp.com — submit + claim (form, 10 min).
3. mcpservers.org — submit with URL = https://www.marian.coach/mcp (form, 5 min).
4. cursor.directory + windsurf.run — one account, submit with URL = marian.coach/mcp (15 min).
5. lobehub.com — submit via GitHub-import + homepage field (10 min).
6. aiagentslist.com — submit (10 min).
7. mcpserverfinder.com — check auto-pickup of the repo; submit if absent (5 min).
8. claude.com Connectors — prep the review packet (docs URL, privacy policy, icon, test instructions) — the one that needs real prep; highest domain of the attainable set.
9. hub.docker.com — single PR attempt to docker/mcp-registry (remote-server type), timebox 30 min.
10. Log each landed link in `~/ai/business/mc/backlinks/backlink-targets-2026.md` § Progress log as T8/#53.
