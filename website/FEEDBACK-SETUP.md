# Documentation feedback

Docs feedback is **platform telemetry**, not site infrastructure
(see `../DOCS-PLATFORM-ARCHITECTURE.md`).

The widget (`Feedback` from `@embedpdf/docs-kit`) posts to the site's
same-origin `/api/docs/feedback` route. That route enriches the payload with
build facts — framework (from the docs path), the engine flavour this site
documents, the deployed revision, and the environment — and forwards it to
the control-plane:

```
POST {CLOUDPDF_PLATFORM_INTERNAL_URL}/v1/public/docs-feedback
```

The control-plane validates, rate-limits, and stores it (`docs_feedback`
table); triage lives in the Admin UI under **Docs feedback**, with status
changes recorded in the audit log.

## Environment

| Variable | Purpose |
| --- | --- |
| `CLOUDPDF_PLATFORM_INTERNAL_URL` | Control-plane base URL. Preview deploys point at staging; production at production. Unset → the route answers 503 and the widget shows its error state. |

The browser's `Origin` header is passed through; the control-plane accepts
only origins on its trusted-origins allowlist (`config.auth.trustedOrigins`).

No database, no migrations, and no salt live in this site for feedback any
more. The historical Neon-backed pipeline (schema in `db/`) is retired; the
`db/` machinery currently remains only for the search index, until search
moves to the per-deploy artifact model (phase 4 of the platform
architecture).
