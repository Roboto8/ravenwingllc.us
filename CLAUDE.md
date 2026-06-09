# RavenWing LLC / FenceCalc

Two things live in this repo:

1. **Company static site** — `client/dist/` (prod) and `client/preview/` (dev), deployed to S3 via serverless-finch, CloudFront in front (prod distribution `E2Q8DG4LT7KL3`).
2. **FenceCalc** — fence-estimation SaaS backend: Lambda handlers in `handlers/` (estimates, billing via Stripe, auth, teams/roles, photos, reports, approval flow, trial reminders, email forwarding), DynamoDB table `fencecalc-<stage>`, assets bucket `fencecalc-assets-<stage>`. There's also an `android/` client (excluded from deploy packaging).

## Commands

```bash
npm test                      # jest (tests/), run before pushing
npm run deploy:dev            # static site → ravenwingllc-frontend-dev bucket
npm run deploy:prod           # static site → prod bucket + CloudFront invalidation
npm run deploy:backend        # serverless deploy --stage dev
npm run deploy:backend:prod   # serverless deploy --stage prod
```

No CI — deploys are manual from this machine. AWS region us-east-1, Serverless dashboard org `portertoddc`.

## Gotchas

- `serverless.yml` packaging excludes `android/`, `client/`, `tests/` from the Lambda bundle — keep backend code out of those dirs.
- Stripe is live in `handlers/billing.js` / `handlers/webhook.js` — treat changes there as production-money code; never log payloads containing customer data.
- Prod static deploy invalidates CloudFront `/*` — safe but takes a few minutes to settle.
