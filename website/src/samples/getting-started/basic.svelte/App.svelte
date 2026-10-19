<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';

  // The engine is created synchronously and costs nothing until first use, so
  // a module-scope `const engine = …` is safe — even under SSR. Only opening a
  // document does real work: the UI renders at t≈0.
  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin()];

  // The local engine opens bytes: fetch lazily, under the loading tab.
  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <div style="height: 500px">
    <!-- Document UI is defined over a document — gate it on having one. -->
    <DocumentGate>
      {#snippet fallback()}
        <p>Loading…</p>
      {/snippet}
      <Stage style="height: 100%">
        <RenderLayer />
      </Stage>
    </DocumentGate>
  </div>
</Viewer>
