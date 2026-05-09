# Angular PDF Viewer Demo

This example is a **modern Angular 21.2 zoneless** demo app for `@embedpdf/angular-pdf-viewer`.

It serves two purposes:

- Manual verification of the drop-in viewer UX
- End-to-end validation via Playwright

## Scripts

- `pnpm dev` — run the demo app locally on `http://127.0.0.1:4300`
- `pnpm build` — production build
- `pnpm e2e` — run Playwright end-to-end tests

## Turbo usage

Run this suite through Turbo:

- `pnpm e2e:angular-pdf-viewer`

Or run all e2e tasks in the monorepo:

- `pnpm e2e`
