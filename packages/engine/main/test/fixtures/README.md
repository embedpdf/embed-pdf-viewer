# Vendored engine-runtime corpus fixtures

Most files in this directory are authored in-repo for specific suites. Twelve
are copies from the engine-runtime fork's test corpus, vendored so the
conformance suites (`forms`, `actions`, `page-flatten`, `redaction-apply`,
`text-divergence` —
both the local-engine versions here and the cloud-parity versions in
`cloudpdf/engine/test/`) run without the `packages/engine/runtime/runtime-src`
submodule (a ~6.4 GB checkout that CI and most contributors never
initialise). This directory is the single canonical copy — don't duplicate
it per package:

- `toggle_fields.pdf`
- `orphan_widgets.pdf`
- `listbox_form.pdf`
- `document_aactions.pdf`
- `get_page_aaction.pdf`
- `annots_action_handling.pdf`
- `annot_javascript.pdf`
- `flatten_selective.pdf`
- `hello_world.pdf`
- `bug_1139.pdf`
- `bug_384770169.pdf`
- `embedpdf_astral_tounicode.pdf`

Source of truth: `testing/resources/` in <https://github.com/embedpdf/runtime>
(the PDFium fork; upstream PDFium fixtures are BSD-3-Clause, see the fork's
LICENSE). Copied from submodule commit
`608d50ef5719bb179e8c0a8377b3759bcb39f169`; the three text-divergence
fixtures were synced from runtime artifact commit
`fce2b000cc7a9e2cabc92db41cd57ca03233f07d`.

When bumping the submodule, re-sync if the fork changed these files:

```bash
cd packages/engine/runtime/runtime-src/testing/resources && cp \
  toggle_fields.pdf orphan_widgets.pdf listbox_form.pdf \
  document_aactions.pdf get_page_aaction.pdf annots_action_handling.pdf \
  annot_javascript.pdf flatten_selective.pdf hello_world.pdf \
  bug_1139.pdf bug_384770169.pdf embedpdf_astral_tounicode.pdf \
  ../../../../main/test/fixtures/
```

If the vendored list keeps growing, replace the manual copy with a sync
script instead of adding more entries here.
