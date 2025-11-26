<script lang="ts">
  import type { Snippet } from 'svelte';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { Rotation } from '@embedpdf/models';
  import PendingRedactions from './pending-redactions.svelte';
  import MarqueeRedact from './marquee-redact.svelte';
  import SelectionRedact from './selection-redact.svelte';
  import type { RedactionSelectionMenuRenderFn, RedactionSelectionMenuProps } from '../types';

  interface RedactionLayerProps {
    /** The ID of the document this layer belongs to */
    documentId: string;
    /** Index of the page this layer lives on */
    pageIndex: number;
    /** Current render scale for this page */
    scale?: number;
    /** Page rotation (for counter-rotating menus, etc.) */
    rotation?: Rotation;
    /** Render function for selection menu (schema-driven approach) */
    selectionMenu?: RedactionSelectionMenuRenderFn;
    /** Snippet for custom selection menu (slot-based approach) */
    selectionMenuSnippet?: Snippet<[RedactionSelectionMenuProps]>;
  }

  let {
    documentId,
    pageIndex,
    scale,
    rotation,
    selectionMenu,
    selectionMenuSnippet,
  }: RedactionLayerProps = $props();

  const documentState = useDocumentState(() => documentId);

  const actualScale = $derived(scale !== undefined ? scale : (documentState.current?.scale ?? 1));

  const actualRotation = $derived(
    rotation !== undefined ? rotation : (documentState.current?.rotation ?? Rotation.Degree0),
  );
</script>

<PendingRedactions
  {documentId}
  {pageIndex}
  scale={actualScale}
  rotation={actualRotation}
  {selectionMenu}
  {selectionMenuSnippet}
/>
<MarqueeRedact {documentId} {pageIndex} scale={actualScale} />
<SelectionRedact {documentId} {pageIndex} scale={actualScale} />
