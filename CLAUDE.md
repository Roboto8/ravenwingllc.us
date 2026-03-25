# CLAUDE.md - AI Assistant Guide for RavenWing LLC / FenceCalc

## Project Overview

FenceCalc is a satellite-powered fence estimating SaaS application built on AWS Serverless architecture. It enables fence contractors to create, manage, and share fence estimates with customers.

**Stack:** AWS Lambda (Node.js 18.x), DynamoDB, Cognito, S3, SES, Stripe, vanilla JS frontend (PWA).

## Repository Structure

```
ravenwingllc.us/
├── handlers/              # AWS Lambda functions
│   ├── lib/              # Shared libraries (auth, db, response, stripe, notify)
│   ├── estimates.js      # Estimate CRUD
│   ├── approval.js       # Estimate sharing/approval flow
│   ├── billing.js        # Stripe checkout, portal, status
│   ├── company.js        # Company profile management
│   ├── team.js           # Team management & invitations
│   ├── roles.js          # RBAC & custom permissions
│   ├── photos.js         # S3 photo upload/delete
│   ├── notifications.js  # User notifications
│   ├── reports.js        # Dashboard analytics
│   ├── auth.js           # Cognito post-confirmation
│   ├── webhook.js        # Stripe webhook handler
│   ├── email-forwarder.js
│   └── trial-reminder.js
├── client/
│   ├── dist/             # Production frontend (deployed to S3)
│   └── preview/          # Dev/staging frontend (deployed to S3)
│       ├── js/           # app.js, api.js, auth.js, bom.js, config.js, i18n.js, regions.js
│       ├── css/
│       └── *.html        # index, landing, approve, privacy, terms, etc.
├── tests/                # Jest test suites (1010+ tests, 46 suites)
│   ├── helpers/mock-db.js
│   ├── integration/
│   └── *.test.js
├── android/              # TWA build for Play Store
├── scripts/              # Utility/migration scripts
├── serverless.yml        # Full AWS infrastructure definition (Lambda, DynamoDB, Cognito, S3, IAM)
├── jest.config.js
└── package.json
```

## Commands

```bash
npm test                    # Run all tests
npm run test:coverage       # Run tests with coverage report
npm run test:watch          # Watch mode
npm run deploy:dev          # Deploy frontend to dev S3
npm run deploy:prod         # Deploy frontend to prod S3 + CloudFront invalidation
npm run deploy:backend      # Deploy Lambda functions (dev)
npm run deploy:backend:prod # Deploy Lambda functions (prod)
npm run deploy:all          # Full dev deployment
```

## Handler Pattern

All Lambda handlers follow this pattern:

```javascript
module.exports.handlerName = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!await checkPermission(event, companyId, 'permission.name')) {
    return res.forbidden();
  }
  const body = res.parseBody(event);
  if (!body) return res.bad('Invalid JSON');
  // Business logic...
  return res.ok(data);
});
```

- `res.wrap()` provides global error handling and consistent responses
- `auth.getCompanyId()` extracts company from Cognito JWT via GSI lookup
- All responses include security headers (nosniff, DENY, HSTS)

## DynamoDB Data Model

Single-table design with composite keys:

| Entity     | PK                | SK                        | GSI1PK            | GSI1SK            |
|------------|-------------------|---------------------------|--------------------|-------------------|
| Company    | `COMPANY#{id}`    | `PROFILE`                 | -                  | -                 |
| User       | `COMPANY#{id}`    | `USER#{sub}`              | `USER#{sub}`       | `COMPANY#{id}`    |
| Estimate   | `COMPANY#{id}`    | `EST#{timestamp}#{id}`    | -                  | -                 |
| Invitation | `COMPANY#{id}`    | `INVITE#{token}`          | `INVITE#{token}`   | -                 |
| Stripe     | -                 | -                         | `STRIPE#{custId}`  | `PROFILE`         |

All queries are company-scoped via PK to enforce tenant isolation.

## Security Model

- **Tenant isolation:** Every query scopes to `PK: COMPANY#{companyId}` - never bypass this
- **RBAC:** Custom roles with granular permissions checked on every endpoint
- **Cursor pagination:** Base64-encoded cursors validated against query partition to prevent enumeration
- **Stripe webhooks:** Signature verification required
- **Secrets:** Stored in AWS Systems Manager Parameter Store, never hardcoded
- **Email normalization:** Gmail alias/dot normalization to prevent trial abuse

## Tier System

- **Free:** 2 estimates/month + 1 bonus for sharing
- **Builder:** Unlimited estimates
- **Contractor:** Full features + team management

## Testing Conventions

- Jest 29.7.0 with Node.js environment
- Mock DynamoDB via `jest.fn()` - tests mock the entire `db` module
- Helper: `tests/helpers/mock-db.js` for common DynamoDB mocks
- Coverage: 94%+ statements, 90%+ branches, 97%+ lines
- Coverage collected from `handlers/**/*.js` and `client/preview/js/bom.js`

## Deployment

| Environment | Source Dir        | S3 Bucket                   | Stage |
|-------------|-------------------|-----------------------------|-------|
| Dev         | `client/preview/` | `ravenwingllc-frontend-dev` | dev   |
| Prod        | `client/dist/`    | `ravenwing-frontend`        | prod  |

Infrastructure defined in `serverless.yml` (Serverless Framework).

## Key Dependencies

- **stripe** ^17.0.0 (production)
- **@aws-sdk/*** v3 (DynamoDB, S3, SES, S3 Presigner)
- **jest** ^29.7.0
- **serverless-finch** ^4.0.4 (S3 deployment)

## Commit Convention

Descriptive, action-oriented messages: `[Verb] [component]: [description]`

Examples:
- `Fix estimate panel clipping: remove min-width, add overflow-x hidden`
- `Add tests for uncovered branches in dynamo, company, roles, and team`
- `Change free tier to 2 estimates/month + share bonus system`

## Important Notes

- Frontend is vanilla JavaScript with no framework - maintain this simplicity
- Two separate frontend directories: `preview/` (dev) and `dist/` (prod)
- DynamoDB uses PAY_PER_REQUEST billing
- Lambda timeout is 15 seconds (email-forwarder and trial-reminder have custom timeouts)
- Always run `npm test` before committing handler changes
