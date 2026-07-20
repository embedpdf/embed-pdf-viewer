# Docs architecture — author once, render per framework

The law for how documentation is structured so that four frameworks never mean
four copies. Companion to `ADAPTERS.md` (which makes this possible: framework
parity is enforced by spec, so "one page of prose + per-framework code" is
rendering, not aspiration).

## The two halves

```
/docs
  /viewer      → the ready-made viewer (snippet + wrappers)
  /headless    → the adapter packages (@embedpdf/react|vue|svelte|angular)
  /engine      → engine choice (local wasm vs cloud), runtime, server
```

- **Viewer docs are framework-agnostic by nature** — the snippet's config
  object IS the API. Framework appears only in tiny install tabs (the wrapper
  packages). One tree, no switcher, cheapest to write. Ship first.
- **Headless docs carry the framework switcher.** One source page per
  vertical (the ADAPTERS.md table is the sitemap: stage, render, selection,
  annotation, form, search, …). Prose is shared; code and API names render
  per framework.

## Author once, render per framework

One MDX file per topic. Framework-specific URLs are GENERATED from it:

```
src/content/docs/headless/annotation.mdx
  → /docs/headless/react/annotation
  → /docs/headless/vue/annotation
  → /docs/headless/svelte/annotation
  → /docs/headless/angular/annotation
```

Why per-framework URLs instead of one URL + client switcher: SEO indexes
framework-specific content, links can pin a framework, analytics see per-
framework readership. The catch-all route strips the framework segment,
renders the shared MDX with the framework in context, and
`generateStaticParams` emits the page × framework matrix. The switcher in the
docs header just navigates to the sibling route (choice persisted, deep links
win over persistence).

Inside a page:

- `<FwCode name="annotation/quickstart" />` — renders the framework's sample.
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
website/samples/
  package.json          → depends on @embedpdf/react (etc.), workspace:*
  react/annotation/quickstart.tsx
  vue/annotation/quickstart.vue
  svelte/annotation/quickstart.svelte
  angular/annotation/quickstart.ts
```

- `pnpm --filter @embedpdf/website-samples typecheck` runs in CI: an API
  change fails the build until the docs move with it. This is the docs
  equivalent of the consume gate.
- The MDX pipeline (extend ee/website's remark/rehype code-example plugins)
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

1. `/docs/viewer` — framework-agnostic, unblocks the launch story.
2. `/docs/headless/react/*` — the complete vertical set, proving the
   author-once machinery.
3. Vue/Svelte/Angular routes go live per vertical as adapters land — the
   generated matrix keeps the gaps honest instead of hidden.
