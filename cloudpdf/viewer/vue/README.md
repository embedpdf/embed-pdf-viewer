<!-- Generated from docs/content/viewer/quick-start.mdx and docs/content/viewer/features/index.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @cloudpdf/viewer-vue

A complete PDF viewer as a Vue component, with CloudPDF as its engine: the file stays on the server, and pages arrive as images.

## Quick start

This guide adds the viewer to your app, then makes it yours in four small steps. Each step works on
its own, so stop whenever it's enough.

### 1. Install

```sh
npm install @cloudpdf/viewer-vue
```

The package brings everything: the toolbar and panels, and the engine that opens your documents on
CloudPDF, which renders the pages. Only Stamps and Signatures load WebAssembly, the first time
someone opens them.

### 2. Show a PDF

Give the viewer a document and a height:

**`first.vue`**

```vue
<script setup lang="ts">
import { PDFViewer } from '@cloudpdf/viewer-vue';
</script>

<template>
  <PDFViewer :src="{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }" style="height: 100vh" />
</template>
```

`grant` is public access from the CloudPDF dashboard, which needs no backend; this one opens our
demo document. In your app, open each document with a token your backend creates for the user: see
[Documents](https://www.cloudpdf.com/docs/viewer/vue/documents).

The viewer fills the box you give it, so it needs a height: a fixed one, `100vh`, or the rest of a
flex layout. People can now scroll, zoom, search, select text, annotate, fill in forms, sign and
download.

## All features

Most features are on from the start; measuring, redaction, building forms and snapshots wait until
you turn them on. Turn features on or off with `features`, by the name in the first column:

```js
{ features: { measurement: true, redaction: true, comments: false } }
```

| Feature       | What people can do                                                                           | On from the start | Settings                                                                                                |
| :------------ | :------------------------------------------------------------------------------------------- | :---------------- | :------------------------------------------------------------------------------------------------------ |
| `annotations` | Highlight, underline and strike out text; draw; add notes, text boxes and callouts           | yes               | [Annotations](https://www.cloudpdf.com/docs/viewer/vue/features/annotations)                            |
| `shapes`      | Draw rectangles, circles, lines, arrows and polygons                                         | yes               | [Annotations](https://www.cloudpdf.com/docs/viewer/vue/features/annotations#the-tools)                  |
| `comments`    | Comment on annotations and reply, in a panel with every thread                               | yes               | [Annotations](https://www.cloudpdf.com/docs/viewer/vue/features/annotations#comments)                   |
| `stamps`      | Place stamps: the standard ones, their own, or images                                        | yes               | [Annotations](https://www.cloudpdf.com/docs/viewer/vue/features/annotations#stamps)                     |
| `signatures`  | Draw, type or upload a signature; sign fields; check signatures                              | yes               | [Forms & signatures](https://www.cloudpdf.com/docs/viewer/vue/features/forms-and-signatures#signatures) |
| `forms`       | Fill in forms; build them in the Form mode                                                   | Filling only      | [Forms & signatures](https://www.cloudpdf.com/docs/viewer/vue/features/forms-and-signatures)            |
| `redaction`   | Mark text and areas, then remove them from the file for good                                 | no                | [Annotations](https://www.cloudpdf.com/docs/viewer/vue/features/annotations#redaction)                  |
| `measurement` | Measure distances, perimeters and areas at the drawing's scale                               | no                | [Annotations](https://www.cloudpdf.com/docs/viewer/vue/features/annotations#measurements)               |
| `pages`       | Rotate, move, insert, duplicate and delete pages in the thumbnails panel, each step undoable | yes               | [Panels](https://www.cloudpdf.com/docs/viewer/vue/customize/panels#organize-pages)                      |
| `attachments` | See, save, attach and remove files inside the PDF                                            | yes               | [Panels](https://www.cloudpdf.com/docs/viewer/vue/customize/panels#the-attachments)                     |
| `search`      | Find text, with every match highlighted and listed                                           | yes               | [`plugins.search`](https://www.cloudpdf.com/docs/headless/vue/text/search#settings)                     |
| `text`        | Select and copy text                                                                         | yes               | [`plugins.selection`](https://www.cloudpdf.com/docs/headless/vue/text/selection#settings)               |
| `snapshots`   | Copy or save part of a page as a picture                                                     | no                | [Documents](https://www.cloudpdf.com/docs/viewer/vue/documents#take-a-snapshot)                         |
| `thumbnails`  | A picture of every page, to jump around                                                      | yes               | [Panels](https://www.cloudpdf.com/docs/viewer/vue/customize/panels)                                     |
| `outline`     | The document's table of contents                                                             | yes               | [Panels](https://www.cloudpdf.com/docs/viewer/vue/customize/panels)                                     |
| `documents`   | Open other files (with the local engine), download, print, several documents in tabs         | yes               | [Documents](https://www.cloudpdf.com/docs/viewer/vue/documents)                                         |

## Documentation

- [Quick start](https://www.cloudpdf.com/docs/viewer/vue/quick-start): Install the viewer, show a PDF, give it your color and your own button, put your own component in the toolbar, and talk to it from code.
- [Setup](https://www.cloudpdf.com/docs/viewer/vue/setup): Sizing, server-side rendering, the engine, and several viewers on a page.
- [Layout](https://www.cloudpdf.com/docs/viewer/vue/customize/layout): Toolbars at the bottom, on the side, floating, or several at once.
- [Theming](https://www.cloudpdf.com/docs/viewer/vue/customize/theming): Your colors, light and dark, and the look of every part.

## License

Apache-2.0
