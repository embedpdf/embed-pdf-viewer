# Angular PDF Viewer Demo

This example is a **modern Angular 21.2 zoneless** demo app for `@embedpdf/angular-pdf-viewer`.

It serves two purposes:

- Manual verification of the drop-in viewer UX with config-driven customization
- End-to-end validation that Angular config and runtime registry hooks reach the snippet correctly

## What this example demonstrates

- `disabledCategories: ['annotation']` to remove annotation tools from the UI
- `theme.preference: 'light'` for deterministic color mode
- A custom Angular-red accent via `theme.light.accent`
- A runtime toolbar customization via `(ready)`, `commands.registerCommand()`, and `ui.mergeSchema()`
- An Angular-owned config panel, toggled by a runtime-injected `Config` button, that can animate open/closed, live-toggle theme mode, and expose up to four checkbox-based view options for annotations, search, sidebar, and zoom controls

## Related Angular example workspace

If you are looking for the **live examples embedded in the website docs**, see [`examples/angular-tailwind`](../angular-tailwind/).

That workspace has a different job:

- **`angular-pdf-viewer`** — the consumer-style demo app for validating the drop-in package in a realistic Angular app
- **`angular-tailwind`** — the docs-example workspace that exports multiple focused Angular demos for `website/`

Start here when you want the clearest reference for integrating `@embedpdf/angular-pdf-viewer` into an application. Jump to `angular-tailwind` when you want to work on the docs demos themselves.

## Scripts

- `pnpm dev` — run the demo app locally on `http://127.0.0.1:4300`
- `pnpm build` — production build
- `pnpm e2e` — run Playwright end-to-end tests

## Turbo usage

Run this suite through Turbo:

- `pnpm e2e:angular-pdf-viewer`

Or run all e2e tasks in the monorepo:

- `pnpm e2e`
