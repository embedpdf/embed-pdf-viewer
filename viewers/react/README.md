# @embedpdf/react-pdf-viewer

React component for embedding PDF documents with full-featured viewing capabilities.

## Installation

```bash
npm install @embedpdf/react-pdf-viewer
# or
pnpm add @embedpdf/react-pdf-viewer
# or
yarn add @embedpdf/react-pdf-viewer
```

## Usage

```tsx
import { PDFViewer } from '@embedpdf/react-pdf-viewer';

function App() {
  return (
    <PDFViewer
      config={{
        src: '/document.pdf',
        theme: { preference: 'system' },
        zoom: { defaultLevel: 'fit-width' },
      }}
      style={{ width: '100%', height: '100vh' }}
      onReady={(registry) => {
        console.log('PDF viewer ready', registry);
      }}
    />
  );
}
```

## Props

| Prop        | Type                  | Description                              |
| ----------- | --------------------- | ---------------------------------------- |
| `config`    | `PDFViewerConfig`     | Full configuration object for the viewer |
| `className` | `string`              | CSS class name for the container         |
| `style`     | `CSSProperties`       | Inline styles for the container          |
| `onInit`    | `(container) => void` | Callback when viewer is initialized      |
| `onReady`   | `(registry) => void`  | Callback when registry is ready          |

The `config` prop accepts all configuration options from `@embedpdf/snippet`, including:

- `src` - URL or path to the PDF document
- `theme` - Theme configuration
- `zoom` - Zoom configuration
- `scroll` - Scroll configuration
- `annotations` - Annotation configuration
- And more...

## Accessing the Registry

Use a ref to access the viewer container and registry:

```tsx
import { useRef } from 'react';
import { PDFViewer, PDFViewerRef } from '@embedpdf/react-pdf-viewer';

function App() {
  const viewerRef = useRef<PDFViewerRef>(null);

  const handleClick = async () => {
    const registry = await viewerRef.current?.registry;
    // Use registry to access plugins
  };

  return (
    <>
      <PDFViewer
        ref={viewerRef}
        config={{ src: '/document.pdf' }}
        style={{ width: '100%', height: '100vh' }}
      />
      <button onClick={handleClick}>Get Registry</button>
    </>
  );
}
```

## Re-exports

This package re-exports everything from `@embedpdf/snippet`, so you can import types and utilities directly:

```tsx
import {
  PDFViewer,
  ZoomPlugin,
  ScrollPlugin,
  type PDFViewerConfig,
  type PluginRegistry,
} from '@embedpdf/react-pdf-viewer';
```

## License

MIT
