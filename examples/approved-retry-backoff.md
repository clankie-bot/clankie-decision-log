# Back off webhook retries exponentially

- **Status:** Approved
- **Decision:** `dec-2026-11-07-retry-backoff` revision 2
- **Source revision:** `3f9c2e1`
- **Actor:** Webhook worker (agent, worker-7)
- **Updated:** 2026-11-07T21:10:00Z
- [issue: EX-42](<https://example.com/issues/EX-42>)
- [change: PR 118](<https://example.com/pulls/118>)

## What changed

Webhook delivery retries now wait 1s, 2s, 4s up to 60s with jitter, instead of retrying every second.

- `src/webhooks/retry.ts`
- `test/webhooks/retry.test.ts`

## Why

Fixed one-second retries hammered a recovering receiver and tripped its rate limit, which extended the outage.

Supported by:

- ask: owner ask, Nov 7 — “stop us from making their outage worse”

### Alternatives considered

- **Keep fixed retries and cap attempts at 5** — Simpler, but drops deliveries during any outage longer than five seconds.
- **Queue failed deliveries for manual replay** — No load on the receiver, but needs a person for every outage.

## Evidence

| Evidence | Kind | Outcome | Summary |
| --- | --- | --- | --- |
| [unit](<https://example.com/runs/981#unit>) | check | pass | Retry schedule unit tests, 14 passed. |
| [outage-replay](<https://example.com/evidence/outage-replay.mp4>) | recording | pass | Replayed last week's receiver outage: peak request rate fell from 60/min to 9/min. — **replay, not live proof** |

## Limits

- **untested:** Not exercised against a receiver that returns Retry-After headers.
- **assumption:** Receivers tolerate up to 60 seconds of delivery delay.

## Approval

**Approved** by owner (human) at 2026-11-07T21:10:00Z, for revision 2 at `3f9c2e1`.

> Ship it; follow up on Retry-After.
