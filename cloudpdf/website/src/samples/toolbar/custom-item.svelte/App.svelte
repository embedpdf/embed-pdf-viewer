<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { commandsPlugin, standardCommands } from '@embedpdf/svelte/commands';
  import { Toolbar, custom, group, item, type BarSchema } from '@embedpdf/svelte/toolbar';
  import { cloudEngine } from '@cloudpdf/engine';
  import GoToPage from './GoToPage.svelte';
  import PageNumber from './PageNumber.svelte';

  import '../custom-item.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [stagePlugin(), renderPlugin(), commandsPlugin({ commands: standardCommands })];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

  // The page number is an item of your own: it gets smaller first, and in the "More" menu it's the
  // 'page:go-to' command.
  const bar: BarSchema = {
    id: 'main',
    sections: {
      start: [group('zoom', ['zoom:out', 'zoom:in', item('zoom:fit-width', { importance: 2 })])],
      center: [
        group('pages', [
          'page:previous',
          custom('page-number', 'page:go-to', { variants: ['full', 'compact'] }),
          'page:next',
        ]),
      ],
      end: [group('document', [item('document:download', { variants: ['icon+label', 'icon'] })])],
    },
  };

  const ICONS: Record<string, string> = {
    'previous-page': '‹',
    'next-page': '›',
    'zoom-out': '−',
    'zoom-in': '+',
    'fit-width': '↔',
    download: '↓',
  };
</script>

<script lang="ts">
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
      <Toolbar {bar}>
        {#snippet command(cmd, variant, run)}
          <button
            type="button"
            class="button"
            title={cmd.label}
            aria-label={cmd.label}
            disabled={!cmd.enabled}
            onclick={run}
          >
            <span aria-hidden="true">{ICONS[cmd.icon ?? ''] ?? '…'}</span>
            {#if variant === 'icon+label'}<span>{cmd.label}</span>{/if}
          </button>
        {/snippet}
        {#snippet custom(name, variant)}
          {#if name === 'page-number'}
            <PageNumber compact={variant === 'compact'} />
          {/if}
        {/snippet}
      </Toolbar>
    </div>
    <GoToPage />
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
