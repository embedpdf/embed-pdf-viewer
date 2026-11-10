<!-- Generated from docs/content/headless/documents/pages.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-page-edit

Page editing for EmbedPDF: rotates, reorders, inserts and deletes pages.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/page-edit`   | [Organizing pages](https://www.embedpdf.com/docs/headless/react/documents/pages)   |
| Vue     | `@embedpdf/vue/page-edit`     | [Organizing pages](https://www.embedpdf.com/docs/headless/vue/documents/pages)     |
| Svelte  | `@embedpdf/svelte/page-edit`  | [Organizing pages](https://www.embedpdf.com/docs/headless/svelte/documents/pages)  |
| Angular | `@embedpdf/angular/page-edit` | [Organizing pages](https://www.embedpdf.com/docs/headless/angular/documents/pages) |

## In React

The page edit plugin changes the document's pages: rotate, reorder, delete, duplicate, and insert
new ones, blank or from another PDF. These are edits to the file, kept when it's downloaded. Register
`pageEditPlugin()` and use `usePageEdit()`:

```ts
await pageEdit.rotateBy([page.ref], 90);
await pageEdit.reorder([page.ref], 'start'); // to the front
await pageEdit.delete([page.ref]);
```

## License

Apache-2.0
