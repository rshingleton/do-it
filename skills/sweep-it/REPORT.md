# Sweep report

Plain words, short sentences. The reader may not know this code; explain a
technical term the first time it appears.

```markdown
# Sweep: <scope> (<ISO date>)

What this code does: <two or three sentences>. Load assumed: <...>.
Read: <areas>. Not read: <areas>.

## Findings

### Must
1. **Retries double-charge on timeout** (`payments/client.ts:88-104`)
   - **What this is:** The payment client retries any request that times out.
   - **Problem:** A charge that succeeded upstream but answered slowly is sent
     again with no idempotency key, so the card is charged twice.
   - **Fix:** Send the order id as the idempotency key on every attempt.
   - **If we skip it:** Customers see duplicate charges whenever the gateway is slow.

### Should
2. ...

### Nice
3. ...

<K> smaller findings left out.

## Test recommendations

| ID | Target | Level | Why | Effort |
|----|--------|-------|-----|--------|
| TR-1 | Payment retry | integration | Finding 1 has no test that fails | S |

## Shortcut ledger

| Location | Limit | Upgrade when | Tag |
|----------|-------|--------------|-----|
| `src/upload.ts:42` | whole file in memory | inputs pass 50 MB | |
| `src/cache.py:17` | cache never expires | (none) | no-trigger |

## Architecture notes

- `src/orders/OrderFacade.ts`: pass-through over `OrderService`; deletion
  test moves nothing. Worth `/deepen-it src/orders`.

Verdict: <healthy | fix 1 and 4 first>.
Lean: -<N> lines, -<M> dependencies possible.
Not checked: <...>
```

Must: a bug, security hole, data-loss path, or breakage at the assumed load.
Should: risky code without a test, real slowness, duplication, code that
should not exist. Nice: small speed-ups, shorter forms. Skip empty groups and
empty sections. Nothing found: "Healthy. Nothing to fix." and what was
checked.
