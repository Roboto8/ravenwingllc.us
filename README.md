# RavenWing LLC

Company website for **RavenWing LLC** — hosted on AWS S3 via Serverless Framework.

## Project Structure

```
client/
  dist/       # Production-ready static site
  preview/    # Dev/preview version for experimentation
serverless.yml  # Serverless Framework config (AWS S3 hosting via serverless-finch)
```

## Prerequisites

- [Node.js](https://nodejs.org/)
- [Serverless Framework](https://www.serverless.com/) (`npm install -g serverless`)
- AWS credentials configured

## Setup

```bash
npm install
```

## Deployment

### Preview (dev)

Deploys `client/preview/` to the `ravenwingllc-frontend-dev` S3 bucket:

```bash
npm run deploy:dev
```

### Production

Deploys `client/dist/` to the `ravenwingllc-frontend-prod` S3 bucket:

```bash
npm run deploy:prod
```

## Environments

| Environment | Source             | S3 Bucket                    |
|-------------|--------------------|------------------------------|
| Dev         | `client/preview/`  | `ravenwingllc-frontend-dev`  |
| Prod        | `client/dist/`     | `ravenwingllc-frontend-prod` |
