# Registration manual — the 5 items only Marian can finish

Everything here was live-verified via Claude-in-Chrome on 2026-08-09, not carried forward from a stale audit. Two items turned out different from how they were originally described — flagged inline.

---

## 1. Glama — claim the eng-leadership-toolkit listing (2 minutes)

**URL:** https://glama.ai/mcp/servers/marian-kamenistak/ai-engineering-leader-toolkit

**Steps:**
1. Open the URL above.
2. Click **Claim** (next to your name, top of the listing).
3. Click **Login with GitHub to claim**.
4. GitHub shows a consent screen: *"Glama AI wants access to your GitHub account."* Scopes requested: `read:user`, `user:email`, `read:org` — read-only, no write access to any repo. Safe to authorize.
5. Click **Authorize**. GitHub has a several-second delay before the button responds (anti-bot measure) — if it looks unresponsive, wait ~10 seconds and click again.
6. You'll land back on Glama with the listing claimed.

**Why it's worth doing:** unlocks an editable description, Docker build config, and review notifications. I got to step 4 and clicked Authorize four times across 10+ seconds — GitHub didn't register the automated click. This needs your real click.

---

## 2. cursor.directory / windsurf.run — needs a decision first, not just a click

**This surface changed since the last audit (2026-07-22).** It used to be a free-text "paste your homepage URL" form. As of 2026-08-09 it's a GitHub-repo scanner under the **Open Plugins standard**: you paste a repo URL, it scans the repo root for one of `.mcp.json`/`mcp.json`, `rules/*.mdc`, `skills/*/SKILL.md`, `agents/*.md`, `commands/*.md`, `hooks/hooks.json`, `.lsp.json`, and lists whatever it finds. There is no field to just submit a homepage link anymore.

