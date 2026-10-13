<!-- The viewer with live props the test changes through the page's record. -->
<script lang="ts">
  import { PDFViewer, type PanelResizeEvent } from '@embedpdf/viewer-svelte';
  import type { LiveConfig, LivePropsRecord } from './live-props';

  let { record }: { record: LivePropsRecord } = $props();

  let live = $state.raw<LiveConfig>({
    src: '/sample.pdf',
    theme: 'light',
    locale: 'en',
    disable: [],
    readOnly: false,
  });
  let tag = $state('first');
  let label = $state('Hello');
  // The test drives the page through its record.
  $effect.pre(() => {
    record.set = (next) => (live = { ...live, ...next });
    record.setTag = (next) => (tag = next);
    record.rerender = () => (label = `${label}!`);
  });

  /** A new function for each tag: the viewer calls the latest one. */
  const resizedAs = (said: string) => (event: PanelResizeEvent) =>
    record.resized.push(`${said} ${event.id} ${event.width}`);
</script>

<!-- A new `commands` array whenever `label` changes: read once, so its change is ignored, with a
     warning. -->
<PDFViewer
  {...live}
  commands={[{ id: 'acme:hello', label, run: () => {} }]}
  style="height: 100vh; display: block"
  onready={(viewer) => record.viewers.push(viewer)}
  onpanelresize={resizedAs(tag)}
/>
