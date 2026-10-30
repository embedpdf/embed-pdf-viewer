# Dashboard screenshots

The pictures of the CloudPDF dashboard in cloudpdf.com's Platform docs. A script takes every one
of them by driving the real dashboard, so nobody edits a screenshot by hand, and when the dashboard
changes, one run brings every picture up to date.

```sh
CLOUDPDF_DOCS_EMAIL=… CLOUDPDF_DOCS_PASSWORD=… pnpm --filter @embedpdf/docs-content screenshots
… screenshots grant-dialog grant-embed      # only these two are saved; the rest still run
```

Each picture lands in `cloudpdf/website/public/docs/platform/<name>.png`, and its size in
`cloudpdf/website/src/generated/platform-screenshots.json`. A page shows one with
`<Screenshot name="…" alt="…" />`, and a page that names a picture the script never made fails the
build.

## What it needs

- The dashboard running with its control plane, an engine, and the account site for signing in.
  `CLOUDPDF_DOCS_APP` names the dashboard (`http://localhost:3320` by default).
- An account that belongs to a workspace named `CLOUDPDF_DOCS_WORKSPACE` (`Fernquill Studio` by
  default) with SaaS access.
- The control plane's public engine address set to `https://engine.cloudpdf.com` and its link
  address to `https://cloudpdf.link`, so the code and links in the pictures are the ones readers
  get.
- Google Chrome (`CHROME_PATH` names another).

The script fills the workspace with the docs' own Fernquill PDFs (from `public/pdfs`) the first
time, and leaves what is already there.

## The rules every picture follows

- **Made-up company, made-up data.** The workspace is Fernquill's, and its documents are the
  docs' PDFs. No real customer, person or key is ever in a picture.
- **No secrets.** An API key's value is replaced before the picture is taken, and the run revokes
  the keys it made.
- **The next click is ringed.** One blue ring per picture, on what the step says to click.
- **Taken at 2x, cropped to what matters.** A dialog on a plain background, or the window with its
  sidebar when where something is matters.
- **Calm pixels.** No animations, no text cursor, no focus rings, no development overlays.