I tested it live against `github.com/marian-kamenistak/ai-engineering-leader-toolkit` (our MCP server repo) — result: *"No plugin components found in: repo root."* None of our repos match the expected layout:
- **MCP server repos** (`ai-engineering-leader-toolkit`, `elc-toolkit`) have a `server.json` (the official MCP registry format) but no `.mcp.json` (Open Plugins' own format).
- **Skill repos** (`leadership-ratio-benchmark`, `partnership-business-case-builder`, `community-launch-readiness`, and the others) have `SKILL.md` at the **repo root**, not nested under `skills/<name>/SKILL.md` the way Open Plugins expects.

**The decision, not something I should make silently:** the skill-repo layout Open Plugins wants (`skills/<name>/SKILL.md`) directly conflicts with `ai-skill-launch`'s own rule that `SKILL.md` must sit at repo root so aggregators like skillsmp.com index it. Restructuring for cursor.directory would break that. Three options:

| Option | Effort | Trade-off |
|---|---|---|
| **A. Add a root `.mcp.json`** to the MCP server repos only, skip cursor.directory for the individual skill repos | Low — `.mcp.json` is a real, useful MCP-standard manifest anyway | Gets the 2 MCP servers listed there; the 6 individual skills stay unlisted on this one surface |
| **B. Restructure skill repos** to `skills/<name>/SKILL.md` | Medium, touches every skill repo | Breaks the repo-root convention other aggregators rely on — likely net negative |
| **C. Skip cursor.directory entirely** | None | It's rank 295 in the DataForSEO table — real but not top-tier; other Tier 1 registries cover more ground |

My read: **Option A** is the only one with a clean cost/benefit — worth doing for the 2 MCP servers, not worth restructuring 6 skill repos for. Your call.

**windsurf.run** shares cursor.directory's platform/account — very likely the same Open Plugins scanner now, but I didn't re-test it live (only cursor.directory was checked directly). Assume the same until verified.

---

## 3. agensi.io — correction: this is NOT a new-account signup anymore

**The original framing was wrong — checked live 2026-08-09.** An agensi.io account already exists and is logged in (shows "marian" top-right, 9+ notifications). There's even an **unrelated draft already sitting in the submit form** — a "community partnership builder" skill (Full Description: *"Build and price a partnership with Engineering Leaders Community... Free, MIT licensed"*), saved but not submitted. That's from earlier work on the ELC Partnership Builder, not something I touched today.

So the actual remaining step for our 3 new ELC skills (or any skill) is just filling out and submitting the form — no signup involved.

**URL:** https://www.agensi.io/dashboard/submit

**Steps per skill:**
1. Zip the skill repo locally (must contain `SKILL.md` at the root — ours already do).
2. Go to the URL above, click into a fresh submission (or use the "+ New" option if the existing draft is in the way).
3. **Step 1 — Skill ZIP Upload:** drag the zip in. It auto-populates fields from the `SKILL.md` frontmatter.
4. **Step 2 — Skill Details:** verify the auto-filled Skill Name, Summary, Full Description read correctly (they come straight from your frontmatter/body).
5. **Step 3 — Compatibility:** the "Universal SKILL.md Standard" box is pre-checked — leave it, it's accurate (works with Claude Code, Codex CLI, Cursor, VS Code Copilot, Gemini CLI).
6. **Tags & Discovery, Permissions, Extra Details, FAQ** — all marked "Recommended," not required. Fill what's quick, skip what isn't.
7. **Make your listing stand out:** a square logo (512×512 recommended) and up to 6 screenshots noticeably increase installs per their own copy. We don't have these prepared yet for the 3 new skills — see note below.
8. No separate pricing toggle was visible in the flow — the free/MIT status is stated in the description text itself. Don't assume a price gets set by default; verify before submitting.
9. Click **Submit for Review** — admin review takes 24-48 hours.

**Prep gap:** none of the 3 new skill repos (`leadership-ratio-benchmark`, `partnership-business-case-builder`, `community-launch-readiness`) have a logo or screenshot yet — that's a real, separate task (the README-visuals gap `ai-skill-launch` now documents), not something to rush through the agensi form without.

**Also worth doing:** that orphaned "community partnership builder" draft — either finish and submit it, or discard it if it's stale. Your call, I didn't touch it.

---

## 4. claude.com Connectors Directory — packet ready, two blockers already resolved

Full packet: `_4MC/mcp/eng-leadership-toolkit/connectors-directory-packet.md` (drafted 2026-07-22). I re-checked its blockers against the live server today — **two of the three are already fixed**, the packet itself is stale on this point:

- ~~Blocker 2 (tool annotations)~~ — **already fixed.** Checked `src/index.ts` directly: all 9 tools carry `readOnlyHint: true` + the full annotation set via a shared `READ_ONLY` object. Nothing to do here.
- ~~Blocker 3 (icon)~~ — **converted for you.** PNG export of the 192px favicon is at `/private/tmp/claude-501/.../scratchpad/marian-coach-icon-192.png` (300×300, RGBA) — grab it before it's cleaned up, or re-export from `_4MC/web/mc-web/public/favicon-192x192.webp` if it's gone.
- Blocker 1 (plan gate) — **still real, still yours to check.** The submission portal only exists for Team/Enterprise Claude orgs, Owner role only. Verify your claude.ai org's plan before anything else — if it's Pro/individual, there's no submit path at all and this whole item is moot until that changes.

**Steps once the plan gate clears:**
1. Log into claude.ai as the org-admin/Owner account.
2. Go to `https://claude.ai/admin-settings/directory/submissions/new`.
3. Walk the 11-step form using the prefilled values already in the packet file (server URL, tagline, description, categories, privacy policy URL, etc. — all still accurate).
4. Test each of the 9 tools once via Settings → Connectors → Add custom connector → `https://www.marian.coach/mcp`, before the portal's "Test & launch" step asks you to confirm you did.
5. Submit. Track status at `https://claude.ai/admin-settings/directory/submissions`.

This is the highest-authority registry in the whole set (DataForSEO rank 590) — worth the ~20 minutes once the plan gate is confirmed clear.

---

## 5. PulseMCP — homepage-field fix, no self-serve path found

**Listing:** https://www.pulsemcp.com/servers/marian-coach-eng-leadership-toolkit

**The problem:** the "Learn More" button links to bare `https://www.marian.coach` instead of `https://www.marian.coach/mcp` or the companion page. Confirmed live via `read_page` on the actual anchor tag.

**What I checked and ruled out:** there is no visible "claim," "edit," "suggest a change," or account/login control anywhere on the listing page (checked via a targeted DOM search, not just eyeballing it). The `server.json`-sourced fields (name, repo URL, version, tool list) auto-resync from GitHub on their own — that's presumably why those are already correct — but the homepage link is a separately-set field with no found self-serve fix.

**Recommended action:** email them directly. Suggested draft:

> Subject: Fix homepage link — Engineering Leadership Toolkit listing
>
> Hi PulseMCP team,
>
> Our listing at pulsemcp.com/servers/marian-coach-eng-leadership-toolkit has a "Learn More" link pointing to https://www.marian.coach — could you update it to https://www.marian.coach/mcp (or https://www.marian.coach/ai-coaching-tools/)? That's the actual page the server's `server.json` websiteUrl field points to.
>
> Thanks,
> Marian Kamenistak

No email address found on the listing page itself — check their site footer/contact page or `hello@pulsemcp.com` (unverified guess, confirm before sending).

---

## Summary — what actually needs your click vs. your decision

| Item | Type | Time |
|---|---|---|
| Glama claim | One real click (automation-blocked) | 2 min |
| Connectors Directory | Plan-gate check, then a real submission flow | ~20 min once cleared |
| PulseMCP fix | Send one email | 5 min |
| agensi.io | Real submission per skill (not a signup) | ~10 min/skill, need logo/screenshot first |
| cursor.directory/windsurf.run | **Decision needed** (Option A/B/C above), then execution | Decision first, then 15 min if Option A |
