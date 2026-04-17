# Test Coverage Analysis

## Summary

**1,010 tests passing** across **46 test suites** (3 suites failing due to missing `puppeteer-core` dependency).

### Overall Coverage

| Metric     | Coverage |
|------------|----------|
| Statements | 94.54%   |
| Branches   | 90.53%   |
| Functions  | 96.92%   |
| Lines      | 97.37%   |

---

## Current Coverage by File

### Fully Covered (100% lines)

These files have excellent coverage across all metrics:

- `handlers/auth.js`
- `handlers/email-forwarder.js`
- `handlers/reports.js`
- `handlers/trial-reminder.js`
- `handlers/lib/auth.js`
- `handlers/lib/notify.js`
- `handlers/lib/response.js`
- `handlers/lib/stripe.js`
- `client/preview/js/bom.js`

### Well Covered (95-99% lines)

- `handlers/notifications.js` — 100% lines, 93.75% branches (line 25 uncovered branch)
- `handlers/photos.js` — 100% lines, 96.29% branches (line 41 uncovered branch)
- `handlers/roles.js` — 100% lines, 89.13% branches (11 uncovered branch conditions)
- `handlers/team.js` — 100% lines, 88.23% branches (lines 36-39, 69, 81 uncovered branches)
- `handlers/billing.js` — 99.16% lines, 87.05% branches (line 48)
- `handlers/estimates.js` — 98.68% lines, 92.03% branches (lines 284-285)
- `handlers/webhook.js` — 97.5% lines, 97.91% branches (lines 166-167)
- `handlers/approval.js` — 97.05% lines, 88.04% branches (lines 105, 112)

### Needs Improvement

- **`handlers/company.js`** — 88.88% lines, 87.17% branches (lines 49, 57-60, 67)
- **`handlers/lib/dynamo.js`** — 63.26% lines, 40.62% branches, 72.72% functions (lines 73-111)

---

## Recommended Improvements

### 1. `handlers/lib/dynamo.js` — HIGH PRIORITY

**Current:** 63% lines, 41% branches, 73% functions

This is the **lowest-covered file** in the project and the shared database layer used by every handler. Lines 73-111 are completely untested, covering two functions:

- **`findById(pk, skPrefix, id)`** (lines 72-89) — Paginated search by ID. No tests exist for:
  - Finding an item on the first page
  - Finding an item on a subsequent page (pagination)
  - Returning `null` when item doesn't exist
  - Empty result sets

- **`queryFiltered(pk, skPrefix, filterExpr, filterValues, ...)`** (lines 91-115) — Filtered queries with cursor pagination. No tests exist for:
  - Basic filtered query
  - Filtered query with pagination cursor
  - Invalid/tampered cursor handling (security-relevant — same cross-tenant protection as `query()`)
  - `filterNames` parameter usage
  - Empty result sets

**Why it matters:** These functions handle data access patterns used across the app. Bugs here could cause data leaks between tenants or silent pagination failures.

### 2. `handlers/company.js` — MEDIUM PRIORITY

**Current:** 89% lines, 87% branches

Uncovered areas (lines 49, 57-60, 67):
- String field length validation exceeding 500 characters (line 49)
- Pricebook size validation — oversized pricebook data (lines 57-60)
- Invalid/non-serializable pricebook data (line 60)
- accentColor hex format validation (line 67)

**Why it matters:** These are input validation paths. Missing tests mean malformed user input could bypass validation without detection in CI.

### 3. Branch Coverage Gaps in `roles.js` and `team.js` — MEDIUM PRIORITY

Both have 100% line coverage but ~88-89% branch coverage, meaning conditional branches are only exercised in one direction.

- **`roles.js`** (11 uncovered branches at lines 49, 68, 73, 94, 100, 113, 127, 150-153, 178) — Permission check edge cases likely missing negative/deny path tests.
- **`team.js`** (lines 36-39, 69, 81) — Team membership edge cases.

**Why it matters:** RBAC and team access control are security-critical. Untested branches could allow privilege escalation.

### 4. Fix Broken Puppeteer Tests — MEDIUM PRIORITY

3 test suites fail because `puppeteer-core` is not in `devDependencies`:

- `tests/tier-protection.test.js`
- `tests/delete-mode.test.js`
- `tests/responsive/screen-sizes.test.js`

These also hardcode a Windows Chrome path (`C:\Program Files\Google\Chrome\Application\chrome.exe`), making them non-portable.

**Recommendations:**
- Add `puppeteer-core` (or `puppeteer`) to `devDependencies`
- Use environment variables or auto-detection for Chrome path
- Consider separating E2E tests into a distinct Jest project/config so unit tests can run independently

### 5. Frontend Coverage — LOW PRIORITY (but notable gap)

Only `client/preview/js/bom.js` is included in coverage collection. Six frontend files are excluded entirely:

| File | Purpose | Testability |
|------|---------|-------------|
| `api.js` | API client | Could test request building, error handling |
| `app.js` | Main app logic | Would need DOM mocking (jsdom) |
| `auth.js` | Frontend auth | Could test token management, session logic |
| `config.js` | Configuration | Could test config defaults, overrides |
| `regions.js` | Region data | Could test data structure, lookups |
| `sw.js` | Service worker | Would need service worker mocking |

**Recommendation:** At minimum, add `api.js`, `auth.js`, and `config.js` to the `collectCoverageFrom` array in `jest.config.js` and write unit tests for their pure logic. DOM-dependent code (`app.js`, `sw.js`) would require a `jsdom` test environment and is lower priority.

### 6. Integration Test Expansion — LOW PRIORITY

The 7 existing integration tests cover core workflows well. Potential additions:
- **Photo upload + estimate attachment flow** — Photos are a key feature but only tested in isolation
- **Billing state transitions** — Test webhook-driven subscription changes flowing through to feature gating
- **Email forwarding end-to-end** — Verify the full SES receive → forward chain

---

## Quick Wins (Effort vs Impact)

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 1 | Test `dynamo.js` `findById` and `queryFiltered` | Low | High — covers the biggest coverage gap |
| 2 | Test `company.js` validation branches | Low | Medium — input validation |
| 3 | Add branch tests for `roles.js` deny paths | Low | High — security critical |
| 4 | Fix puppeteer dependency and Chrome path | Low | Medium — fixes 3 broken suites |
| 5 | Add `team.js` branch tests | Low | Medium — access control |
| 6 | Add frontend files to coverage config | Medium | Low — visibility improvement |
