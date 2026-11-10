<!-- Generated from docs/content/headless/documents/metadata.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-metadata

Metadata for EmbedPDF: reads and changes a document's title, author and your own fields.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/metadata`   | [Metadata](https://www.embedpdf.com/docs/headless/react/documents/metadata)   |
| Vue     | `@embedpdf/vue/metadata`     | [Metadata](https://www.embedpdf.com/docs/headless/vue/documents/metadata)     |
| Svelte  | `@embedpdf/svelte/metadata`  | [Metadata](https://www.embedpdf.com/docs/headless/svelte/documents/metadata)  |
| Angular | `@embedpdf/angular/metadata` | [Metadata](https://www.embedpdf.com/docs/headless/angular/documents/metadata) |

## In React

A PDF carries information about itself: a title, an author, when it was made. Register
`metadataPlugin()` to show it in your UI and let people change it:

**`title-field.tsx`**

```tsx
import { useMetadata, useMetadataState } from '@embedpdf/react/metadata';

export function TitleField() {
  const { update, canUpdate } = useMetadata();
  const { metadata } = useMetadataState();

  return (
    <label>
      Title
      <input
        defaultValue={metadata?.title ?? ''}
        disabled={!canUpdate()}
        onBlur={(event) => update({ title: event.target.value })}
      />
    </label>
  );
}
```

What `useMetadataState()` gives you updates by itself: after your own changes, and on a shared
document, after someone else's. Nothing is read when a document opens: the metadata loads the
first time something asks for it, so a document nobody shows the properties of costs nothing.

## License

Apache-2.0
