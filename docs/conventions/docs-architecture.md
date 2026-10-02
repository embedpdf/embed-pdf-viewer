# Docs architecture — author once, render per integration

The law for how documentation is structured so that five integrations never
mean five copies. Framework parity makes this possible: "one page of prose +
per-framework code" is rendering, not aspiration.

Website source paths below are relative to `website/`; paths beginning with
`/docs` are public documentation URLs.

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
  Svelte, and Angular. There is one source page per feature: stage, render,
  selection, annotation, form, search, and so on. Prose is shared; code and API
  names render per framework.

Viewer and Headless share one persisted integration preference. Switching
products carries React, Vue, Svelte, or Angular with you. Vanilla JS falls back
to React when entering Headless because no Vanilla headless adapter exists.
The concrete URL remains the source of truth; the preference only resolves
variant-less courtesy routes.

## Author once, render per integration

One MDX file per topic. Integration-specific URLs are generated from it:

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
- The fork set is explicit and small: installation/scaffolding and SSR
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
- The MDX pipeline (each site's remark/rehype code-example plugins) reads the
  files at compile time and highlights them with shiki. An `<Example>` or
  `<Snippet>` keeps its code out of the compiled page: each framework's files go
  to a JSON file in `.next/cache/docs-code/`, keyed by the sample's name and a
  hash of the files, and the page only names the key and the frameworks that
  have a version. The page's server component (`RouteExample`) reads the
  route's framework's files at render (docs-kit `mdx/code-panels`). Inlined, four
  frameworks made page modules megabytes each, and the docs route, which
  compiles every page, ran the dev server out of memory.
- A missing sample for a framework renders an honest "not yet ported for
  {framework}" callout — driven by file presence, not hand-maintained flags.

## The reference is complete, and checked

Every headless plugin page ends with its reference: `## Methods` (everything
`use<Plugin>()` gives you), `## State` (everything `use<Plugin>State()` gives
you, with the getter that reads each value once), then
`## Settings`, `## Events` and `## Permissions`. The rows are written by hand,
in plain words, each linking to the section that shows it.

- Every public member of a plugin's capability is on exactly one page: a
  Methods row, a State row's getter, or an Events row. A plugin spread over
  several pages splits by its nouns (`annotation.selection.*` on Selecting).
- `docs/content/reference.mjs` says which pages document which capability.
  `docs/content/scripts/reference.mjs` reads each capability interface from its
  TypeScript source and fails on a member no page lists, a member on two pages,
  or a listed name the capability doesn't have. It runs in `docs:check`.
- The pages describe the API the code is moving to. Where they're ahead, the
  name is `pending` in the manifest, with why; the check fails once a pending
  entry is no longer needed, so the list only shrinks.
- The same check compares the tables with the declarations next to each
  contract, once a plugin has them: a State table's `Field` column with its
  `defineState()` fields, a Settings table's `Setting` column with its settings
  defaults (a row may name a group), and every `From CSS` column with
  `EPDF_VARIABLES` in `@embedpdf/web`, both ways.

## A page goes live when its code does

The pages describe the API the code is moving to, so a page isn't shown as
released until its code exists. Two machine checks decide it, per page and per
framework, and run in `docs:check`:

- `docs/content/scripts/snippets.mjs` compiles each framework's snippets against
  the packages in the same commit (React with `tsc`, Angular with `ngc` and
  `strictTemplates`, Vue with `vue-tsc`, Svelte with `svelte-check`) and writes
  `generated/snippet-status.json`. It never fails the build.
- `docs/content/scripts/publish-gate.mjs` writes `generated/live-pages.json`: a
  page is live for a framework when its snippets compile for it and none of the
  names its Methods, State or Events tables list is `pending`.

Live examples (`docs/content/samples/`) are complete apps, so every one must compile.
`docs/content/scripts/samples.mjs` checks them straight from `docs/content`, without syncing them
into a site or starting one, reports per framework (React with `tsc`, Angular with `ngc`, Vue
with `vue-tsc`, Svelte with `svelte-check`; Angular and Vue with `strictTemplates`) and fails on
an error:

```sh
pnpm --filter @embedpdf/docs-content samples          # every example
pnpm --filter @embedpdf/docs-content samples search   # one area's examples
```

Both checks share `scripts/compile.mjs`: each framework's compiler and options, and a run
directory of their own in the system's temporary directory, whose `node_modules` links to the
embedpdf.com site's, so several can run at the same time. (Never under a `node_modules` path:
`svelte-check` reports nothing for a file there.) Every run also compiles a canary per framework,
with a missing export, a missing module and a template naming nothing: a compiler that doesn't
report all three isn't checking, and the framework fails. An Angular file that declares a component,
directive or pipe without exporting it fails too: ngc can't type-check a template that uses it the
usual way, and then stops reporting template errors in every file. Vue snippets allow components they
don't import (a snippet may use a global or a Nuxt auto-import); examples don't. Each site's
`check:samples` runs the same example check on what it ships (`samples.mjs --root src/samples`):
the synced copy, in every framework, the cloud form included on cloudpdf.com.

### An example in each framework

```
samples/<area>/<name>.react.tsx       one file per framework…
samples/<area>/<name>.vue.vue
samples/<area>/<name>.svelte.svelte
samples/<area>/<name>.angular.ts      (root component `export class App`, selector `demo-root`)
samples/<area>/<name>.vue/App.vue     …or a directory, entry first (`App.svelte`,
samples/<area>/<name>.vue/Toolbar.vue   `App.tsx`; Angular's is `app.ts`)
samples/<area>/<name>.css             the one stylesheet every framework's version uses
```

React, Vue and Svelte import the stylesheet (`import './<name>.css'`, `'../<name>.css'` from a
directory). Angular names it in `styleUrl: './<name>.css'` with
`encapsulation: ViewEncapsulation.None`, and writes its template inline. The code view shows each
framework's files with the stylesheet after the entry. In the demo builds both forms become the
same stylesheet, scoped to the example's class (`src/lib/sample-stylesheets.ts` in each site);
the Angular pass compiles in the browser (JIT), so it first applies Angular's JIT transform,
without which `input()`, `output()`, `model()` and `viewChild()` do nothing
(`src/lib/angular-demo-samples.ts`).

The checks and the demos read the adapters' source through their workspace `exports`: Vue's
point at `./src/<entry>.ts` as plain strings, like React's; Svelte's name the same file under
`types`, `svelte` and `default`. Never only under `development`, which the demo builds don't use.
The checks map `@embedpdf/angular/*` to its source (`compile.mjs`); the Angular demos use its
build.

A page that isn't live shows its title and a notice that it describes 3.0 for
that framework, linking to the React version when that one is live; it stays out
of `llms.txt`, that framework's search index and search engines. With
`DOCS_PREVIEW=1` (the preview site, and `next dev` unless `DOCS_PREVIEW=0`),
every page is live under a banner. The sites read the gate through
`@embedpdf/docs-kit/publish`. Both generated files are built, never committed.

## The support matrix is generated, not written

During the rollout (React complete → Vue/Svelte/Angular incremental), every
vertical's page shows its framework support honestly. The matrix derives from
two machine sources: the adapter's exports map (does the vertical exist?) and
sample presence (is it documented?). Angular's `check-parity.mjs` `PENDING` set
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
