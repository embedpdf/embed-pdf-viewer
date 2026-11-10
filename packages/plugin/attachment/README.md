<!-- Generated from docs/content/headless/documents/attachments.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-attachment

Attachments for EmbedPDF: lists the files a PDF carries, and saves, adds and removes them.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/attachment`   | [Attachments](https://www.embedpdf.com/docs/headless/react/documents/attachments)   |
| Vue     | `@embedpdf/vue/attachment`     | [Attachments](https://www.embedpdf.com/docs/headless/vue/documents/attachments)     |
| Svelte  | `@embedpdf/svelte/attachment`  | [Attachments](https://www.embedpdf.com/docs/headless/svelte/documents/attachments)  |
| Angular | `@embedpdf/angular/attachment` | [Attachments](https://www.embedpdf.com/docs/headless/angular/documents/attachments) |

## In React

A PDF can carry other files: a spreadsheet with the numbers behind a report, the original of a
scanned contract. They sit in two places: the document's own attachments, and file attachment
annotations, a file pinned to a spot on a page. Register `attachmentPlugin()` to list both as one
list:

**`attachment-list.tsx`**

```tsx
import { displayNameOf, useAttachment, useAttachmentState } from '@embedpdf/react/attachment';
import type { AttachedFile } from '@embedpdf/react/attachment';
import { saveFile } from '@embedpdf/react/runtime';

export function AttachmentList() {
  const attachment = useAttachment();
  const { files, canDownload } = useAttachmentState();

  const save = async (file: AttachedFile) => {
    const { bytes, name, mimeType } = await attachment.download(file);
    saveFile(bytes, name, mimeType ?? undefined);
  };

  return (
    <ul>
      {files.map((file) => (
        <li key={file.id}>
          <bdi>{displayNameOf(file)}</bdi>
          <button disabled={!canDownload} onClick={() => save(file)}>
            Save
          </button>
        </li>
      ))}
    </ul>
  );
}
```

What `useAttachmentState()` gives you updates by itself: after your own changes, and on a shared
document, after someone else's. Nothing is read when a document opens: the attachments load the
first time something asks for them. The files on the pages come from the
[annotation plugin](https://www.embedpdf.com/docs/headless/react/annotations), when you've registered it.

## License

Apache-2.0
