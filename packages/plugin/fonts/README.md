<!-- Generated from docs/content/headless/documents/fonts.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-fonts

Fonts for EmbedPDF: lists the fonts a document can be written in, and draws text in a browser as the engine writes it.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/fonts`   | [Fonts](https://www.embedpdf.com/docs/headless/react/documents/fonts)   |
| Vue     | `@embedpdf/vue/fonts`     | [Fonts](https://www.embedpdf.com/docs/headless/vue/documents/fonts)     |
| Svelte  | `@embedpdf/svelte/fonts`  | [Fonts](https://www.embedpdf.com/docs/headless/svelte/documents/fonts)  |
| Angular | `@embedpdf/angular/fonts` | [Fonts](https://www.embedpdf.com/docs/headless/angular/documents/fonts) |

## In React

Text the engine writes, in a free text box, a form field or a redaction label, is in the font its
`fontFamily` names. Register `fontsPlugin()` to list the fonts a document can be written in, and to
draw text in a browser in the very font the engine will write it with:

**`font-select.tsx`**

```tsx
import { useFontsState } from '@embedpdf/react/fonts';

export function FontSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (font: string) => void;
}) {
  const { fonts } = useFontsState();
  const choosable = fonts?.fonts.filter((font) => font.canChoose) ?? [];

  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {choosable.map((font) => (
        <option key={font.name} value={font.name}>
          {font.name}
        </option>
      ))}
    </select>
  );
}
```

The annotation and form layers use the plugin by themselves: with it, text being typed shows in
the fonts the engine writes it with; without it, in the standard font the engine falls back to.
Nothing is read when a document opens: the fonts are read the first time something asks for them.

## License

Apache-2.0
