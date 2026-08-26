# PostHog Self-driving Setup Report — GYJN

**Date:** 2026-08-26  
**Project:** gyjn-app (PostHog project 257860)

## Summary

PostHog Self-driving was configured for GYJN, a React Native job-matching mobile app. Session Replay, Error Tracking, and Support (Conversations) products were enabled; six native signal sources were wired to the inbox; a focused six-scout troop (including one custom scout for job-feed engagement) was deployed; and two Replay Vision scanners were created to monitor for on-screen breakage and user frustration. Findings will start appearing in the [Self-driving inbox](https://eu.posthog.com/project/257860/inbox) within approximately 30 minutes.

---

## AI data processing

Approved — organization-level AI data processing consent was enforced before this run started.

---

## GitHub

**Connected during this run.** Integration id: 80192 (account: Demmyyoung). Self-driving can now research findings against the repository and open fix PRs.

---

## Products enabled

| Product | Status | Notes |
|---|---|---|
| Session Replay | **Enabled** (server flip done) | React Native — inert until the SDK is configured for mobile session capture. See follow-ups. |
| Error Tracking | **Enabled** (server flip done) | React Native — inert until `capture_exceptions` is enabled in the SDK. See follow-ups. |
| Support (Conversations) | **Enabled** | Tickets only arrive once an inbound channel (email / inbox / Slack) is connected. See follow-ups. |

This is a pure React Native mobile app (`posthog-react-native` SDK) — no `posthog-js` init to audit. Server-side product flips are on; SDK-side configuration is a follow-up for each product.

---

## Signal sources

| Source product | Source type | Action |
|---|---|---|
| `health_checks` | `health_issue` | **Enabled** (new) |
| `error_tracking` | `issue_created` | **Enabled** (new) |
| `error_tracking` | `issue_reopened` | **Enabled** (new) |
| `error_tracking` | `issue_spiking` | **Enabled** (new) |
| `session_replay` | `session_analysis_cluster` | **Enabled** (new, sample_rate: 0.1 server default) |
| `conversations` | `ticket` | **Enabled** (new, dormant until inbound channel connected) |
| `signals_scout` | `cross_source_issue` | **ON by default** — no row needed |
| `replay_vision` | — | **Self-authorizing** — `emits_signals: true` on each scanner is the per-source config; no row needed |
| `llm_analytics` | — | **Skipped** — internal-only, not a user-facing responder |
| `logs` | — | **Skipped** — not a v1 responder |

---

## Connected tools

No external tools were selected. All connected-tool sources are "not used" — no responders, no follow-ups.

---

## Scout troop

**6 scouts enabled / 22 disabled.** Run budget: 100 runs/day (early access default, verified via `scout-metadata-get`). Banner: *"Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more."*

### Enabled

| Scout | Why enabled |
|---|---|
| `signals-scout-general` | Always on — cross-product correlations and surfaces no specialist covers |
| `signals-scout-product-analytics` | GYJN tracks a rich funnel (signup → onboarding → job_viewed → job_applied → premium); watches saved funnels for conversion regressions |
| `signals-scout-feature-flags` | Feature flags are preloaded (`preloadFeatureFlags: true`) and flag events sent; flag health is a live surface |
| `signals-scout-anomaly-detection` | Cross-product baseline watcher for a project with growing event volume |
| `signals-scout-health-checks` | Watches PostHog's own health issues — highly actionable right after a fresh setup |
| `signals-scout-job-engagement` *(custom)* | Watches `job_applied` / `job_skipped` / `job_viewed` ratios for apply-rate regressions not covered by any built-in scout (see Custom scouts below) |

### Disabled (notable)

| Scout | Reason |
|---|---|
| `signals-scout-error-tracking` | **Covered by native source** (`error_tracking / issue_*`) — not a re-enable follow-up |
| `signals-scout-session-replay` | **Covered by native source** (`session_replay / session_analysis_cluster`) — not a re-enable follow-up |
| `signals-scout-experiments` | No active A/B experiments — enable when experiments are running |
| `signals-scout-surveys` | No PostHog surveys in use |
| `signals-scout-revenue-analytics` | No Stripe or payment SDK connected to PostHog |
| `signals-scout-web-analytics` | Mobile-only app — no web traffic |
| `signals-scout-web-vitals` | Mobile-only app — no Core Web Vitals |
| `signals-scout-ai-observability` | No `$ai_*` events or LLM SDK detected |
| `signals-scout-logs` | PostHog logs product not in use |
| `signals-scout-csp-violations` | Mobile app — no Content Security Policy |
| `signals-scout-customer-analytics` | B2C consumer app — no group/account analytics |
| `signals-scout-inbox-validation` | Fresh setup — no shipped fixes to validate yet |
| All others | Not applicable to this project |

To suppress noise if a scout fires unexpectedly: set `emit: false` on its config in PostHog to switch it to dry-run without disabling it.

---

## Custom scouts

**1 created, 0 declined.**

### `signals-scout-job-engagement`

- **What it watches:** The `job_applied`, `job_skipped`, and `job_viewed` event ratios — specifically the apply rate (`job_applied / (job_applied + job_skipped)`) computed daily.
- **Discriminator:** A drop of >15 percentage points below the 7-day rolling baseline, sustained across ≥2 consecutive days with ≥30 total swipes/day, triggers investigation. Single-day dips with < 30 swipes are disqualified as noise.
- **Explore patterns:** (1) daily apply-rate trend over 14 days, (2) category breakdown to isolate which job vertical degraded, (3) match score distribution shift on `match_percent` to detect matching algorithm regression.
- **Why no built-in covers it:** `signals-scout-product-analytics` only watches *saved* funnel insights (none exist yet on this fresh project, and even once created they won't compute raw apply/skip ratios by category and match score). No canonical scout watches domain-specific swipe-engagement ratios.
- **Surfaces considered and ruled out:**
  - *Onboarding funnel* — ruled out: `signals-scout-product-analytics` will cover this once funnels are saved, so a custom scout would duplicate it.
  - *Premium conversion* — ruled out: only two events (`premium_viewed` → `premium_purchase_initiated`), no confirmed purchase event; too sparse for a meaningful scout.
  - *Sentry error correlation* — ruled out: Sentry data doesn't flow into PostHog; not watchable.
- **Noise escape hatch:** Set `emit: false` on this scout's config in PostHog to switch it to dry-run if it becomes noisy.

---

## Replay Vision scanners

Scanners are LLM-based agents that watch individual session recordings on a schedule and push findings into the Self-driving inbox when a genuine product defect is found. Findings arrive at **half weight** — a single scanner's finding needs corroboration (from a second scanner or another signal) before it's promoted into a full report. This project has **no recordings yet** — both scanners are armed and start working the day recordings begin, with no second setup.

| Scanner | Type | Query scope | Sampling | Model | Est. monthly credits | Status |
|---|---|---|---|---|---|---|
| GYJN job application failures | monitor | Mobile recordings (`snapshot_source = mobile`) | 50% | gemini-3-flash-preview | 0 (no recordings yet) | **Created** |
| GYJN swipe and form frustration | monitor | Sessions with `$rageclick` events | 100% | gemini-3-flash-preview | 0 (no recordings yet) | **Created** |

**Breakage monitor** watches for: blank/empty swipe feed, silent apply failures with no match confirmation, premium screen not showing subscription options, onboarding steps not advancing after submission, spinners that never resolve, job cards with missing data.

**Frustration monitor** watches for: repeated taps on unresponsive job cards, hammering the login/signup button during hangs, retrying CV upload after silent failure, repeated Premium button taps when the purchase flow doesn't open.

**Note on mobile URL scope:** This is a React Native app — web URL-based filtering (`$current_url`) doesn't apply. The breakage monitor instead scopes to `snapshot_source = mobile`, which captures all mobile sessions. Once recordings arrive, you can add a `$screen_name` filter to narrow to the SwipeScreen or OnboardingScreen once you've confirmed which property name the SDK uses.

---

## Follow-ups

- [ ] **Enable mobile session replay in the SDK.** The server product flip is done, but `posthog-react-native` needs explicit session capture configuration. See [PostHog React Native session replay docs](https://posthog.com/docs/session-replay/installation?tab=React+Native) to add `enableSessionReplay: true` to your PostHog init config.
- [ ] **Enable mobile exception capture in the SDK.** The error tracking product is on server-side. To capture exceptions via PostHog (alongside Sentry), add `captureExceptions: true` to your PostHog init in `src/config/posthog.js`.
- [ ] **Connect a Conversations inbound channel.** The Support product and its signal source are enabled but the `conversations/ticket` source stays dormant until an email, inbox, or Slack channel is connected in PostHog Settings → Conversations.
- [ ] **Create saved funnels and retention insights in PostHog.** The `signals-scout-product-analytics` scout watches *saved* insights — build funnel insights for your key flows (signup → onboarding → job_applied → premium) so the scout has something to watch. [PostHog insights](https://eu.posthog.com/project/257860/insights).
- [ ] **Enable `signals-scout-experiments` when you start running A/B tests.** Turn it on in the PostHog inbox settings.
- [ ] **Enable `signals-scout-revenue-analytics` if you connect Stripe.** Connect Stripe as a warehouse source first, then enable this scout.
- [ ] **Add `$screen_name` filter to the breakage Replay Vision scanner** once recordings confirm the property name used by `posthog-react-native` for screen tracking. Update scanner id `01a03bf4-f37b-7758-a1c4-3f66c9a87059` via `vision-scanners-update`.
- [ ] **Sentry integration.** Sentry is used heavily (`@sentry/react-native`) for error tracking. To get Sentry errors into the Self-driving inbox, connect Sentry as a warehouse source in [PostHog pipeline sources](https://eu.posthog.com/project/257860/pipeline/new/source) and enable the `sentry / issue` signal source.

---

## What happens next

- The scout coordinator picks up fresh configs within ~30 minutes; the first scans fire then.
- Each enabled scout draws 1 run/day from the project's 100-run daily budget (early access).
- Findings cluster into reports in the [Self-driving inbox](https://eu.posthog.com/project/257860/inbox).
- Immediately-actionable reports (instrumentation gaps, apply-rate regressions, flag health issues) can trigger coding tasks automatically.
- Replay Vision scanners start observing mobile recordings the day recordings begin — no second setup needed.
