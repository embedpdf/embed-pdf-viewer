# @embedpdf/svelte-pdf-viewer

Svelte component for embedding PDF documents with full-featured viewing capabilities.

## Installation

```bash
npm install @embedpdf/svelte-pdf-viewer
# or
pnpm add @embedpdf/svelte-pdf-viewer
# or
yarn add @embedpdf/svelte-pdf-viewer
```

## Usage

```svelte
<script>
  import { PDFViewer } from '@embedpdf/svelte-pdf-viewer';

  const config = {
    src: '/document.pdf',
    theme: { preference: 'system' },
  };

  function onready(registry) {
    console.log('PDF viewer ready', registry);
  }
</script>

<PDFViewer {config} style="width: 100%; height: 100vh;" {onready} />
```

## Props

| Prop      | Type              | Description                                |
| --------- | ----------------- | ------------------------------------------ |
| `config`  | `PDFViewerConfig` | Full configuration object for the viewer   |
| `class`   | `string`          | CSS class name for the container           |
| `style`   | `string`          | Inline styles for the container            |
| `oninit`  | `function`        | Callback when the viewer is initialized    |
| `onready` | `function`        | Callback when the plugin registry is ready |

The `config` prop accepts all configuration options from `@embedpdf/snippet`, including:

- `src` - URL or path to the PDF document
- `theme` - Theme configuration
- `zoom` - Zoom configuration
- `scroll` - Scroll configuration
- `annotations` - Annotation configuration
- And more...

## Callbacks

The component uses Svelte 5 props for callbacks instead of events:

- `oninit(container: EmbedPdfContainer)` - Fired when the viewer container is initialized
- `onready(registry: PluginRegistry)` - Fired when the plugin registry is ready and plugins are loaded

## Accessing the Registry

You can access the registry via the `onready` callback:

```svelte
<script>
  import { PDFViewer } from '@embedpdf/svelte-pdf-viewer';

  function onready(registry) {
    // Use registry to access plugins
    const searchPlugin = registry.getPlugin('search');
  }
</script>

<PDFViewer
  config={{ src: '/document.pdf' }}
  style="width: 100%; height: 100vh;"
  {onready}
/>
```

## License

MIT
