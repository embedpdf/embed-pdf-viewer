<!-- Generated from docs/content/headless/forms/index.mdx and docs/content/headless/forms/building.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-form

PDF forms for EmbedPDF: fills in fields and builds forms.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/form`   | [Filling forms](https://www.embedpdf.com/docs/headless/react/forms)   |
| Vue     | `@embedpdf/vue/form`     | [Filling forms](https://www.embedpdf.com/docs/headless/vue/forms)     |
| Svelte  | `@embedpdf/svelte/form`  | [Filling forms](https://www.embedpdf.com/docs/headless/svelte/forms)  |
| Angular | `@embedpdf/angular/form` | [Filling forms](https://www.embedpdf.com/docs/headless/angular/forms) |

## In React

Many PDFs are forms: text boxes, checkboxes, dropdowns, signature fields. Register `formPlugin()` and
put `<FormLayer>` in each page, and people can fill them in:

**`form-layer.tsx`**

```tsx
import { FormLayer, formPlugin } from '@embedpdf/react/form';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { Viewer } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { engine } from './pdf';

const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

export function FormViewer() {
  return (
    <Viewer engine={engine} plugins={plugins}>
      <Stage>
        {() => (
          <>
            <RenderLayer />
            <FormLayer />
          </>
        )}
      </Stage>
    </Viewer>
  );
}
```

Each field becomes a real HTML control, placed and styled like the field in the PDF: people type in text
boxes, tick checkboxes, pick from lists, and move between fields with Tab. A value is saved into the
document as it's entered, so it's there when the PDF is downloaded, and every PDF app shows it. The
form layer paints the fields as the engine draws them, so while it's on the page, the render layer
leaves them out of the page picture.

## Documentation

- [Building forms](https://www.embedpdf.com/docs/headless/react/forms/building): Turn any PDF into a form: place text boxes, checkboxes, radio buttons, lists and signature fields, and change their settings.

## License

Apache-2.0
