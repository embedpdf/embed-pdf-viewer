<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import Controls from './Controls.svelte';
  import type { Pin } from './pin';

  import '../pins.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin()];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<script lang="ts">
  // One pin to start with: an inch in from the first page's top-left corner.
  let pins = $state<Pin[]>([{ pageIndex: 0, point: { x: 72, y: 72 } }]);
  // Where the pointer went down: a press that moved was a drag to scroll, not a click.
  let pressed = { x: 0, y: 0 };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <Controls last={pins[pins.length - 1] ?? null} onClear={() => (pins = [])} />
    <Stage class="stage">
      <RenderLayer />
      <!-- What's drawn here sits over the page and never turns with it, so it converts with
           pageToView, which includes the turn. -->
      {#snippet pageChrome(page)}
        <div
          class="surface"
          role="presentation"
          onpointerdown={(event) => (pressed = { x: event.clientX, y: event.clientY })}
          onclick={(event) => {
            const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
            if (moved > 4) return;
            // A pointer event, to a point on the page.
            const point = page.toPagePoint(event.clientX, event.clientY);
            pins.push({ pageIndex: page.pageIndex, point });
          }}
        >
          {#if page.pageIndex === 0}
            <!-- Many things at once: the browser maps page points with one matrix. -->
            <div class="page-space" style:transform={page.transform.cssMatrix}>
              <div class="inch">1 inch</div>
            </div>
          {/if}
          {#each pins.filter((pin) => pin.pageIndex === page.pageIndex) as pin, index (index)}
            <!-- A point on the page, to pixels on it: at the last moment. -->
            {@const at = page.transform.pageToView(pin.point)}
            <div class="pin" style:left="{at.x}px" style:top="{at.y}px"></div>
          {/each}
        </div>
      {/snippet}
    </Stage>
  </DocumentGate>
</Viewer>
