<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { commandsPlugin, standardCommands } from '@embedpdf/svelte/commands';
  import { Toolbar, group, item, type BarSchema } from '@embedpdf/svelte/toolbar';
  import { cloudEngine } from '@cloudpdf/engine';

  import './basic.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    annotationPlugin(),
    commandsPlugin({ commands: standardCommands }),
  ];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

  // Your icons, by the names the standard commands give them.
  const ICONS: Record<string, string> = {
    'previous-page': '‹',
    'next-page': '›',
    'zoom-out': '−',
    'zoom-in': '+',
    'fit-width': '↔',
    pointer: '↖',
    pan: '✥',
    highlight: '▍',
    underline: 'U̲',
    ink: '〰',
    download: '↓',
    print: '⎙',
  };

  const bar: BarSchema = {
    id: 'main',
    sections: {
      start: [group('pages', ['page:previous', 'page:next'])],
      center: [
        group('zoom', [
          'zoom:out',
          item('zoom:in', { variants: ['icon+label', 'icon'] }),
          item('zoom:fit-width', { variants: ['icon+label', 'icon'], importance: 2 }),
        ]),
      ],
      end: [
        group('tools', ['tool:pointer', 'tool:pan', 'tool:highlight', 'tool:underline', 'tool:ink'], {
          collapse: 'menu',
        }),
        group('document', [item('document:download', { importance: 5 }), 'document:print']),
      ],
    },
  };
</script>

<script lang="ts">
  // Narrow the toolbar to watch it make room: labels go first, then the tools fold, then "More".
  let width = $state(100);
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <label class="width">
      Toolbar width
      <input type="range" min={30} max={100} bind:value={width} />
      <output>{width}%</output>
    </label>
    <div class="frame" style:width="{width}%">
      <Toolbar {bar} class="toolbar">
        {#snippet command(cmd, variant, run)}
          <button
            type="button"
            class="button"
            title={cmd.label}
            aria-label={cmd.label}
            disabled={!cmd.enabled}
            aria-pressed={cmd.active}
            onclick={run}
          >
            <span class="icon" aria-hidden="true">
              {ICONS[cmd.icon ?? ''] ?? cmd.label.charAt(0)}
            </span>
            {#if variant === 'icon+label'}<span>{cmd.label}</span>{/if}
          </button>
        {/snippet}
      </Toolbar>
    </div>
    <Stage class="stage">
      <RenderLayer annotations={false} />
      <SelectionLayer />
      <AnnotationLayer />
    </Stage>
  </DocumentGate>
</Viewer>
