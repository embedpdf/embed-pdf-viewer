# Plugin UI - Svelte Implementation

This is the Svelte 5 implementation of the UI Plugin for EmbedPDF. It provides a complete UI management system with support for toolbars, panels, menus, and custom components.

## Features

- **Registries**: Manage anchors, components, and renderers
- **Hooks**: Reactive utilities for UI state and rendering
- **Components**: Provider and auto-menu renderer
- **Type-safe**: Full TypeScript support with Svelte 5 runes

## Quick Start

### 1. Setup UIProvider

Wrap your viewer layout with the `UIProvider` component:

```svelte
<script lang="ts">
  import { UIProvider } from '@embedpdf/plugin-ui/svelte';
  import ToolbarRenderer from './ToolbarRenderer.svelte';
  import PanelRenderer from './PanelRenderer.svelte';
  import MenuRenderer from './MenuRenderer.svelte';

  let { documentId } = $props();
</script>

<UIProvider
  {documentId}
  components={{
    'thumbnail-panel': ThumbnailPanel,
    'bookmark-panel': BookmarkPanel,
  }}
  renderers={{
    toolbar: ToolbarRenderer,
    panel: PanelRenderer,
    menu: MenuRenderer,
  }}
>
  {#snippet children()}
    <ViewerLayout />
  {/snippet}
</UIProvider>
```

### 2. Render Toolbars and Panels

Use `useSchemaRenderer` to get toolbar and panel information:

```svelte
<script lang="ts">
  import { useSchemaRenderer } from '@embedpdf/plugin-ui/svelte';

  let { documentId } = $props();

  const { getToolbarInfo, getPanelInfo } = useSchemaRenderer(() => documentId);

  const topToolbar = $derived(getToolbarInfo('top', 'main'));
  const leftPanel = $derived(getPanelInfo('left', 'main'));
</script>

<!-- Render toolbar -->
{#if topToolbar}
  {@const ToolbarRenderer = topToolbar.renderer}
  <ToolbarRenderer
    schema={topToolbar.schema}
    documentId={topToolbar.documentId}
    isOpen={topToolbar.isOpen}
    onClose={topToolbar.onClose}
  />
{/if}

<!-- Render panel -->
{#if leftPanel}
  {@const PanelRenderer = leftPanel.renderer}
  <PanelRenderer
    schema={leftPanel.schema}
    documentId={leftPanel.documentId}
    isOpen={leftPanel.isOpen}
    onClose={leftPanel.onClose}
  />
{/if}
```

### 3. Register Anchors for Menus

Use `useRegisterAnchor` with Svelte actions:

```svelte
<script lang="ts">
  import { useRegisterAnchor } from '@embedpdf/plugin-ui/svelte';

  let { documentId, itemId } = $props();

  const registerAnchor = useRegisterAnchor(documentId, itemId);
</script>

<button use:registerAnchor> Click me </button>
```

## API Reference

### Components

#### UIProvider

Main provider component that sets up all registries and auto-renders menus.

**Props:**

- `documentId: string` - Document ID for this UI context
- `components?: Record<string, Component>` - Custom component registry
- `renderers: UIRenderers` - Required renderers (toolbar, panel, menu)
- `menuContainer?: HTMLElement | null` - Optional menu portal container
- `children: Snippet` - Child content

#### AutoMenuRenderer

Automatically renders menus when opened (included in UIProvider).

### Hooks

#### useUIState(getDocumentId)

Get reactive UI state for a document.

```svelte
<script lang="ts">
  const { state, provides } = useUIState(() => documentId);
</script>
```

#### useUICapability()

Get the UI plugin capability.

```svelte
<script lang="ts">
  const capability = useUICapability();
  const schema = $derived(capability.provides?.getSchema());
</script>
```

#### useUISchema()

Get the UI schema with a reactive getter.

```svelte
<script lang="ts">
  const { schema } = useUISchema();
  // Access schema reactively via the getter
  $effect(() => {
    console.log(schema); // Automatically reactive
  });
</script>
```

#### useSchemaRenderer(getDocumentId)

High-level hook for rendering UI from schema.

```svelte
<script lang="ts">
  const { getToolbarInfo, getPanelInfo } = useSchemaRenderer(() => documentId);
</script>
```

#### useRegisterAnchor(documentId, itemId)

Register a DOM element as a menu anchor.

```svelte
<script lang="ts">
  const registerAnchor = useRegisterAnchor(documentId, 'my-item');
</script>

<button use:registerAnchor>Button</button>
```

#### useRegisterComponent(id, component)

Register a custom component for use in UI schema.

```svelte
<script lang="ts">
  useRegisterComponent('my-component', MyComponent);
</script>
```

#### useItemRenderer()

Helper utilities for building renderers.

```svelte
<script lang="ts">
  const { getCustomComponent } = useItemRenderer();
  const MyComponent = getCustomComponent('my-component-id');
</script>
```

### Registries

All registries are automatically provided by `UIProvider`:

- **AnchorRegistry**: Tracks DOM elements for menu positioning
- **ComponentRegistry**: Stores custom components
- **RenderersRegistry**: Provides user-supplied renderers

You can access them directly if needed:

```svelte
<script lang="ts">
  import {
    useAnchorRegistry,
    useComponentRegistry,
    useRenderers,
  } from '@embedpdf/plugin-ui/svelte';

  const anchorRegistry = useAnchorRegistry();
  const componentRegistry = useComponentRegistry();
  const renderers = useRenderers();
</script>
```

## Types

### UIRenderers

```typescript
interface UIRenderers {
  toolbar: Component<ToolbarRendererProps>;
  panel: Component<PanelRendererProps>;
  menu: Component<MenuRendererProps>;
}
```

### ToolbarRendererProps

```typescript
interface ToolbarRendererProps {
  schema: ToolbarSchema;
  documentId: string;
  isOpen: boolean;
  onClose?: () => void;
  className?: string;
}
```

### PanelRendererProps

```typescript
interface PanelRendererProps {
  schema: PanelSchema;
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}
```

### MenuRendererProps

```typescript
interface MenuRendererProps {
  schema: MenuSchema;
  documentId: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  container?: HTMLElement | null;
}
```

## Examples

See the `/examples/svelte-tailwind` directory for a complete working example.

## Svelte 5 Runes

This implementation uses Svelte 5 runes:

- `$state` - For reactive state
- `$derived` - For computed values
- `$effect` - For side effects
- `$props` - For component props

Make sure your project is configured to use Svelte 5.
