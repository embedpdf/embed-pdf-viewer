# @embedpdf/plugin-watermark

A plugin for [EmbedPDF](https://www.embedpdf.com) that allows embedding text or image watermarks into PDF pages at specific coordinates.

## Features

- **Text watermarks** — customisable font, size, colour, and opacity
- **Image watermarks** — accepts PNG and JPEG input data
- **Image rotation** — rotation is applied consistently for image watermarks
- **Precise positioning** — place watermarks at exact PDF coordinates
- **Alignment-aware placement** — optional top/centre/bottom + left/centre/right alignment, including rotated pages
- **Repeat tiling** — repeat watermarks horizontally, vertically, or both
- **Optimised tiling** — one watermark appearance object is reused across all tiles via XObject references
- **Page range control** — apply to all pages or specific page indices
- **Configurable flags** — read-only, printable, rotation support
- **Auto-apply** — optionally apply watermarks automatically when documents load
- **Per-document scope** — watermarks added in one document are not applied to other open documents

## Installation

```bash
pnpm add @embedpdf/plugin-watermark
```

## Usage

```typescript
import { WatermarkPluginPackage } from '@embedpdf/plugin-watermark';

// Register with your viewer
const viewer = createViewer({
  plugins: [
    // ... other plugins
    [WatermarkPluginPackage, {
      autoApply: true,
      watermarks: [
        {
          type: 'text',
          textOptions: {
            text: 'CONFIDENTIAL',
            fontSize: 60,
            colour: '#FF0000',
          },
          position: { x: 100, y: 400 },
          size: { width: 400, height: 80 },
          opacity: 0.3,
          rotation: -45,
          repeat: 'both',
          repeatSpacing: { x: 40, y: 80 },
          pageRange: 'all',
          readOnly: true,
          printable: true,
        },
      ],
    }],
  ],
});
```

### Adding watermarks programmatically

```typescript
const watermark = viewer.getCapability('watermark');

// Text watermark
watermark.addWatermark({
  type: 'text',
  textOptions: { text: 'DRAFT', fontSize: 48, colour: '#888888' },
  position: { x: 150, y: 300 },
  size: { width: 300, height: 60 },
  opacity: 0.2,
  rotation: -30,
  repeat: 'horizontal',
  repeatSpacing: { x: 60 },
  pageRange: 'all',
});

// Image watermark
watermark.addWatermark({
  type: 'image',
  imageOptions: { data: logoArrayBuffer, mimeType: 'image/png' },
  position: { x: 50, y: 700 },
  size: { width: 100, height: 100 },
  opacity: 0.4,
  rotation: -25,
  repeat: 'vertical',
  repeatSpacing: { y: 40 },
  pageRange: [0, 1, 2], // first three pages only
});
```

### Removing watermarks

`removeWatermark(id)` removes the **definition from the active document only**.

Because this plugin flattens watermarks into page content, already-applied watermark visuals are permanent in the modified PDF and cannot be removed in-place.

```typescript
watermark.removeWatermark(watermarkId);
```

### Clearing watermarks from a document

```typescript
watermark.clearFromDocument(documentId);
```

`clearFromDocument(documentId)` clears internal placement tracking for that document.
It does **not** remove already-flattened watermark visuals from page content.

## API

### `WatermarkCapability`

| Method | Description |
|--------|-------------|
| `addWatermark(input)` | Add and apply a watermark to the active document; returns the generated ID |
| `removeWatermark(id)` | Remove a watermark definition from the active document (already-flattened content remains) |
| `getWatermarks()` | Get watermark definitions for the active document |
| `applyToDocument(documentId)` | Apply all watermarks registered for that document |
| `clearFromDocument(documentId)` | Clear placement tracking for that document (flattened content remains) |
| `onWatermarkChange` | Event hook for watermark definition changes |

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `watermarks` | `WatermarkInput[]` | `[]` | Watermarks to register on initialisation |
| `autoApply` | `boolean` | `true` | Auto-apply watermarks when a document loads |

### `WatermarkInput` repeat options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `repeat` | `'none' \| 'horizontal' \| 'vertical' \| 'both'` | `'none'` | Repeat the watermark across each target page |
| `repeatSpacing` | `{ x?: number; y?: number }` | `{ x: 0, y: 0 }` | Spacing (PDF points) between repeated instances |

### `WatermarkInput` alignment options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `alignment.horizontal` | `'left' \| 'center' \| 'right'` | _unset_ | Horizontal anchor within each page |
| `alignment.vertical` | `'top' \| 'center' \| 'bottom'` | _unset_ | Vertical anchor within each page |

When `alignment` is set, it determines the base origin before repeat expansion. If `alignment` is omitted, `position` is used directly.

## Tiling strategy

The plugin uses an XObject tiling path first:

- A single watermark appearance (text or image) is created once.
- All repeated placements reference that same appearance object.
- This reduces per-tile work and keeps saved PDFs smaller.

If the XObject path cannot be applied safely for a document/page, the plugin falls back to the existing sequential stamp+flatten path.

## Acceptance checks

Validate each row in the matrix below in both viewer preview and exported/saved output:

| Repeat mode | Text watermark | Image watermark | Preview vs export parity |
|-------------|----------------|-----------------|--------------------------|
| `none` | ✅ | ✅ | visually identical |
| `horizontal` | ✅ | ✅ | visually identical |
| `vertical` | ✅ | ✅ | visually identical |
| `both` | ✅ | ✅ | visually identical |

Additional checks:

- Inspect the saved PDF: repeated instances reuse one appearance object (XObject references), rather than embedding full per-tile duplicates.
- Compare file size against a sequential-only baseline; XObject path should be smaller for repeated watermarks.

## Licence

MIT
