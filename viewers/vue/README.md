# @embedpdf/vue-pdf-viewer

Vue 3 component for embedding PDF documents with full-featured viewing capabilities.

## Installation

```bash
npm install @embedpdf/vue-pdf-viewer
# or
pnpm add @embedpdf/vue-pdf-viewer
# or
yarn add @embedpdf/vue-pdf-viewer
```

## Usage

```vue
<template>
  <PDFViewer
    :config="{
      src: '/document.pdf',
      theme: { preference: 'system' },
    }"
    :style="{ width: '100%', height: '100vh' }"
    @ready="onReady"
  />
</template>

<script setup lang="ts">
import { PDFViewer } from '@embedpdf/vue-pdf-viewer';
import type { PluginRegistry } from '@embedpdf/vue-pdf-viewer';

function onReady(registry: PluginRegistry) {
  console.log('PDF viewer ready', registry);
}
</script>
```

## Props

| Prop     | Type              | Description                              |
| -------- | ----------------- | ---------------------------------------- |
| `config` | `PDFViewerConfig` | Full configuration object for the viewer |
| `class`  | `string`          | CSS class name for the container         |
| `style`  | `CSSProperties`   | Inline styles for the container          |

The `config` prop accepts all configuration options from `@embedpdf/snippet`, including:

- `src` - URL or path to the PDF document
- `theme` - Theme configuration
- `zoom` - Zoom configuration
- `scroll` - Scroll configuration
- `annotations` - Annotation configuration
- And more...

## Events

| Event   | Payload             | Description                        |
| ------- | ------------------- | ---------------------------------- |
| `init`  | `EmbedPdfContainer` | Emitted when viewer is initialized |
| `ready` | `PluginRegistry`    | Emitted when registry is ready     |

## Accessing the Registry

Use a template ref to access the viewer container and registry:

```vue
<template>
  <PDFViewer
    ref="viewerRef"
    :config="{ src: '/document.pdf' }"
    :style="{ width: '100%', height: '100vh' }"
  />
  <button @click="handleClick">Get Registry</button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { PDFViewer, type PDFViewerExpose } from '@embedpdf/vue-pdf-viewer';

const viewerRef = ref<PDFViewerExpose | null>(null);

async function handleClick() {
  const registry = await viewerRef.value?.registry;
  // Use registry to access plugins
}
</script>
```

## License

MIT
