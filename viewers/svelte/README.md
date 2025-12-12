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

  function onReady(event) {
    console.log('PDF viewer ready', event.detail);
  }
</script>

<PDFViewer {config} style="width: 100%; height: 100vh;" on:ready={onReady} />
```

## Props

| Prop     | Type              | Description                              |
| -------- | ----------------- | ---------------------------------------- |
| `config` | `PDFViewerConfig` | Full configuration object for the viewer |
| `class`  | `string`          | CSS class name for the container         |
| `style`  | `string`          | Inline styles for the container          |

The `config` prop accepts all configuration options from `@embedpdf/snippet`, including:

- `src` - URL or path to the PDF document
- `theme` - Theme configuration
- `zoom` - Zoom configuration
- `scroll` - Scroll configuration
- `annotations` - Annotation configuration
- And more...

## Events

| Event   | Detail              | Description                      |
| ------- | ------------------- | -------------------------------- |
| `init`  | `EmbedPdfContainer` | Fired when viewer is initialized |
| `ready` | `PluginRegistry`    | Fired when registry is ready     |

## Accessing the Registry

Use bind: directives to access the viewer container and registry:

```svelte
<script>
  import { PDFViewer } from '@embedpdf/svelte-pdf-viewer';

  let container;
  let registry;

  async function handleClick() {
    const reg = await registry;
    // Use registry to access plugins
  }
</script>

<PDFViewer
  bind:container
  bind:registry
  config={{ src: '/document.pdf' }}
  style="width: 100%; height: 100vh;"
/>
<button on:click={handleClick}>Get Registry</button>
```

## License

MIT
