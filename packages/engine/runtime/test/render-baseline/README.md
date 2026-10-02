# Render baselines

Byte-exact render digests for the runtime in this package. Record a baseline
with the runtime you trust, change the runtime, and check: any render whose bytes
differ, any case that went missing, and any change in how a document fails is
reported, and the check exits non-zero.

```sh
# from packages/engine/runtime
node test/render-baseline/render-baseline.mjs record --runtime wasm --profile fast
# … rebuild the runtime …
node test/render-baseline/render-baseline.mjs check --runtime wasm --profile fast
```

Run both `--runtime wasm` and `--runtime native`. Baselines are per platform:
the native runtime uses the system's fonts and the platform's floating-point
code, so its bytes legitimately differ from WASM. A baseline is also per machine,
which is why baselines live in `.render-baseline/` (ignored by git), named
`<runtime>-<platform>-<profile>.json`.

## What is rendered

- **Documents:** every PDF tracked in the repository, the PDFium test corpus in
  `runtime-src/testing/resources`, and every PDF in the directories listed in
  `RENDER_BASELINE_EXTRA` (separated like `PATH`). The fast profile takes the
  engine fixtures, every eighth PDFium document and all extra documents; the
  release profile takes all of them. Set `RENDER_BASELINE_PDFIUM` when the
  runtime source lives elsewhere, as in a worktree whose submodule is not
  initialized.
- **Pages:** the first page (fast), or the first five and the last (release).
- **Variants:** see [`variants.mjs`](./variants.mjs). `engine` variants render
  the way the engine does: a page loaded with rotation normalized to 0,
  `FPDF_RenderPageBitmapWithMatrix`, BGRA with reversed byte order, the viewer's
  rotation and tile region in the matrix. `classic` variants use
  `FPDF_RenderPageBitmap` with the page's own rotation and other bitmap formats.
  Pages with more than 200,000 objects get a short variant list.

Every render loads and closes its own page, so no render sees state another one
left behind.

## Options

| Option                 | Meaning                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `--profile`            | `fast` (default) or `release`                                   |
| `--baseline <file>`    | where to read (check) or write (record) the baseline            |
| `--out <file>`         | check: also write this run, to diff or promote it               |
| `--wasm-binary <file>` | render with another `embedpdf.wasm`, without replacing the file |
| `--only <text>`        | only documents whose id contains the text                       |
| `--image-budget <MB>`  | decoded images kept across page loads, in MB (128; 0 for none)  |
| `--slice-ms <ms>`      | render `engine` variants in slices of this budget (0: finest)   |
| `--high-heap`          | wasm: take the low 2 GiB of the heap first (addresses ≥ 2 GiB)  |
| `--jobs <n>`           | worker processes (default: half the cores, at most 4)           |
| `--timeout <seconds>`  | per document (default 300)                                      |
| `--strict`             | check: also fail on cases the baseline does not have            |

With `--slice-ms`, `engine` variants render through
`EPDF_RenderPageBitmapWithMatrix_Start` / `EPDF_RenderPage_Continue`, pausing
once the budget has passed, as the engine renders a page so that it can be
cancelled. The digests must match a baseline recorded without it. The run also
reports how long the longest slice of each render took: PDFium pauses only
between objects and within image stretching, so a form, a transparency group or
an image decode can run past the budget.

Each document renders in a worker process, so a crash or a timeout is recorded
for that document (`crashed:<signal>`, `timeout`) and the run continues.
Documents that fail to open or to load a page record the failure; those are
compared like digests.

## Timing a page

[`../render-perf/render-perf.mjs`](../render-perf/render-perf.mjs) times the
viewer's work on one page: the 640 px base render, 20 zoomed tiles, 12
deep-zoom tiles and the base again, loading the page for every render
(`--mode fresh`, as the engine does per job) or once (`--mode kept`).
