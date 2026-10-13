<!--
  <CloudPDFViewer>: the full viewer wired to CloudPDF, a cloud door and nothing more. It renders the
  open-source <PDFViewer> from `@embedpdf/viewer-svelte/core`, the door where `engine` is required,
  and supplies that engine from the cloud options through `resolveCloudConfig`. The core door
  registers no default engine, so the local PDFium engine (its wasm, worker and recipe) is not part
  of startup: the stamp libraries import it the first time someone opens Stamps or Signatures.

  Every other option, your components inside it, `onready` and `usePDFViewer()` work here unchanged
  (see `@embedpdf/viewer-svelte`).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { resolveCloudConfig } from '@cloudpdf/viewer/config';
  import { PDFViewer } from '@embedpdf/viewer-svelte/core';
  import type { CloudPDFViewerProps } from './props';

  let { element = $bindable(null), children, ...props }: CloudPDFViewerProps = $props();

  // The engine, documents and plugins are made from the cloud options once, when the viewer starts,
  // like every prop that isn't live; the rest passes through as the props change.
  const { engine, documents, plugins } = untrack(() => resolveCloudConfig(props));
  const options = $derived(resolveCloudConfig(props));
</script>

<PDFViewer {...options} {engine} {documents} {plugins} {children} bind:element />
