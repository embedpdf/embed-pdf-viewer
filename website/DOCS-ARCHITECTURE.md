# Docs architecture — author once, render per integration

The law for how documentation is structured so that five integrations never mean
five copies. Companion to `ADAPTERS.md` (which makes this possible: framework
parity is enforced by spec, so "one page of prose + per-framework code" is
rendering, not aspiration).

## The two halves

```
/docs
  /viewer      → the ready-made viewer (snippet + wrappers)
  /headless    → the adapter packages (@embedpdf/react|vue|svelte|angular)
  /engine      → engine choice (local wasm vs cloud), runtime, server
```

- **Viewer docs carry the shared integration switcher** for Vanilla JS, React, Vue,
  Svelte, and Angular. The config API and prose remain shared; installation and
  code examples resolve from the integration in the URL.
- **Headless docs carry the same integration switcher**, limited to React, Vue,
  Svelte, and Angular. One source page per
  vertical (the ADAPTERS.md table is the sitemap: stage, render, selection,
  annotation, form, search, …). Prose is shared; code and API names render
  per framework.

Viewer and Headless share one persisted integration preference. Switching
products carries React, Vue, Svelte, or Angular with you. Vanilla JS falls back
to React when entering Headless because no Vanilla headless adapter exists.
The concrete URL remains the source of truth; the preference only resolves
variant-less courtesy routes.

## Author once, render per integration

One MDX file per topic. Integration-specific URLs are GENERATED from it:

```
src/content/docs/headless/annotation.mdx
  → /docs/headless/react/annotation
  → /docs/headless/vue/annotation
  → /docs/headless/svelte/annotation
  → /docs/headless/angular/annotation
```

Viewer pages use the same fan-out model:

```
src/content/docs/viewer/getting-started.mdx
  → /docs/viewer/vanilla/getting-started
  → /docs/viewer/react/getting-started
  → /docs/viewer/vue/getting-started
  → /docs/viewer/svelte/getting-started
  → /docs/viewer/angular/getting-started
```

Why per-integration URLs instead of one URL + client switcher: SEO indexes
integration-specific content, links can pin an integration, analytics see per-
integration readership. The catch-all route strips the integration segment,
renders the shared MDX with the integration in context, and
`generateStaticParams` emits the page × integration matrix. The switcher in the
docs header just navigates to the sibling route (choice persisted, deep links
win over persistence).

Inside a page:

- `<Example name="annotation/quickstart" />` — renders the active integration's sample.
- `<Fw react>…</Fw>` — rare prose branches. If a page needs many of these,
  it's a smell: either the wording should be framework-neutral (see
  terminology map) or the page belongs in the per-framework fork set.
- The fork set is EXPLICIT and small: installation/scaffolding and SSR
  integration (Next/Nuxt/SvelteKit/Angular) are separate per-framework pages.

**Terminology map** (one page, linked from every headless page): hook =
composable = store = inject function; `<Viewer>` = `<EpdfViewer>`; etc.
Prose says "the selection hook" and means all four. Writing style guide:
never narrate JSX composition in shared prose.

## Code samples are real code, compiled in CI

The cure for docs rot: samples never live inline in MDX. They live as real
files, type-checked against the actual packages:

```
website/src/samples/
  package.json          → depends on @embedpdf/react (etc.), workspace:*
  react/annotation/quickstart.tsx
  vue/annotation/quickstart.vue
  svelte/annotation/quickstart.svelte
  angular/annotation/quickstart.ts
```

- `pnpm --filter @embedpdf/website-samples typecheck` runs in CI: an API
  change fails the build until the docs move with it. This is the docs
  equivalent of the consume gate.
- The MDX pipeline (extend cloudpdf/website's remark/rehype code-example plugins)
  inlines the file at build time with shiki highlighting.
- A missing sample for a framework renders an honest "not yet ported for
  {framework}" callout — driven by file presence, not hand-maintained flags.

## The support matrix is generated, not written

During the rollout (React complete → Vue/Svelte/Angular incremental), every
vertical's page shows its framework support honestly. The matrix derives from
two machine sources: the adapter's exports map (does the vertical exist?) and
sample presence (is it documented?). Angular's `check-parity.mjs` PENDING set
is the same data — one source of truth, surfaced in docs.

## v2 docs afterlife

- Current v2 site: frozen static build at `v2.embedpdf.com`, banner linking
  to current docs. Never rots, never maintained.
- 301 map from the old 200-page URL space into the new tree lives in
  `next.config.ts` `redirects()` — written once at launch, SEO preserved.
- Docs version switcher: just a link to the archive. No in-tree versioning.

## Rollout order

1. `/docs/viewer` — launch the ready-made Viewer integrations first.
2. `/docs/headless/react/*` — the complete vertical set, proving the
   author-once machinery.
3. Vue/Svelte/Angular routes go live per vertical as adapters land — the
   generated matrix keeps the gaps honest instead of hidden.
