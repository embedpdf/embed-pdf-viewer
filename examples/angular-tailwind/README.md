# Angular + Tailwind Live Docs Examples

This workspace is the source for the **live Angular examples embedded in the website docs** for `@embedpdf/angular-pdf-viewer`.

It is intentionally different from [`examples/angular-pdf-viewer`](../angular-pdf-viewer/):

- **`angular-pdf-viewer`** is the consumer-style demo app for the drop-in Angular package. It is the best place to see a minimal app setup and the wrapper-focused Playwright coverage.
- **`angular-tailwind`** is the docs example workspace. It contains multiple focused demos, a Tailwind-powered showcase shell, and build output that the Next.js docs site mounts inline.

## When to use this workspace

Use this workspace when you want to:

- work on the live Angular examples shown in the docs,
- add or update focused viewer/plugin demos,
- verify the Angular example components that the website mounts inline,
- or preview the Tailwind-styled Angular demo gallery locally.

If you want the quickest reference for **how an Angular app consumes** `@embedpdf/angular-pdf-viewer`, start with [`examples/angular-pdf-viewer`](../angular-pdf-viewer/).

## What this workspace contains

- A Tailwind-styled Angular demo shell served on `http://127.0.0.1:4301`
- Focused example components under `src/examples/viewer/*`
- A library build that exports those examples as `@embedpdf/example-angular-tailwind/viewer/*`
- Playwright coverage for the docs-demo workspace

The website uses those exports to mount Angular examples inside the React-rendered docs application.

## Scripts

- `pnpm dev` — run the live demo workspace locally on `http://127.0.0.1:4301`
- `pnpm build` — build both the demo app and the exported example library
- `pnpm preview` — preview the built app locally on `http://127.0.0.1:4301`
- `pnpm e2e` — run Playwright end-to-end tests for this workspace

## Relationship to the website docs

Angular docs examples import from this package via paths such as:

- `@embedpdf/example-angular-tailwind/viewer/viewer-example`
- `@embedpdf/example-angular-tailwind/viewer/zoom-example`

That means changes here affect both:

1. the standalone Angular demo workspace, and
2. the live Angular examples rendered inside `website/`.
