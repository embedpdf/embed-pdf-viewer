<!-- Generated from docs/content/headless/annotations/stamps.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-stamp

Stamps for EmbedPDF: libraries of stamps, placed by click or by code.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/stamp`   | [Stamps](https://www.embedpdf.com/docs/headless/react/annotations/stamps)   |
| Vue     | `@embedpdf/vue/stamp`     | [Stamps](https://www.embedpdf.com/docs/headless/vue/annotations/stamps)     |
| Svelte  | `@embedpdf/svelte/stamp`  | [Stamps](https://www.embedpdf.com/docs/headless/svelte/annotations/stamps)  |
| Angular | `@embedpdf/angular/stamp` | [Stamps](https://www.embedpdf.com/docs/headless/angular/annotations/stamps) |

## In React

A stamp is artwork you place on a page: "Approved", a company seal, a signature. The stamp plugin
keeps stamps in **libraries**, arms one for a click, and writes the placed stamp the way Acrobat
does, so it's the same stamp there.

Register `stampPlugin()` next to `annotationPlugin()`, and use `useStamp()`:

```ts
const { library } = await stamp.importLibrary(await loadDefaultLibrary('en'));
await stamp.armAsset(assetId); // the next click places it
```

## License

Apache-2.0
