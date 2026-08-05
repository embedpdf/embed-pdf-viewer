# Documentation feedback setup

The feedback widget posts to `/api/docs/feedback`. The route validates and rate-limits the
request, then writes it to Postgres through Neon's serverless driver. Database credentials are
server-only.

## Recommended environment layout

| Vercel environment | Neon target                                           | Data                           |
| ------------------ | ----------------------------------------------------- | ------------------------------ |
| Development        | Development branch                                    | Disposable local test feedback |
| Preview            | Branch per preview, created from a clean preview base | Disposable PR feedback         |
| Production         | Production branch                                     | Real reader feedback           |

Do not create preview branches from a parent containing real comments. Use a schema-only
`preview-base` branch or a separate non-production Neon project.

## Connect Neon to Vercel

1. In the Vercel project, open **Storage**, install **Neon**, and connect a Postgres database.
2. Connect the database to the **Development**, **Preview**, and **Production** environments.
3. In the integration's advanced deployment settings, enable **Required** and enable database
   branching for **Preview** deployments.
4. Ensure Preview branches use the clean preview base. If the integration cannot select that
   parent, use a separate Neon project for Preview.
5. Add a different `FEEDBACK_HASH_SALT` secret to Development, Preview, and Production.
6. Redeploy after changing environment variables; Vercel does not add new variables to earlier
   deployments.

The application accepts either `DATABASE_URL` or `POSTGRES_URL`. The former is preferred.

## Migrations

`pnpm run build` applies pending migrations when a database connection is configured, before the
Next.js build. Migrations are tracked in `docs_feedback_migrations` and must never be edited after
they have been applied.

To migrate explicitly:

```bash
pnpm run db:migrate
```

For local development, create a disposable `development` branch in Neon. Copy `.env.example` to
`.env.local`, add that branch's pooled connection string and a local-only salt, then migrate and
start the website:

```bash
cd website
cp .env.example .env.local
# Edit .env.local; never point it at the Production branch.
pnpm run db:migrate
pnpm run dev
```

Next.js and the migration command both load `website/.env.local`. Alternatively, after configuring
Vercel's Development environment to use the disposable Neon branch, link the Vercel project and
pull its Development variables.

## Operational notes

- Preview submissions are isolated and may be deleted with their Neon branch.
- Production submissions are tagged with the Vercel environment, deployment URL, Git revision,
  documentation path, framework, and active section.
- The API stores a daily rotating hash for rate limiting, never the raw IP address.
- Periodically delete rate-limit rows older than two days and prune obsolete preview branches.
- Review records with `status = 'new'`; move them to `reviewed`, `resolved`, or `dismissed` during
  documentation triage.
